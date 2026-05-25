// tests/integration/node-flow-and-evidence.test.ts
// T19a: 节点流转与证据检查
// 验证：节点推进、阻塞、回流、完成的状态迁移和 trace 证据链

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { WorkspaceManager } from '../../src-main/storage/workspace-manager'

// Mock electron 模块（WorkspaceManager 构造函数依赖 app.getPath）
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => os.tmpdir()),
  },
}))
import { ConversationRuntimeManager } from '../../src-main/runtime/conversation-runtime-manager'
import { WorkflowRegistry } from '../../src-main/workflows/workflow-registry'
import { WorkflowRunner } from '../../src-main/workflows/workflow-runner'
import { NodeTransitionService } from '../../src-main/workflows/node-transition-service'
import { DisplayTraceService } from '../../src-main/trace/display-trace-service'
import type { TaskRuntime } from '../../src-main/contracts/types'

describe('节点流转与证据检查', () => {
  let tmpDir: string
  let workspaceManager: WorkspaceManager
  let conversationManager: ConversationRuntimeManager
  let workflowRegistry: WorkflowRegistry
  let workflowRunner: WorkflowRunner
  let traceService: DisplayTraceService

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-node-'))
    workspaceManager = new WorkspaceManager()
    conversationManager = new ConversationRuntimeManager()
    workflowRegistry = new WorkflowRegistry()
    workflowRunner = new WorkflowRunner(workflowRegistry)
    traceService = new DisplayTraceService()

    await workspaceManager.initWorkspace(tmpDir, 'node-flow-ws')
    await workflowRegistry.loadBuiltinDomainWorkflows(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  async function startWorkflow(taskDomain: string) {
    const convResult = await conversationManager.create(tmpDir, {
      title: '节点流转测试', taskType: 'development', taskDomain,
    })
    if (!convResult.ok) throw new Error('conversation create failed')
    const conv = (convResult as any).data

    const startResult = await workflowRunner.startTaskWorkflow({
      workspaceRootPath: tmpDir,
      workspaceId: conv.workspaceId,
      conversationId: conv.id,
      taskDomain,
      title: '节点流转任务',
      operatorRole: 'tech_lead',
    })
    if (!startResult.ok) throw new Error('workflow start failed')
    return (startResult as any).data
  }

  it('首节点为 running，其余为 pending', async () => {
    const context = await startWorkflow('existing-repo-iteration')

    const runningNodes = context.nodeStates.filter((n: any) => n.state === 'running')
    const pendingNodes = context.nodeStates.filter((n: any) => n.state === 'pending')

    expect(runningNodes.length).toBe(1)
    expect(pendingNodes.length).toBe(context.workflow.nodes.length - 1)
  })

  it('推进节点 → 前节点 completed，后节点 running', async () => {
    const context = await startWorkflow('research-prestudy')

    const advanceResult = await workflowRunner.advanceTaskWorkflow({
      workspaceRootPath: tmpDir,
      taskId: context.taskId,
    })
    expect(advanceResult.ok).toBe(true)
    const advance = (advanceResult as any).data

    expect(advance.previousNodeId).toBeTruthy()
    expect(advance.currentNodeState).toBe('running')
    expect(advance.workflowCompleted).toBe(false)
  })

  it('全部节点推进完成 → workflowCompleted=true', async () => {
    const context = await startWorkflow('research-prestudy')

    // 推进 4 次（research-prestudy 有 4 个节点）
    for (let i = 0; i < 3; i++) {
      await workflowRunner.advanceTaskWorkflow({
        workspaceRootPath: tmpDir,
        taskId: context.taskId,
      })
    }

    // 最后一次推进
    const lastAdvance = await workflowRunner.advanceTaskWorkflow({
      workspaceRootPath: tmpDir,
      taskId: context.taskId,
    })
    expect(lastAdvance.ok).toBe(true)
    expect((lastAdvance as any).data.workflowCompleted).toBe(true)
  })

  it('阻塞节点 → TaskRuntime.status=blocked', async () => {
    const context = await startWorkflow('existing-repo-iteration')

    const blockResult = await workflowRunner.blockTaskWorkflowNode({
      workspaceRootPath: tmpDir,
      taskId: context.taskId,
      reason: '等待用户确认',
      waitingFor: 'user_confirmation',
    })
    expect(blockResult.ok).toBe(true)
    expect((blockResult as any).data.reason).toBe('等待用户确认')
    expect((blockResult as any).data.task.status).toBe('blocked')
  })

  it('回流 → 创建 BackflowRecord + 节点状态重置', async () => {
    const context = await startWorkflow('research-prestudy')

    // 先推进一次
    await workflowRunner.advanceTaskWorkflow({
      workspaceRootPath: tmpDir,
      taskId: context.taskId,
    })

    // 回流到首节点
    const returnResult = await workflowRunner.returnTaskWorkflow({
      workspaceRootPath: tmpDir,
      taskId: context.taskId,
      toNodeId: 'requirement-frame',
      reason: '需求变更需要重新框定',
      targetType: 'product_manager',
    })
    expect(returnResult.ok).toBe(true)
    const ret = (returnResult as any).data

    expect(ret.fromNodeId).toBeTruthy()
    expect(ret.toNodeId).toBe('requirement-frame')
    expect(ret.backflowRecord).toBeTruthy()
    expect(ret.backflowRecord.reason).toBe('需求变更需要重新框定')
  })

  it('DisplayTrace 证据链可查询', async () => {
    const context = await startWorkflow('research-prestudy')

    // 推进节点产生 trace
    await workflowRunner.advanceTaskWorkflow({
      workspaceRootPath: tmpDir,
      taskId: context.taskId,
    })

    // 查询 trace
    const traceResult = await traceService.queryByConversation(
      tmpDir, context.conversationId, 20,
    )
    expect(traceResult.ok).toBe(true)

    const events = (traceResult as any).data
    // 至少有 task_created + node_started + node_completed + node_started 等
    expect(events.length).toBeGreaterThan(0)
  })

  it('NodeTransitionService 状态迁移校验', () => {
    const service = new NodeTransitionService()

    // pending → running 合法
    const r1 = service.transitionNode(
      [{ nodeId: 'n1', nodeName: 'N1', state: 'pending', enteredAt: '', previousState: null, role: 'code' }],
      'n1', 'running',
    )
    expect(r1.ok).toBe(true)

    // completed → running 非法
    const r2 = service.transitionNode(
      [{ nodeId: 'n1', nodeName: 'N1', state: 'completed', enteredAt: '', previousState: null, role: 'code' }],
      'n1', 'running',
    )
    expect(r2.ok).toBe(false)
  })
})
