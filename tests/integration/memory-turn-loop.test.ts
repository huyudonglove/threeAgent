// tests/integration/memory-turn-loop.test.ts
// T28: 记忆回路集成测试
// 验证：信号强 → memorized:true、信号弱 → memorized:false、冲突检测场景

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationRuntimeManager, ProcessTurnEndResult } from '../../src-main/runtime/conversation-runtime-manager'
import { Result, ok, err } from '../../src-main/errors/result'
import type { AgentMemoryService, SubmitMemorySourceOutput } from '../../src-main/memory/agent-memory-service'
import type { MemoryDecisionEngine, MemorySourceCheckResult, MemoryDecision } from '../../src-main/memory/memory-decision-engine'

// ─── Mock 工厂 ───

function createMockMemoryDecisionEngine() {
  return {
    performSourceCheck: vi.fn(),
    makeDecision: vi.fn(),
    resolveConflictDecision: vi.fn(),
  }
}

function createMockMemoryService() {
  return {
    submitMemorySource: vi.fn(),
    queryAgentMemory: vi.fn(),
    notifyMemoryTurnEnd: vi.fn(),
    resolveMemoryConflict: vi.fn(),
    getConversationMemoryManifest: vi.fn(),
  }
}

function makeDecision(overrides: Partial<MemoryDecision> = {}): MemoryDecision {
  return {
    decisionId: 'dec_001',
    conversationId: 'conv-001',
    turnId: 'turn_001',
    sourceRole: 'agent',
    signalStrength: 'strong',
    action: 'write',
    targetScope: 'shared',
    targetRole: null,
    memoryCategory: 'decisions',
    memoryText: '决定使用 TypeScript',
    conflict: false,
    requiresUserConfirmation: false,
    ...overrides,
  }
}

describe('记忆回路集成测试', () => {
  let manager: ConversationRuntimeManager
  let mockDecisionEngine: ReturnType<typeof createMockMemoryDecisionEngine>
  let mockMemoryService: ReturnType<typeof createMockMemoryService>

  beforeEach(() => {
    manager = new ConversationRuntimeManager()
    mockDecisionEngine = createMockMemoryDecisionEngine()
    mockMemoryService = createMockMemoryService()
    manager.setMemoryDecisionEngine(mockDecisionEngine as any)
    manager.setMemoryService(mockMemoryService as any)
  })

  // ─── 依赖未注入 ───

  it('未注入依赖 → 返回错误', async () => {
    const freshManager = new ConversationRuntimeManager()
    const result = await freshManager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '测试',
      agentOutput: '回复',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MEMORY_DEPS_NOT_INJECTED')
    }
  })

  // ─── 空轮次数据 ───

  it('空 userInput 和 agentOutput → memorized: false（不报错）', async () => {
    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '',
      agentOutput: '',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.memorized).toBe(false)
    }
  })

  it('纯空格的 userInput 和 agentOutput → memorized: false', async () => {
    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '   ',
      agentOutput: '   ',
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.memorized).toBe(false)
    }
  })

  // ─── 信号强 → memorized: true ───

  it('信号强的输入 → memorized: true', async () => {
    const strongCheckResult: MemorySourceCheckResult = {
      signalStrength: 'strong',
      candidates: [{
        candidateText: '决定使用 Vue 3 作为前端框架',
        targetMemoryScope: 'shared',
        targetAgentRoles: [],
        memoryCategory: 'decisions',
      }],
    }
    mockDecisionEngine.performSourceCheck.mockReturnValue(strongCheckResult)

    const writeDecision = makeDecision({ action: 'write' })
    mockMemoryService.submitMemorySource.mockResolvedValue(ok({
      decision: writeDecision,
    }))

    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '我们决定使用 Vue 3',
      agentOutput: '已确认技术选型：Vue 3 + TypeScript',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.memorized).toBe(true)
    }
    expect(mockDecisionEngine.performSourceCheck).toHaveBeenCalled()
    expect(mockMemoryService.submitMemorySource).toHaveBeenCalled()
  })

  it('信号强的输入 → replace 动作 → memorized: true', async () => {
    const strongCheckResult: MemorySourceCheckResult = {
      signalStrength: 'strong',
      candidates: [{
        candidateText: '项目架构从单体改为微服务',
        targetMemoryScope: 'shared',
        targetAgentRoles: [],
        memoryCategory: 'decisions',
      }],
    }
    mockDecisionEngine.performSourceCheck.mockReturnValue(strongCheckResult)

    const replaceDecision = makeDecision({ action: 'replace' })
    mockMemoryService.submitMemorySource.mockResolvedValue(ok({
      decision: replaceDecision,
    }))

    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '架构改为微服务',
      agentOutput: '已更新架构决策',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.memorized).toBe(true)
    }
  })

  // ─── 信号弱 → memorized: false ───

  it('信号弱的输入（none） → memorized: false', async () => {
    const noneCheckResult: MemorySourceCheckResult = {
      signalStrength: 'none',
      candidates: [],
    }
    mockDecisionEngine.performSourceCheck.mockReturnValue(noneCheckResult)

    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '你好',
      agentOutput: '你好，有什么可以帮助你的？',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.memorized).toBe(false)
    }
    // 不应调用 submitMemorySource
    expect(mockMemoryService.submitMemorySource).not.toHaveBeenCalled()
  })

  it('信号弱（weak）→ memorized: false（跳过）', async () => {
    const weakCheckResult: MemorySourceCheckResult = {
      signalStrength: 'weak',
      candidates: [{
        candidateText: '今天在开发',
        targetMemoryScope: 'role_local',
        targetAgentRoles: ['agent'],
        memoryCategory: 'workingContext',
      }],
    }
    mockDecisionEngine.performSourceCheck.mockReturnValue(weakCheckResult)

    const skipDecision = makeDecision({ action: 'skip', signalStrength: 'weak' })
    mockMemoryService.submitMemorySource.mockResolvedValue(ok({
      decision: skipDecision,
    }))

    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '当前正在开发',
      agentOutput: '了解了',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.memorized).toBe(false)
    }
  })

  it('信号强但候选为空 → memorized: false', async () => {
    const checkResult: MemorySourceCheckResult = {
      signalStrength: 'medium',
      candidates: [],
    }
    mockDecisionEngine.performSourceCheck.mockReturnValue(checkResult)

    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '测试内容',
      agentOutput: '回复内容',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.memorized).toBe(false)
    }
  })

  // ─── 冲突检测场景 ───

  it('冲突检测 → memorized: false, conflictDetected: true', async () => {
    const strongCheckResult: MemorySourceCheckResult = {
      signalStrength: 'strong',
      candidates: [{
        candidateText: '决定使用 React 作为前端框架',
        targetMemoryScope: 'shared',
        targetAgentRoles: [],
        memoryCategory: 'decisions',
      }],
    }
    mockDecisionEngine.performSourceCheck.mockReturnValue(strongCheckResult)

    const conflictDecision = makeDecision({
      action: 'conflict',
      conflict: true,
      requiresUserConfirmation: true,
      memoryText: '决定使用 React 作为前端框架',
    })
    mockMemoryService.submitMemorySource.mockResolvedValue(ok({
      decision: conflictDecision,
    }))

    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '我们改用 React',
      agentOutput: '确认技术选型变更为 React',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.memorized).toBe(false)
      expect(result.data.conflictDetected).toBe(true)
      expect(result.data.conflictDetails).toBeDefined()
    }
  })

  it('requiresUserConfirmation 但 action 非 conflict → conflictDetected: true', async () => {
    const strongCheckResult: MemorySourceCheckResult = {
      signalStrength: 'strong',
      candidates: [{
        candidateText: '偏好使用暗色主题',
        targetMemoryScope: 'shared',
        targetAgentRoles: [],
        memoryCategory: 'preferences',
      }],
    }
    mockDecisionEngine.performSourceCheck.mockReturnValue(strongCheckResult)

    const confirmDecision = makeDecision({
      action: 'ask_user',
      conflict: false,
      requiresUserConfirmation: true,
    })
    mockMemoryService.submitMemorySource.mockResolvedValue(ok({
      decision: confirmDecision,
    }))

    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '我更喜欢暗色主题',
      agentOutput: '已记录偏好变更',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.memorized).toBe(false)
      expect(result.data.conflictDetected).toBe(true)
    }
  })

  // ─── submitMemorySource 失败 ───

  it('submitMemorySource 失败 → 返回错误', async () => {
    const strongCheckResult: MemorySourceCheckResult = {
      signalStrength: 'strong',
      candidates: [{
        candidateText: '决定升级 Node.js 版本',
        targetMemoryScope: 'shared',
        targetAgentRoles: [],
        memoryCategory: 'decisions',
      }],
    }
    mockDecisionEngine.performSourceCheck.mockReturnValue(strongCheckResult)

    mockMemoryService.submitMemorySource.mockResolvedValue(err({
      code: 'MEMORY_WRITE_FAILED',
      module: 'agent-memory-minimal',
      message: '记忆写入失败',
      recoverable: true,
    }))

    const result = await manager.processTurnEnd('/tmp/test', 'conv-001', {
      userInput: '升级 Node.js',
      agentOutput: '确认升级',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MEMORY_WRITE_FAILED')
    }
  })
})
