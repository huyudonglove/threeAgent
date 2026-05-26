// src-main/runtime/conversation-runtime-manager.ts
// 会话运行态管理

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import type { ConversationRuntime, ConversationStatus } from '../contracts/types'
import { validateConversationRuntime } from '../validation/structure'
import { validateConversationTransition } from '../validation/state-transition'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import type { AgentMemoryService } from '../memory/agent-memory-service'
import type { MemoryDecisionEngine } from '../memory/memory-decision-engine'

// ─── processTurnEnd 参数与返回类型 ───

export interface TurnData {
  userInput: string
  agentOutput: string
  context?: unknown
}

export interface ProcessTurnEndResult {
  memorized: boolean
  conflictDetected?: boolean
  conflictDetails?: unknown
}

export class ConversationRuntimeManager {
  private memoryService: AgentMemoryService | null = null
  private memoryDecisionEngine: MemoryDecisionEngine | null = null

  /**
   * 注入 AgentMemoryService 依赖
   */
  setMemoryService(service: AgentMemoryService): void {
    this.memoryService = service
  }

  /**
   * 注入 MemoryDecisionEngine 依赖
   */
  setMemoryDecisionEngine(engine: MemoryDecisionEngine): void {
    this.memoryDecisionEngine = engine
  }
  /**
   * 创建新会话
   */
  async create(
    workspaceRootPath: string,
    input: { title: string; taskType: string; taskDomain?: string },
  ): Promise<Result<ConversationRuntime>> {
    const resolver = new PathResolver(workspaceRootPath)
    const now = new Date().toISOString()
    const conversationId = `conv_${Date.now()}`

    const conversation: ConversationRuntime = {
      id: conversationId,
      workspaceId: '', // 会在写入前从 manifest 获取
      title: input.title,
      taskType: input.taskType,
      status: 'active',
      currentTaskId: null,
      currentWorkflowId: null,
      currentNodeId: null,
      currentNodeName: null,
      taskDomain: input.taskDomain ?? null,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    }

    // 获取 workspaceId
    const manifestResult = await JsonStore.read<{ id: string }>(resolver.manifestPath)
    if (manifestResult.ok) {
      conversation.workspaceId = manifestResult.data.id
    }

    const validation = validateConversationRuntime(conversation)
    if (!validation.ok) {
      return err(createError('CONV_CREATE_FAILED', 'conversation', 'Validation failed', { detail: validation.issues }))
    }

    const writeResult = await JsonStore.write(resolver.conversationPath(conversationId), conversation)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(conversation)
  }

  /**
   * 读取会话
   */
  async read(workspaceRootPath: string, conversationId: string): Promise<Result<ConversationRuntime>> {
    const resolver = new PathResolver(workspaceRootPath)
    const result = await JsonStore.read<ConversationRuntime>(resolver.conversationPath(conversationId))
    if (!result.ok) {
      return err(createError('CONV_NOT_FOUND', 'conversation', `Conversation "${conversationId}" not found`, {
        recoverable: true,
        suggestedAction: 'Check if the conversation ID is correct.',
        detail: result.error,
      }))
    }
    return ok({
      ...result.data,
      currentNodeId: result.data.currentNodeId ?? null,
      closedAt: result.data.closedAt ?? null,
    })
  }

  /**
   * 会话轮次结束处理：集成记忆系统
   *
   * 1. 调用 memoryDecisionEngine.performSourceCheck 判断是否需要记忆
   * 2. 如果需要，通过 agentMemoryService.submitMemorySource 提交
   * 3. 返回是否已记忆、是否检测到冲突
   */
  async processTurnEnd(
    workspaceRootPath: string,
    conversationId: string,
    turnData: TurnData,
  ): Promise<Result<ProcessTurnEndResult>> {
    // 依赖校验
    if (!this.memoryService || !this.memoryDecisionEngine) {
      return err(createError(
        'MEMORY_DEPS_NOT_INJECTED',
        'conversation',
        'MemoryService or MemoryDecisionEngine not injected',
        { recoverable: false },
      ))
    }

    // 参数校验
    if (!turnData.userInput?.trim() && !turnData.agentOutput?.trim()) {
      return ok({ memorized: false })
    }

    // 合并来源文本：优先使用 agentOutput，补充 userInput 作为上下文
    const sourceText = [turnData.agentOutput, turnData.userInput]
      .filter((s) => s?.trim())
      .join('\n')

    // 1. 调用决策引擎判断是否需要记忆
    const checkResult = this.memoryDecisionEngine.performSourceCheck(sourceText, 'agent')

    if (checkResult.signalStrength === 'none' || checkResult.candidates.length === 0) {
      return ok({ memorized: false })
    }

    // 2. 通过 agentMemoryService 提交记忆（内部处理冲突检测和写入）
    const turnId = `turn_${Date.now()}`
    const submitResult = await this.memoryService.submitMemorySource({
      rootPath: workspaceRootPath,
      conversationId,
      turnId,
      currentAgentRole: 'agent',
      sourceText,
    })

    if (!submitResult.ok) {
      return err(submitResult.error!)
    }

    const { decision } = submitResult.data

    // 3. 根据决策结果返回
    if (decision.action === 'conflict' || decision.requiresUserConfirmation) {
      return ok({
        memorized: false,
        conflictDetected: true,
        conflictDetails: {
          decisionId: decision.decisionId,
          memoryCategory: decision.memoryCategory,
          memoryText: decision.memoryText,
          targetScope: decision.targetScope,
          conflict: decision.conflict,
        },
      })
    }

    if (decision.action === 'skip') {
      return ok({ memorized: false })
    }

    // write / replace → 已记忆
    return ok({ memorized: true })
  }

  /**
   * 更新会话
   */
  async update(
    workspaceRootPath: string,
    conversationId: string,
    patch: Partial<ConversationRuntime>,
  ): Promise<Result<void>> {
    const readResult = await this.read(workspaceRootPath, conversationId)
    if (!readResult.ok) return readResult as Result<never>

    const updated: ConversationRuntime = {
      ...readResult.data,
      ...patch,
      id: readResult.data.id,       // 不允许覆盖 id
      workspaceId: readResult.data.workspaceId, // 不允许覆盖 workspaceId
      updatedAt: new Date().toISOString(),
    }

    // 如果状态变更，校验迁移合法性
    if (patch.status && patch.status !== readResult.data.status) {
      const transition = validateConversationTransition(readResult.data.status, patch.status as ConversationStatus)
      if (!transition.ok) {
        return err(createError('CONV_STATE_INVALID', 'conversation', `Invalid transition: ${readResult.data.status} → ${patch.status}`, {
          detail: transition.issues,
        }))
      }
    }

    const resolver = new PathResolver(workspaceRootPath)
    return JsonStore.write(resolver.conversationPath(conversationId), updated)
  }
}
