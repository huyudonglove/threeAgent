// tests/scenarios/resume-task.test.ts
// T28: 任务恢复场景测试
// 验证：blocked 节点返回阻塞信息、running 节点推进、无上下文返回 resumed:false

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskRuntimeManager, ResumeTaskResult } from '../../src-main/runtime/task-runtime-manager'
import { Result, ok, err } from '../../src-main/errors/result'
import type { ConversationRuntime } from '../../src-main/contracts/types'

// ─── Mock 工厂 ───

function makeConversation(overrides: Partial<ConversationRuntime> = {}): ConversationRuntime {
  return {
    id: 'conv-001',
    workspaceId: 'ws-001',
    title: '测试会话',
    taskType: 'development',
    status: 'active',
    currentTaskId: 'task_001',
    currentWorkflowId: null,
    currentNodeName: null,
    taskDomain: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function createMockWorkflowRunner() {
  return {
    restoreContext: vi.fn(),
    getBlockedNode: vi.fn(),
    getRunningNodeFromContext: vi.fn(),
    advanceTaskWorkflow: vi.fn(),
    startTaskWorkflow: vi.fn(),
    completeTaskWorkflowNode: vi.fn(),
    blockTaskWorkflowNode: vi.fn(),
    returnTaskWorkflow: vi.fn(),
    clearContext: vi.fn(),
  }
}

function createMockConversationManager() {
  return {
    read: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    setMemoryService: vi.fn(),
    setMemoryDecisionEngine: vi.fn(),
    processTurnEnd: vi.fn(),
  }
}

describe('TaskRuntimeManager.resumeTask 场景测试', () => {
  let taskManager: TaskRuntimeManager
  let mockRunner: ReturnType<typeof createMockWorkflowRunner>
  let mockConvManager: ReturnType<typeof createMockConversationManager>

  beforeEach(() => {
    taskManager = new TaskRuntimeManager()
    mockRunner = createMockWorkflowRunner()
    mockConvManager = createMockConversationManager()
    taskManager.setWorkflowRunner(mockRunner as any)
    taskManager.setConversationManager(mockConvManager as any)
  })

  // ─── 无依赖注入 ───

  it('未注入依赖 → 返回错误', async () => {
    const freshManager = new TaskRuntimeManager()
    const result = await freshManager.resumeTask('/tmp/test', 'conv-001')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TASK_STATE_INVALID')
    }
  })

  // ─── 会话不存在 ───

  it('会话不存在 → 返回错误', async () => {
    mockConvManager.read.mockResolvedValue(err({
      code: 'CONV_NOT_FOUND',
      module: 'conversation',
      message: 'Conversation "conv-999" not found',
      recoverable: true,
    }))

    const result = await taskManager.resumeTask('/tmp/test', 'conv-999')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('CONV_NOT_FOUND')
    }
  })

  // ─── 会话无 currentTaskId ───

  it('会话无 currentTaskId → resumed: false', async () => {
    mockConvManager.read.mockResolvedValue(ok(makeConversation({ currentTaskId: null })))

    const result = await taskManager.resumeTask('/tmp/test', 'conv-001')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.resumed).toBe(false)
    }
  })

  // ─── 无工作流上下文 ───

  it('会话有 currentTaskId 但无工作流上下文 → resumed: false', async () => {
    mockConvManager.read.mockResolvedValue(ok(makeConversation()))
    mockRunner.restoreContext.mockResolvedValue(null)

    const result = await taskManager.resumeTask('/tmp/test', 'conv-001')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.resumed).toBe(false)
    }
  })

  // ─── 有 blocked 节点 ───

  it('会话有 blocked 节点 → 返回阻塞信息', async () => {
    const mockContext = { taskId: 'task_001', nodeStates: [] }
    mockConvManager.read.mockResolvedValue(ok(makeConversation()))
    mockRunner.restoreContext.mockResolvedValue(mockContext)
    mockRunner.getBlockedNode.mockReturnValue({
      nodeId: 'node-2',
      nodeName: 'CodeReview',
      state: 'blocked',
    })

    const result = await taskManager.resumeTask('/tmp/test', 'conv-001')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.resumed).toBe(false)
      expect(result.data.status).toBe('blocked')
      expect(result.data.blockReason).toBeTruthy()
      expect(result.data.currentNodeId).toBe('node-2')
    }
  })

  it('blocked 节点无 nodeName → 使用默认 blockReason', async () => {
    const mockContext = { taskId: 'task_001', nodeStates: [] }
    mockConvManager.read.mockResolvedValue(ok(makeConversation()))
    mockRunner.restoreContext.mockResolvedValue(mockContext)
    mockRunner.getBlockedNode.mockReturnValue({
      nodeId: 'node-3',
      nodeName: undefined as any,
      state: 'blocked',
    })

    const result = await taskManager.resumeTask('/tmp/test', 'conv-001')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.resumed).toBe(false)
      expect(result.data.blockReason).toBe('Node is blocked')
    }
  })

  // ─── 有 running 节点 → 推进 ───

  it('会话有 running 节点 → 推进工作流 (resumed: true)', async () => {
    const mockContext = { taskId: 'task_001', nodeStates: [] }
    mockConvManager.read.mockResolvedValue(ok(makeConversation()))
    mockRunner.restoreContext.mockResolvedValue(mockContext)
    mockRunner.getBlockedNode.mockReturnValue(undefined)
    mockRunner.getRunningNodeFromContext.mockReturnValue({
      nodeId: 'node-1',
      nodeName: 'Implementation',
      state: 'running',
    })
    mockRunner.advanceTaskWorkflow.mockResolvedValue(ok({
      task: { id: 'task_001', status: 'running' },
      currentNodeId: 'node-2',
      currentNodeState: 'running',
      previousNodeId: 'node-1',
      nodeStates: [],
      workflowCompleted: false,
    }))

    const result = await taskManager.resumeTask('/tmp/test', 'conv-001')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.resumed).toBe(true)
      expect(result.data.currentNodeId).toBe('node-2')
      expect(result.data.status).toBe('running')
    }
    expect(mockRunner.advanceTaskWorkflow).toHaveBeenCalledWith({
      workspaceRootPath: '/tmp/test',
      taskId: 'task_001',
    })
  })

  it('推进工作流失败 → 返回错误', async () => {
    const mockContext = { taskId: 'task_001', nodeStates: [] }
    mockConvManager.read.mockResolvedValue(ok(makeConversation()))
    mockRunner.restoreContext.mockResolvedValue(mockContext)
    mockRunner.getBlockedNode.mockReturnValue(undefined)
    mockRunner.getRunningNodeFromContext.mockReturnValue({
      nodeId: 'node-1',
      nodeName: 'Implementation',
      state: 'running',
    })
    mockRunner.advanceTaskWorkflow.mockResolvedValue(err({
      code: 'TASK_STATE_INVALID',
      module: 'workflow-runner',
      message: 'Cannot advance',
      recoverable: true,
    }))

    const result = await taskManager.resumeTask('/tmp/test', 'conv-001')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TASK_STATE_INVALID')
    }
  })

  // ─── 无 running 也无 blocked 节点 ───

  it('有上下文但无 running/blocked 节点 → resumed: false', async () => {
    const mockContext = { taskId: 'task_001', nodeStates: [] }
    mockConvManager.read.mockResolvedValue(ok(makeConversation()))
    mockRunner.restoreContext.mockResolvedValue(mockContext)
    mockRunner.getBlockedNode.mockReturnValue(undefined)
    mockRunner.getRunningNodeFromContext.mockReturnValue(undefined)

    const result = await taskManager.resumeTask('/tmp/test', 'conv-001')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.resumed).toBe(false)
    }
  })
})
