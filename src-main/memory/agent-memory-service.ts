// src-main/memory/agent-memory-service.ts
// AgentMemory 服务层：对外暴露 submitMemorySource / queryAgentMemory / notifyMemoryTurnEnd
// 遵循设计规范：写入侧唯一对外入口是 submitMemorySource
// 外层只传 conversationId / turnId / currentAgentRole / sourceText

import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import { MemoryStore, MemoryStateFile, MemoryRecord, ConversationMemoryManifest } from './memory-store'
import { MemoryDecisionEngine, MemoryDecision, MemorySourceCheckResult } from './memory-decision-engine'

// ─── 对外接口类型 ───

export interface SubmitMemorySourceInput {
  rootPath: string
  conversationId: string
  turnId: string
  currentAgentRole: string
  sourceText: string
}

export interface SubmitMemorySourceOutput {
  decision: MemoryDecision
  record?: MemoryRecord
}

export interface QueryAgentMemoryInput {
  rootPath: string
  conversationId: string
  agentRole?: string | null
  categories?: string[] | null
}

export interface MemoryStateEntry {
  category: string
  items: Array<{ text: string; rememberedAt: string }>
}

export interface QueryAgentMemoryOutput {
  shared: MemoryStateEntry[]
  roleLocal: MemoryStateEntry[]
}

export interface NotifyTurnEndInput {
  rootPath: string
  conversationId: string
  turnId: string
}

// ─── AgentMemoryService ───

export class AgentMemoryService {
  private store = new MemoryStore()
  private engine = new MemoryDecisionEngine()

  /**
   * 写入侧唯一对外入口
   * 提交来源文本，由 AgentMemory 内部识别信号强度、候选记忆、分类和目标角色
   */
  async submitMemorySource(input: SubmitMemorySourceInput): Promise<Result<SubmitMemorySourceOutput>> {
    const { rootPath, conversationId, turnId, currentAgentRole, sourceText } = input

    // 1. 参数合法性校验
    if (!conversationId || !turnId || !currentAgentRole || !sourceText?.trim()) {
      return err(createError(
        'MEMORY_SUBMISSION_INVALID',
        'submitMemorySource 参数不完整：需要 conversationId, turnId, currentAgentRole, sourceText',
        'agent-memory-minimal',
        { recoverable: false },
      ))
    }

    // 2. 确保会话记忆目录已初始化
    const initResult = await this.store.initializeConversationMemory(rootPath, conversationId, [currentAgentRole])
    if (!initResult.ok) return err(initResult.error!)

    // 3. 确保 currentAgentRole 已注册
    const ensureRole = await this.store.ensureRoleRegistered(rootPath, conversationId, currentAgentRole)
    if (!ensureRole.ok) return err(ensureRole.error!)

    // 4. 内部 MemorySourceCheck
    const checkResult = this.engine.performSourceCheck(sourceText, currentAgentRole)

    // 5. signalStrength = none → 跳过
    if (checkResult.signalStrength === 'none' || checkResult.candidates.length === 0) {
      const skipDecision = this.engine.makeDecision(
        {
          candidateText: sourceText,
          targetMemoryScope: 'shared',
          targetAgentRoles: [],
          memoryCategory: 'workingContext',
        },
        conversationId,
        turnId,
        currentAgentRole,
        checkResult.signalStrength,
        false,
      )
      skipDecision.action = 'skip'
      return ok({ decision: skipDecision })
    }

    // 6. 对每个候选执行写入决策
    // 第一版取第一个候选（最相关的）
    const candidate = checkResult.candidates[0]

    // 7. 读取目标记忆文件，判断冲突
    let targetState: MemoryStateFile
    if (candidate.targetMemoryScope === 'shared') {
      const readResult = await this.store.readSharedMemory(rootPath, conversationId)
      if (!readResult.ok) return err(readResult.error!)
      targetState = readResult.data
    } else {
      const role = candidate.targetAgentRoles[0] ?? currentAgentRole
      const readResult = await this.store.readRoleMemory(rootPath, conversationId, role)
      if (!readResult.ok) return err(readResult.error!)
      targetState = readResult.data
    }

    // 8. 冲突检查
    const conflictingItem = this.store.findConflictingItem(targetState, candidate.memoryCategory, candidate.candidateText)
    const hasConflict = conflictingItem !== null

    // 9. 生成 MemoryDecision
    const decision = this.engine.makeDecision(candidate, conversationId, turnId, currentAgentRole, checkResult.signalStrength, hasConflict)

    // 10. 如果需要用户确认（冲突），返回决策但不写入
    if (decision.action === 'conflict' || decision.requiresUserConfirmation) {
      return ok({ decision })
    }

    // 11. 执行写入
    if (decision.action === 'skip') {
      return ok({ decision })
    }

    // 写入目标记忆文件
    let updatedState: MemoryStateFile
    if (decision.action === 'replace' && conflictingItem) {
      // 先删除冲突旧记忆，再添加新记忆
      updatedState = this.store.removeMemoryItem(targetState, candidate.memoryCategory, conflictingItem.text)
      updatedState = this.store.addMemoryItem(updatedState, candidate.memoryCategory, candidate.candidateText)
    } else {
      // write
      updatedState = this.store.addMemoryItem(targetState, candidate.memoryCategory, candidate.candidateText)
    }

    // 写回文件
    let writeResult: Result<void>
    if (candidate.targetMemoryScope === 'shared') {
      writeResult = await this.store.writeSharedMemory(rootPath, conversationId, updatedState)
    } else {
      const role = candidate.targetAgentRoles[0] ?? currentAgentRole
      writeResult = await this.store.writeRoleMemory(rootPath, conversationId, role, updatedState)
    }

    if (!writeResult.ok) {
      return err(createError('MEMORY_WRITE_FAILED', '记忆写入失败', 'agent-memory-minimal', {
        recoverable: true,
      }))
    }

    // 12. 追加 records.jsonl 操作日志
    const record: MemoryRecord = {
      recordId: `mem_record_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      decisionId: decision.decisionId,
      conversationId,
      turnId,
      action: decision.action,
      targetPath: candidate.targetMemoryScope === 'shared' ? 'shared.json' : `roles/${candidate.targetAgentRoles[0] ?? currentAgentRole}.json`,
      memoryCategory: candidate.memoryCategory,
      memoryText: candidate.candidateText,
      createdAt: new Date().toISOString(),
    }

    const appendResult = await this.store.appendRecord(rootPath, conversationId, record)
    if (!appendResult.ok) {
      // 降级：记忆已写入，但日志追加失败，记录日志但不回滚
      console.error('agent-memory-service: records.jsonl append failed', appendResult.error)
    }

    return ok({ decision, record })
  }

  /**
   * 查询记忆
   */
  async queryAgentMemory(input: QueryAgentMemoryInput): Promise<Result<QueryAgentMemoryOutput>> {
    const { rootPath, conversationId, agentRole, categories } = input

    // 读取 shared 记忆
    const sharedResult = await this.store.readSharedMemory(rootPath, conversationId)
    const sharedState = sharedResult.ok ? sharedResult.data : {}

    // 转换为 MemoryStateEntry
    let shared: MemoryStateEntry[] = this.stateFileToEntries(sharedState, categories)

    // 读取角色记忆
    let roleLocal: MemoryStateEntry[] = []
    if (agentRole) {
      const roleResult = await this.store.readRoleMemory(rootPath, conversationId, agentRole)
      const roleState = roleResult.ok ? roleResult.data : {}
      roleLocal = this.stateFileToEntries(roleState, categories)
    }

    return ok({ shared, roleLocal })
  }

  /**
   * 轮次结束通知
   * 第一版为空操作，预留后续弱缓冲审查等能力
   */
  async notifyMemoryTurnEnd(input: NotifyTurnEndInput): Promise<Result<{ processed: boolean }>> {
    // 第一版不执行额外操作
    // 预留：弱缓冲审查、记忆压缩触发等
    return ok({ processed: true })
  }

  /**
   * 用户确认冲突后执行写入
   */
  async resolveMemoryConflict(
    rootPath: string,
    conversationId: string,
    decision: MemoryDecision,
    userChoice: 'keep' | 'update',
  ): Promise<Result<MemoryRecord>> {
    if (!decision.conflict || !decision.requiresUserConfirmation) {
      return err(createError('MEMORY_SUBMISSION_INVALID', '该决策不需要用户确认', 'agent-memory-minimal'))
    }

    const resolvedDecision = this.engine.resolveConflictDecision(decision, userChoice)

    if (resolvedDecision.action === 'skip') {
      // 用户选择保持不变
      const record: MemoryRecord = {
        recordId: `mem_record_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        decisionId: resolvedDecision.decisionId,
        conversationId,
        turnId: decision.turnId,
        action: 'skip',
        targetPath: '',
        memoryCategory: resolvedDecision.memoryCategory,
        memoryText: resolvedDecision.memoryText,
        createdAt: new Date().toISOString(),
      }
      await this.store.appendRecord(rootPath, conversationId, record)
      return ok(record)
    }

    // 用户选择更新 → 读取→删除旧→添加新→写回
    let targetState: MemoryStateFile
    if (resolvedDecision.targetScope === 'shared') {
      const readResult = await this.store.readSharedMemory(rootPath, conversationId)
      if (!readResult.ok) return err(readResult.error!)
      targetState = readResult.data
    } else {
      const role = resolvedDecision.targetRole ?? 'unknown'
      const readResult = await this.store.readRoleMemory(rootPath, conversationId, role)
      if (!readResult.ok) return err(readResult.error!)
      targetState = readResult.data
    }

    // 查找并删除冲突旧记忆
    const conflicting = this.store.findConflictingItem(targetState, resolvedDecision.memoryCategory, resolvedDecision.memoryText)
    let updatedState = targetState
    if (conflicting) {
      updatedState = this.store.removeMemoryItem(updatedState, resolvedDecision.memoryCategory, conflicting.text)
    }
    updatedState = this.store.addMemoryItem(updatedState, resolvedDecision.memoryCategory, resolvedDecision.memoryText)

    // 写回
    if (resolvedDecision.targetScope === 'shared') {
      const writeResult = await this.store.writeSharedMemory(rootPath, conversationId, updatedState)
      if (!writeResult.ok) return err(createError('MEMORY_WRITE_FAILED', '共享记忆写入失败', 'agent-memory-minimal', { recoverable: true }))
    } else {
      const role = resolvedDecision.targetRole ?? 'unknown'
      const writeResult = await this.store.writeRoleMemory(rootPath, conversationId, role, updatedState)
      if (!writeResult.ok) return err(createError('MEMORY_WRITE_FAILED', '角色记忆写入失败', 'agent-memory-minimal', { recoverable: true }))
    }

    // 追加 records.jsonl
    const record: MemoryRecord = {
      recordId: `mem_record_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      decisionId: resolvedDecision.decisionId,
      conversationId,
      turnId: decision.turnId,
      action: 'replace',
      targetPath: resolvedDecision.targetScope === 'shared' ? 'shared.json' : `roles/${resolvedDecision.targetRole}.json`,
      memoryCategory: resolvedDecision.memoryCategory,
      memoryText: resolvedDecision.memoryText,
      createdAt: new Date().toISOString(),
    }

    const appendResult = await this.store.appendRecord(rootPath, conversationId, record)
    if (!appendResult.ok) {
      console.error('agent-memory-service: records.jsonl append failed after conflict resolution', appendResult.error)
    }

    return ok(record)
  }

  /**
   * 获取会话记忆 manifest
   */
  async getConversationMemoryManifest(
    rootPath: string,
    conversationId: string,
  ): Promise<Result<ConversationMemoryManifest | null>> {
    return this.store.readManifest(rootPath, conversationId)
  }

  // ─── 内部工具 ───

  private stateFileToEntries(
    state: MemoryStateFile,
    filterCategories?: string[] | null,
  ): MemoryStateEntry[] {
    const entries: MemoryStateEntry[] = []
    for (const [category, items] of Object.entries(state)) {
      if (!items || items.length === 0) continue
      if (filterCategories && filterCategories.length > 0 && !filterCategories.includes(category)) continue
      entries.push({ category, items })
    }
    return entries
  }
}
