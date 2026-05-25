// src-main/artifacts/artifact-index-store.ts
// 产物索引存储
// 来源：02-工作区/ArtifactIndex产物索引设计、12-实现落地/StorageLayout

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import type { ArtifactIndexEntry, ArtifactStatus } from '../contracts/types'
import { validateArtifactIndexEntry } from '../validation/structure'
import { validateArtifactTransition } from '../validation/state-transition'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

/**
 * 产物索引存储
 * 管理 artifact-index.json 的读写
 */
export class ArtifactIndexStore {
  /**
   * 读取整个产物索引
   */
  async readIndex(workspaceRootPath: string): Promise<Result<ArtifactIndexEntry[]>> {
    const resolver = new PathResolver(workspaceRootPath)
    const indexPath = resolver.artifactIndexPath()

    const exists = await JsonStore.exists(indexPath)
    if (!exists) {
      return ok([])
    }

    const result = await JsonStore.read<ArtifactIndexEntry[]>(indexPath)
    if (!result.ok) return result
    return ok(result.data)
  }

  /**
   * 写入整个产物索引
   */
  async writeIndex(workspaceRootPath: string, entries: ArtifactIndexEntry[]): Promise<Result<void>> {
    const resolver = new PathResolver(workspaceRootPath)
    return JsonStore.write(resolver.artifactIndexPath(), entries)
  }

  /**
   * 按 ID 查找产物
   */
  async getById(workspaceRootPath: string, artifactId: string): Promise<Result<ArtifactIndexEntry | null>> {
    const indexResult = await this.readIndex(workspaceRootPath)
    if (!indexResult.ok) return indexResult as Result<never>

    const entry = indexResult.data.find(e => e.id === artifactId) ?? null
    return ok(entry)
  }

  /**
   * 按任务 ID 查找所有产物
   */
  async listByTask(workspaceRootPath: string, taskId: string): Promise<Result<ArtifactIndexEntry[]>> {
    const indexResult = await this.readIndex(workspaceRootPath)
    if (!indexResult.ok) return indexResult as Result<never>

    return ok(indexResult.data.filter(e => e.taskId === taskId))
  }

  /**
   * 追加一条产物索引
   */
  async appendEntry(workspaceRootPath: string, entry: ArtifactIndexEntry): Promise<Result<void>> {
    const indexResult = await this.readIndex(workspaceRootPath)
    if (!indexResult.ok) return indexResult as Result<never>

    // 校验结构
    const validation = validateArtifactIndexEntry(entry)
    if (!validation.ok) {
      return err(createError('ARTIFACT_CREATE_FAILED', 'artifact', 'Artifact validation failed', {
        detail: validation.issues,
      }))
    }

    // 检查 ID 不重复
    if (indexResult.data.some(e => e.id === entry.id)) {
      return err(createError('ARTIFACT_CREATE_FAILED', 'artifact', `Artifact "${entry.id}" already exists`))
    }

    indexResult.data.push(entry)
    return this.writeIndex(workspaceRootPath, indexResult.data)
  }

  /**
   * 更新产物状态
   */
  async updateStatus(
    workspaceRootPath: string,
    artifactId: string,
    newStatus: ArtifactStatus,
    reason?: string,
  ): Promise<Result<ArtifactIndexEntry>> {
    const indexResult = await this.readIndex(workspaceRootPath)
    if (!indexResult.ok) return indexResult as Result<never>

    const entry = indexResult.data.find(e => e.id === artifactId)
    if (!entry) {
      return err(createError('ARTIFACT_NOT_FOUND', 'artifact', `Artifact "${artifactId}" not found`))
    }

    // 校验状态迁移
    const transition = validateArtifactTransition(entry.status, newStatus, artifactId)
    if (!transition.ok) {
      return err(createError('ARTIFACT_CREATE_FAILED', 'artifact',
        `Invalid status transition: ${entry.status} → ${newStatus}`, {
          detail: transition.issues,
        }))
    }

    entry.status = newStatus
    entry.updatedAt = new Date().toISOString()
    return this.writeIndex(workspaceRootPath, indexResult.data).then(r => {
      if (!r.ok) return r as Result<never>
      return ok(entry)
    })
  }

  /**
   * 将旧产物标记为 superseded（被替代）
   */
  async supersedeArtifact(
    workspaceRootPath: string,
    oldArtifactId: string,
    newArtifactId: string,
  ): Promise<Result<void>> {
    const indexResult = await this.readIndex(workspaceRootPath)
    if (!indexResult.ok) return indexResult as Result<never>

    const oldEntry = indexResult.data.find(e => e.id === oldArtifactId)
    if (!oldEntry) {
      return err(createError('ARTIFACT_NOT_FOUND', 'artifact', `Artifact "${oldArtifactId}" not found`))
    }

    // 只有 active/ready 的产物可以被 supersede
    if (oldEntry.status === 'ready' || oldEntry.status === 'updated') {
      oldEntry.status = 'archived' // 简化：标记为 archived
      oldEntry.updatedAt = new Date().toISOString()
    }

    // 建立关联
    if (!oldEntry.relatedArtifactIds.includes(newArtifactId)) {
      oldEntry.relatedArtifactIds.push(newArtifactId)
    }

    return this.writeIndex(workspaceRootPath, indexResult.data)
  }
}
