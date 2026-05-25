// src-main/artifacts/artifact-service.ts
// 产物服务：产物索引、正文写入和产物状态管理
// 来源：02-工作区/ArtifactIndex产物索引设计、12-实现落地/StorageLayout、产物类型注册表

import fs from 'node:fs/promises'
import path from 'node:path'
import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import { ArtifactIndexStore } from './artifact-index-store'
import { ArtifactTypeRegistry, createBuiltinArtifactTypeRegistry } from './artifact-type-registry'
import type { ArtifactIndexEntry, ArtifactStatus } from '../contracts/types'
import { validateArtifactIndexEntry } from '../validation/structure'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

export class ArtifactService {
  private indexStore: ArtifactIndexStore
  private typeRegistry: ArtifactTypeRegistry

  constructor(typeRegistry?: ArtifactTypeRegistry) {
    this.indexStore = new ArtifactIndexStore()
    this.typeRegistry = typeRegistry ?? createBuiltinArtifactTypeRegistry()
  }

  /**
   * 创建产物：写正文 + 写索引
   * 来源：模块接口I/O契约 - ArtifactService.createArtifact
   * 来源：持久化一致性与恢复规则 - 创建新Artifact写入顺序
   */
  async createArtifact(input: {
    workspaceRootPath: string
    conversationId?: string | null
    taskId?: string | null
    artifactType: string
    title: string
    format: 'markdown' | 'json' | 'jsonl'
    content: string
    createdByRole: string
    createdFromNode?: string | null
  }): Promise<Result<ArtifactIndexEntry>> {
    const resolver = new PathResolver(input.workspaceRootPath)

    // 1. 检查 artifactType 是否已注册
    if (!this.typeRegistry.isRegistered(input.artifactType)) {
      return err(createError('ARTIFACT_CREATE_FAILED', 'artifact',
        `Artifact type "${input.artifactType}" is not registered`, {
          recoverable: true,
          suggestedAction: 'Register the artifact type first or use ExperimentalArtifact.',
        }))
    }

    // 2. 生成 artifactId 和路径
    const artifactId = `artifact_${Date.now()}`
    const contentDir = path.join(resolver.artifactsDir, input.taskId ?? 'shared')
    const ext = input.format === 'markdown' ? 'md' : input.format
    const contentPath = path.join(contentDir, `${artifactId}.${ext}`)
    const relativePath = path.relative(resolver.workspaceDir, contentPath)

    // 3. 写正文文件
    try {
      await fs.mkdir(contentDir, { recursive: true })
      await fs.writeFile(contentPath, input.content, 'utf-8')
    } catch (e) {
      return err(createError('ARTIFACT_CREATE_FAILED', 'artifact',
        `Failed to write artifact content: ${e}`, { recoverable: false }))
    }

    // 4. 构造索引条目
    const now = new Date().toISOString()
    const entry: ArtifactIndexEntry = {
      id: artifactId,
      title: input.title,
      type: input.artifactType,
      node: input.createdFromNode ?? '',
      taskId: input.taskId ?? '',
      status: 'draft',
      path: relativePath,
      relatedArtifactIds: [],
      createdAt: now,
      updatedAt: now,
    }

    // 5. 写入 ArtifactIndex
    const indexResult = await this.indexStore.appendEntry(input.workspaceRootPath, entry)
    if (!indexResult.ok) {
      // 正文已写但索引失败 → 记录 orphan_artifact_file
      return err(createError('ARTIFACT_CREATE_FAILED', 'artifact',
        `Content written but index failed for "${artifactId}"`, {
          recoverable: true,
          suggestedAction: 'Check artifact-index.json. Content file exists as orphan.',
          detail: indexResult.error,
        }))
    }

    return ok(entry)
  }

  /**
   * 获取产物（索引 + 可选正文）
   */
  async getArtifactById(
    workspaceRootPath: string,
    artifactId: string,
    includeContent: boolean = false,
  ): Promise<Result<{ index: ArtifactIndexEntry; content?: string }>> {
    const entryResult = await this.indexStore.getById(workspaceRootPath, artifactId)
    if (!entryResult.ok) return entryResult as Result<never>

    const entry = entryResult.data
    if (!entry) {
      return err(createError('ARTIFACT_NOT_FOUND', 'artifact', `Artifact "${artifactId}" not found`))
    }

    let content: string | undefined
    if (includeContent) {
      const resolver = new PathResolver(workspaceRootPath)
      const fullPath = path.join(resolver.workspaceDir, entry.path)
      try {
        content = await fs.readFile(fullPath, 'utf-8')
      } catch {
        // 正文缺失，索引存在
        content = undefined
      }
    }

    return ok({ index: entry, content })
  }

  /**
   * 更新产物状态
   */
  async updateArtifactStatus(
    workspaceRootPath: string,
    artifactId: string,
    toStatus: ArtifactStatus,
    reason?: string,
  ): Promise<Result<ArtifactIndexEntry>> {
    return this.indexStore.updateStatus(workspaceRootPath, artifactId, toStatus, reason)
  }

  /**
   * 按任务列出产物
   */
  async listArtifactsByTask(
    workspaceRootPath: string,
    taskId: string,
  ): Promise<Result<ArtifactIndexEntry[]>> {
    return this.indexStore.listByTask(workspaceRootPath, taskId)
  }

  /**
   * 解析产物的完整文件路径
   */
  resolveArtifactPath(workspaceRootPath: string, entry: ArtifactIndexEntry): string {
    const resolver = new PathResolver(workspaceRootPath)
    return path.join(resolver.workspaceDir, entry.path)
  }

  /**
   * 获取产物类型注册表
   */
  getTypeRegistry(): ArtifactTypeRegistry {
    return this.typeRegistry
  }
}
