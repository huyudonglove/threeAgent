// src-main/memory/memory-store.ts
// AgentMemory 存储层：shared.json / roles/{agentRole}.json / records.jsonl 读写

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import { JsonlStore } from '../storage/jsonl-store'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

// ─── 记忆项最小结构 ───

export interface MemoryItem {
  text: string
  rememberedAt: string
}

// ─── 会话记忆状态文件 ───

export interface MemoryStateFile {
  /** 记忆分类 → 记忆项数组 */
  [category: string]: MemoryItem[]
}

// ─── 会话 manifest ───

export interface ConversationMemoryManifest {
  conversationId: string
  createdAt: string
  lastUpdatedAt: string
  /** 共享记忆路径（相对于会话目录） */
  sharedPath: string
  /** 已注册角色列表 */
  agents: Array<{
    agentRole: string
    /** 角色记忆路径（相对于会话目录） */
    path: string
  }>
}

// ─── MemoryRecord (records.jsonl 操作日志) ───

export interface MemoryRecord {
  recordId: string
  decisionId: string
  conversationId: string
  turnId: string
  action: 'write' | 'skip' | 'merge' | 'replace' | 'conflict' | 'ask_user' | 'delete_conflict'
  targetPath: string
  memoryCategory: string
  memoryText: string
  createdAt: string
}

// ─── MemoryStore ───

export class MemoryStore {
  /**
   * 初始化会话记忆目录结构
   */
  async initializeConversationMemory(
    rootPath: string,
    conversationId: string,
    agentRoles: string[] = [],
  ): Promise<Result<ConversationMemoryManifest>> {
    const resolver = new PathResolver(rootPath)
    const manifestPath = resolver.memoryConversationManifestPath(conversationId)

    // 如果 manifest 已存在，直接返回
    const exists = await JsonStore.exists(manifestPath)
    if (exists) {
      return JsonStore.read<ConversationMemoryManifest>(manifestPath)
    }

    const now = new Date().toISOString()

    // 构建 manifest
    const manifest: ConversationMemoryManifest = {
      conversationId,
      createdAt: now,
      lastUpdatedAt: now,
      sharedPath: 'shared.json',
      agents: agentRoles.map((role) => ({
        agentRole: role,
        path: `roles/${role}.json`,
      })),
    }

    // 写 manifest
    const writeManifest = await JsonStore.write(manifestPath, manifest)
    if (!writeManifest.ok) return err(writeManifest.error!)

    // 初始化 shared.json
    const sharedPath = resolver.memorySharedPath(conversationId)
    const emptyState: MemoryStateFile = {}
    const writeShared = await JsonStore.write(sharedPath, emptyState)
    if (!writeShared.ok) {
      // 降级：manifest 已写，但 shared 失败，记录日志但不回滚
      console.error('memory-store: shared.json write failed during init', writeShared.error)
    }

    // 初始化角色记忆文件
    for (const role of agentRoles) {
      const rolePath = resolver.memoryRolePath(conversationId, role)
      const roleExists = await JsonStore.exists(rolePath)
      if (!roleExists) {
        const writeRole = await JsonStore.write(rolePath, {})
        if (!writeRole.ok) {
          console.error(`memory-store: role ${role} memory write failed during init`, writeRole.error)
        }
      }
    }

    return ok(manifest)
  }

  /**
   * 读取会话 manifest
   */
  async readManifest(
    rootPath: string,
    conversationId: string,
  ): Promise<Result<ConversationMemoryManifest | null>> {
    const resolver = new PathResolver(rootPath)
    const manifestPath = resolver.memoryConversationManifestPath(conversationId)
    const exists = await JsonStore.exists(manifestPath)
    if (!exists) return ok(null)
    return JsonStore.read<ConversationMemoryManifest>(manifestPath)
  }

  /**
   * 读取 shared.json
   */
  async readSharedMemory(
    rootPath: string,
    conversationId: string,
  ): Promise<Result<MemoryStateFile>> {
    const resolver = new PathResolver(rootPath)
    const sharedPath = resolver.memorySharedPath(conversationId)
    const exists = await JsonStore.exists(sharedPath)
    if (!exists) return ok({})
    return JsonStore.read<MemoryStateFile>(sharedPath)
  }

  /**
   * 写入 shared.json
   */
  async writeSharedMemory(
    rootPath: string,
    conversationId: string,
    data: MemoryStateFile,
  ): Promise<Result<void>> {
    const resolver = new PathResolver(rootPath)
    const sharedPath = resolver.memorySharedPath(conversationId)
    return JsonStore.write(sharedPath, data)
  }

  /**
   * 读取角色记忆
   */
  async readRoleMemory(
    rootPath: string,
    conversationId: string,
    agentRole: string,
  ): Promise<Result<MemoryStateFile>> {
    const resolver = new PathResolver(rootPath)
    const rolePath = resolver.memoryRolePath(conversationId, agentRole)
    const exists = await JsonStore.exists(rolePath)
    if (!exists) return ok({})
    return JsonStore.read<MemoryStateFile>(rolePath)
  }

  /**
   * 写入角色记忆
   */
  async writeRoleMemory(
    rootPath: string,
    conversationId: string,
    agentRole: string,
    data: MemoryStateFile,
  ): Promise<Result<void>> {
    const resolver = new PathResolver(rootPath)
    const rolePath = resolver.memoryRolePath(conversationId, agentRole)
    return JsonStore.write(rolePath, data)
  }

  /**
   * 追加操作日志到 records.jsonl
   */
  async appendRecord(
    rootPath: string,
    conversationId: string,
    record: MemoryRecord,
  ): Promise<Result<void>> {
    const resolver = new PathResolver(rootPath)
    const recordsPath = resolver.memoryRecordsPath(conversationId)
    return JsonlStore.append(recordsPath, record)
  }

  /**
   * 查询全部角色记忆（返回所有角色的合并结果）
   */
  async readAllRoleMemories(
    rootPath: string,
    conversationId: string,
    manifest: ConversationMemoryManifest,
  ): Promise<Result<Record<string, MemoryStateFile>>> {
    const result: Record<string, MemoryStateFile> = {}
    for (const agent of manifest.agents) {
      const readResult = await this.readRoleMemory(rootPath, conversationId, agent.agentRole)
      if (readResult.ok) {
        result[agent.agentRole] = readResult.data
      }
    }
    return ok(result)
  }

  /**
   * 向记忆状态文件添加一条记忆项
   */
  addMemoryItem(
    state: MemoryStateFile,
    category: string,
    text: string,
  ): MemoryStateFile {
    const item: MemoryItem = {
      text,
      rememberedAt: new Date().toISOString(),
    }
    const updated = { ...state }
    updated[category] = [...(updated[category] ?? []), item]
    return updated
  }

  /**
   * 从记忆状态文件删除冲突旧记忆（按文本匹配）
   */
  removeMemoryItem(
    state: MemoryStateFile,
    category: string,
    text: string,
  ): MemoryStateFile {
    const updated = { ...state }
    if (updated[category]) {
      updated[category] = updated[category].filter((item) => item.text !== text)
      // 空数组时保留分类键，维持模板固定
    }
    return updated
  }

  /**
   * 检查记忆冲突：同一 category 中是否存在语义相似的旧记忆
   * 第一版用简单文本相似度判断，后续可替换为模型判断
   */
  findConflictingItem(
    state: MemoryStateFile,
    category: string,
    newText: string,
  ): MemoryItem | null {
    const items = state[category] ?? []
    // 简单策略：检查是否有包含相同关键词的记忆
    // 第一版不做语义分析，只检查文本是否高度相似（包含关系）
    for (const item of items) {
      if (this.isTextSimilar(item.text, newText)) {
        return item
      }
    }
    return null
  }

  /**
   * 简单文本相似度判断
   * 两个文本如果重叠度超过60%则视为冲突
   */
  private isTextSimilar(a: string, b: string): boolean {
    if (a === b) return true
    // 计算词汇重叠度
    const wordsA = new Set(a.split(/\s+/))
    const wordsB = new Set(b.split(/\s+/))
    if (wordsA.size === 0 || wordsB.size === 0) return false
    let overlap = 0
    for (const w of wordsA) {
      if (wordsB.has(w)) overlap++
    }
    const ratio = overlap / Math.min(wordsA.size, wordsB.size)
    return ratio >= 0.6
  }

  /**
   * 确保角色在 manifest 中注册
   */
  async ensureRoleRegistered(
    rootPath: string,
    conversationId: string,
    agentRole: string,
  ): Promise<Result<void>> {
    const manifestResult = await this.readManifest(rootPath, conversationId)
    if (!manifestResult.ok) return err(manifestResult.error!)
    const manifest = manifestResult.data
    if (!manifest) {
      return err(createError('MEMORY_CONVERSATION_NOT_INITIALIZED', '会话记忆未初始化', 'agent-memory-minimal'))
    }

    const exists = manifest.agents.some((a) => a.agentRole === agentRole)
    if (exists) return ok(undefined)

    // 注册新角色
    manifest.agents.push({
      agentRole,
      path: `roles/${agentRole}.json`,
    })
    manifest.lastUpdatedAt = new Date().toISOString()

    const resolver = new PathResolver(rootPath)
    const manifestPath = resolver.memoryConversationManifestPath(conversationId)
    const writeResult = await JsonStore.write(manifestPath, manifest)
    if (!writeResult.ok) return err(writeResult.error!)

    // 初始化角色记忆文件
    const rolePath = resolver.memoryRolePath(conversationId, agentRole)
    const roleExists = await JsonStore.exists(rolePath)
    if (!roleExists) {
      const writeRole = await JsonStore.write(rolePath, {})
      if (!writeRole.ok) {
        console.error(`memory-store: role ${agentRole} init failed`, writeRole.error)
      }
    }

    return ok(undefined)
  }
}
