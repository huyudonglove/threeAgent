// src-main/storage/workspace-manager.ts
// 工作区初始化、读写和恢复

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PathResolver } from './path-resolver'
import { JsonStore } from './json-store'
import { getUserDataPath } from './electron-user-data'
import type { WorkspaceManifest, WorkspaceIndex, WorkspaceIndexEntry, EnvironmentFingerprint, TaskRuntime } from '../contracts/types'
import { validateWorkspaceManifest } from '../validation/structure'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

export class WorkspaceManager {
  private indexPath: string
  private userDataPath: string

  constructor(options?: { indexPath?: string; userDataPath?: string }) {
    this.userDataPath = options?.userDataPath ?? getUserDataPath()
    if (options?.indexPath) {
      this.indexPath = options.indexPath
    } else {
      this.indexPath = path.join(this.userDataPath, 'workspace-index.json')
    }
  }

  /**
   * 初始化新工作区：创建目录结构和初始 manifest
   */
  async initWorkspace(rootPath: string, name?: string): Promise<Result<WorkspaceManifest>> {
    const resolver = new PathResolver(rootPath)

    // 检查是否已存在
    const exists = await JsonStore.exists(resolver.manifestPath)
    if (exists) {
      return err(createError('WS_ALREADY_EXISTS', 'workspace', `Workspace already exists at ${rootPath}`, {
        recoverable: true,
        suggestedAction: 'Use readManifest to load the existing workspace.',
      }))
    }

    // 创建所有子目录
    try {
      for (const dir of resolver.allDirs) {
        await fs.mkdir(dir, { recursive: true })
      }
    } catch (e) {
      return err(createError('WS_INIT_FAILED', 'workspace', `Failed to create directories: ${e}`, {
        recoverable: false,
      }))
    }

    const now = new Date().toISOString()
    const workspaceId = `ws-${Date.now()}`
    const manifest: WorkspaceManifest = {
      id: workspaceId,
      name: name ?? pathBasename(rootPath),
      description: '',
      rootPath,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
      activeRunId: null,
      components: {
        conversations: 'conversations',
        artifacts: 'artifacts',
        displayTrace: 'display-trace',
        agentMemory: 'agent-memory',
        domains: 'domains',
        roles: 'roles',
        skills: 'skills',
        logs: 'logs',
        modelConfig: 'model-config',
      },
    }

    const writeResult = await JsonStore.write(resolver.manifestPath, manifest)
    if (!writeResult.ok) return writeResult as Result<never>

    // 成功后自动 upsert 到全局 WorkspaceIndex
    await this.upsertToIndex(manifest)

    return ok(manifest)
  }

  /**
   * 读取 WorkspaceManifest
   */
  async readManifest(rootPath: string): Promise<Result<WorkspaceManifest>> {
    const resolver = new PathResolver(rootPath)
    const result = await JsonStore.read<WorkspaceManifest>(resolver.manifestPath)
    if (!result.ok) return result

    const validation = validateWorkspaceManifest(result.data)
    if (!validation.ok) {
      return err(createError('WS_STATE_INVALID', 'workspace', 'Manifest validation failed', {
        detail: validation.issues,
      }))
    }

    return ok(result.data)
  }

  /**
   * 写入 WorkspaceManifest
   */
  async writeManifest(rootPath: string, manifest: WorkspaceManifest): Promise<Result<void>> {
    const validation = validateWorkspaceManifest(manifest)
    if (!validation.ok) {
      return err(createError('WS_STATE_INVALID', 'workspace', 'Manifest validation failed', {
        detail: validation.issues,
      }))
    }
    const resolver = new PathResolver(rootPath)
    const updated = { ...manifest, updatedAt: new Date().toISOString() }
    return JsonStore.write(resolver.manifestPath, updated)
  }

  /**
   * 从磁盘恢复工作区入口状态
   */
  async recoverWorkspace(rootPath: string): Promise<Result<WorkspaceManifest>> {
    const resolver = new PathResolver(rootPath)

    // 检查目录是否存在
    const dirExists = await JsonStore.exists(resolver.workspaceDir)
    if (!dirExists) {
      return err(createError('WS_NOT_FOUND', 'workspace', `No workspace found at ${rootPath}`, {
        recoverable: true,
        suggestedAction: 'Initialize the workspace first using initWorkspace.',
      }))
    }

    // 尝试读取 manifest
    const result = await this.readManifest(rootPath)
    if (!result.ok) {
      return err(createError('WS_RECOVERY_FAILED', 'workspace', `Failed to recover workspace: ${result.error.message}`, {
        recoverable: true,
        suggestedAction: 'Check if workspace-manifest.json is corrupted.',
        detail: result.error,
      }))
    }

    // 更新 lastActiveAt
    const manifest = result.data
    manifest.lastActiveAt = new Date().toISOString()
    await this.writeManifest(rootPath, manifest)

    return ok(manifest)
  }

  /**
   * 列出工作区下所有会话 ID
   * 扫描 conversations 目录下的 JSON 文件，提取文件名（去除 .json 后缀）作为 conversationId
   * 如果目录不存在返回空数组（不报错）
   */
  async listConversations(rootPath: string): Promise<Result<string[]>> {
    const resolver = new PathResolver(rootPath)
    const conversationsDir = resolver.conversationsDir

    try {
      const entries = await fs.readdir(conversationsDir)
      const ids = entries
        .filter((name) => name.endsWith('.json') && !name.includes('/'))
        .map((name) => name.replace(/\.json$/, ''))
      return ok(ids)
    } catch (e) {
      // 目录不存在或无法读取，返回空数组
      const errAny = e as NodeJS.ErrnoException
      if (errAny.code === 'ENOENT' || errAny.code === 'ENOTDIR') {
        return ok([])
      }
      return err(createError('WS_READ_FAILED', 'workspace', `Failed to list conversations: ${e}`, {
        recoverable: true,
      }))
    }
  }

  /**
   * 列出所有已知工作区（从全局 WorkspaceIndex 读取）
   * 不再需要外部传入 indexPath，直接读取实例内部固定路径
   */
  async listWorkspaces(): Promise<Result<WorkspaceIndex>> {
    const exists = await JsonStore.exists(this.indexPath)
    if (!exists) {
      return ok({
        workspaces: [],
        lastActiveWorkspaceId: null,
        lastWindowBounds: null,
      })
    }
    return JsonStore.read<WorkspaceIndex>(this.indexPath)
  }

  /**
   * 保存全局 WorkspaceIndex
   */
  async saveWorkspaceIndex(index: WorkspaceIndex): Promise<Result<void>> {
    return JsonStore.write(this.indexPath, index)
  }

  /**
   * Upsert 工作区到全局 WorkspaceIndex
   * initWorkspace 成功后自动调用；saveRecentWorkspace 也调用以保持同步
   */
  private async upsertToIndex(manifest: WorkspaceManifest): Promise<void> {
    const indexResult = await this.listWorkspaces()
    const index: WorkspaceIndex = indexResult.ok
      ? indexResult.data
      : { workspaces: [], lastActiveWorkspaceId: null, lastWindowBounds: null }

    const existingIdx = index.workspaces.findIndex(e => e.rootPath === manifest.rootPath)
    const entry: WorkspaceIndexEntry = {
      id: manifest.id,
      name: manifest.name,
      rootPath: manifest.rootPath,
      lastActiveAt: manifest.lastActiveAt,
    }

    if (existingIdx >= 0) {
      index.workspaces[existingIdx] = entry
    } else {
      index.workspaces.push(entry)
    }

    await this.saveWorkspaceIndex(index)
  }

  /**
   * 生成 EnvironmentFingerprint
   */
  async generateFingerprint(): Promise<EnvironmentFingerprint> {
    return {
      os: `${os.type()} ${os.release()}`,
      shell: process.env.SHELL ?? process.env.COMSPEC ?? 'unknown',
      nodeVersion: process.version,
      globalTools: {},
      agentVersion: '0.0.0',
      generatedAt: new Date().toISOString(),
    }
  }

  // ─── 最近工作区列表 ───

  /**
   * 获取最近打开的工作区列表
   * 数据存储在 app 用户数据目录下的 recent-workspaces.json
   */
  async listRecentWorkspaces(): Promise<Result<RecentWorkspaceEntry[]>> {
    const filePath = this.recentWorkspacesPath
    const exists = await JsonStore.exists(filePath)
    if (!exists) return ok([])

    const result = await JsonStore.read<RecentWorkspacesFile>(filePath)
    if (!result.ok) {
      return err(createError('WS_RECENT_READ_FAILED', 'workspace', `Failed to read recent workspaces: ${result.error.message}`, {
        recoverable: true,
      }))
    }
    return ok(result.data.entries ?? [])
  }

  /**
   * 记录工作区到最近列表（upsert + 排序 + 限制数量）
   */
  async saveRecentWorkspace(workspacePath: string): Promise<Result<void>> {
    // 1. 读取现有列表
    const listResult = await this.listRecentWorkspaces()
    if (!listResult.ok) return listResult as Result<never>

    const entries = listResult.data.filter(e => e.path !== workspacePath)

    // 2. 尝试读取 manifest 获取名称
    let name = pathBasename(workspacePath)
    const manifestResult = await this.readManifest(workspacePath)
    if (manifestResult.ok && manifestResult.data) {
      name = manifestResult.data.name || name
    }

    // 3. 插入到头部
    entries.unshift({
      path: workspacePath,
      name,
      lastOpened: new Date().toISOString(),
    })

    // 4. 限制最多 20 条
    const trimmed = entries.slice(0, 20)

    // 5. 写回文件
    const filePath = this.recentWorkspacesPath
    const writeResult = await JsonStore.write<RecentWorkspacesFile>(filePath, { entries: trimmed })
    if (!writeResult.ok) {
      return err(createError('WS_RECENT_WRITE_FAILED', 'workspace', `Failed to save recent workspace: ${writeResult.error.message}`, {
        recoverable: true,
      }))
    }

    // 6. 同步更新全局 WorkspaceIndex
    const manifestResult2 = await this.readManifest(workspacePath)
    if (manifestResult2.ok && manifestResult2.data) {
      // 更新 lastActiveAt 为当前时间
      const m = manifestResult2.data
      m.lastActiveAt = new Date().toISOString()
      await this.upsertToIndex(m)
    }

    return ok(undefined)
  }

  /**
   * 返回工作区统计（会话数、任务数、最近活动时间）
   */
  async getWorkspaceStats(rootPath: string): Promise<Result<WorkspaceStats>> {
    const resolver = new PathResolver(rootPath)
    const stats: WorkspaceStats = {
      conversationCount: 0,
      taskCount: 0,
      lastActivityAt: null,
    }

    // 读取 manifest 获取 lastActiveAt
    const manifestResult = await this.readManifest(rootPath)
    if (manifestResult.ok && manifestResult.data) {
      stats.lastActivityAt = manifestResult.data.lastActiveAt || manifestResult.data.updatedAt || null
    }

    // 统计会话数
    const convResult = await this.listConversations(rootPath)
    if (convResult.ok && convResult.data) {
      stats.conversationCount = convResult.data.length
    }

    // 统计任务数：遍历 conversations/tasks 目录
    try {
      const tasksDir = path.join(resolver.conversationsDir, 'tasks')
      const entries = await fs.readdir(tasksDir)
      stats.taskCount = entries.filter(e => e.endsWith('.json')).length
    } catch {
      // tasks 目录不存在时为 0
    }

    return ok(stats)
  }

  /**
   * 返回该工作区最近 5 个活跃任务摘要
   * 实现方式：扫描 conversations/tasks 目录 → 读取每个任务 → 按 updatedAt 降序排列
   */
  async getRecentTasks(rootPath: string): Promise<Result<RecentTaskItem[]>> {
    const resolver = new PathResolver(rootPath)
    const tasksDir = path.join(resolver.conversationsDir, 'tasks')

    try {
      const entries = await fs.readdir(tasksDir)
      const taskFiles = entries.filter(e => e.endsWith('.json'))

      // 读取所有任务
      const taskResults: TaskRuntime[] = []
      for (const file of taskFiles) {
        const filePath = path.join(tasksDir, file)
        const result = await JsonStore.read<TaskRuntime>(filePath)
        if (result.ok && result.data) {
          taskResults.push(result.data)
        }
      }

      // 按 updatedAt 降序排列，取前 5 个活跃任务（running / blocked / queued）
      const activeStatuses: string[] = ['running', 'blocked', 'queued']
      const activeTasks = taskResults
        .filter(t => activeStatuses.includes(t.status))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5)

      const items: RecentTaskItem[] = activeTasks.map(t => ({
        taskId: t.id,
        title: t.title,
        status: t.status,
        lastUpdated: t.updatedAt,
        currentNodeLabel: t.currentNodeName,
        conversationId: t.conversationId,
        workspaceRootPath: rootPath,
      }))

      return ok(items)
    } catch (e) {
      const errAny = e as NodeJS.ErrnoException
      if (errAny.code === 'ENOENT' || errAny.code === 'ENOTDIR') {
        return ok([])
      }
      return err(createError('WS_READ_FAILED', 'workspace', `Failed to get recent tasks: ${e}`, {
        recoverable: true,
      }))
    }
  }

  /**
   * 返回所有 blocked 状态的任务
   */
  async getBlockedTasks(rootPath: string): Promise<Result<BlockedTaskItem[]>> {
    const resolver = new PathResolver(rootPath)
    const tasksDir = path.join(resolver.conversationsDir, 'tasks')

    try {
      const entries = await fs.readdir(tasksDir)
      const taskFiles = entries.filter(e => e.endsWith('.json'))

      const blockedTasks: TaskRuntime[] = []
      for (const file of taskFiles) {
        const filePath = path.join(tasksDir, file)
        const result = await JsonStore.read<TaskRuntime>(filePath)
        if (result.ok && result.data && result.data.status === 'blocked') {
          blockedTasks.push(result.data)
        }
      }

      const items: BlockedTaskItem[] = blockedTasks.map(t => ({
        taskId: t.id,
        title: t.title,
        blockReason: t.blockedReason ?? '未指定原因',
        blockedSince: t.updatedAt,
        conversationId: t.conversationId,
        workspaceRootPath: rootPath,
      }))

      return ok(items)
    } catch (e) {
      const errAny = e as NodeJS.ErrnoException
      if (errAny.code === 'ENOENT' || errAny.code === 'ENOTDIR') {
        return ok([])
      }
      return err(createError('WS_READ_FAILED', 'workspace', `Failed to get blocked tasks: ${e}`, {
        recoverable: true,
      }))
    }
  }

  /**
   * 最近工作区列表存储路径
   */
  private get recentWorkspacesPath(): string {
    return path.join(this.userDataPath, 'recent-workspaces.json')
  }
}

function pathBasename(p: string): string {
  const parts = p.replace(/[/\\]+$/, '').split(/[/\\]/)
  return parts[parts.length - 1] || 'unnamed-workspace'
}

// ─── 最近工作区相关类型 ───

export interface RecentWorkspaceEntry {
  path: string
  name: string
  lastOpened: string
}

interface RecentWorkspacesFile {
  entries: RecentWorkspaceEntry[]
}

export interface WorkspaceStats {
  conversationCount: number
  taskCount: number
  lastActivityAt: string | null
}

// ─── 首页聚合查询类型 ───

export interface RecentTaskItem {
  taskId: string
  title: string
  status: string
  lastUpdated: string
  currentNodeLabel: string
  conversationId: string
  workspaceRootPath: string
}

export interface BlockedTaskItem {
  taskId: string
  title: string
  blockReason: string
  blockedSince: string
  conversationId: string
  workspaceRootPath: string
}
