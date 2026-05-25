// tests/recovery/workspace-recovery.test.ts
// T19: 工作区恢复测试
// 验证：重启后数据可恢复、工作流上下文可从持久化文件恢复、DisplayTrace 数据可读

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
import { TaskRuntimeManager } from '../../src-main/runtime/task-runtime-manager'
import { WorkflowRegistry } from '../../src-main/workflows/workflow-registry'
import { WorkflowRunner } from '../../src-main/workflows/workflow-runner'
import { DisplayTraceService } from '../../src-main/trace/display-trace-service'
import { ArtifactService } from '../../src-main/artifacts/artifact-service'
import { BackflowManager } from '../../src-main/runtime/backflow-manager'
import type { TaskRuntime, ConversationRuntime, WorkspaceManifest } from '../../src-main/contracts/types'

describe('工作区恢复测试', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-recovery-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  /**
   * 阶段一：初始化工作区并写入若干状态
   * 返回关键 ID 供阶段二使用
   */
  async function populateWorkspace(): Promise<{
    conversationId: string
    taskId: string
    workspaceId: string
  }> {
    const workspaceManager = new WorkspaceManager()
    const conversationManager = new ConversationRuntimeManager()
    const workflowRegistry = new WorkflowRegistry()
    const workflowRunner = new WorkflowRunner(workflowRegistry)

    // 1. 初始化工作区
    const initResult = await workspaceManager.initWorkspace(tmpDir, 'recovery-ws')
    expect(initResult.ok).toBe(true)

    // 加载内置工作流
    await workflowRegistry.loadBuiltinDomainWorkflows(tmpDir)

    // 2. 创建会话
    const convResult = await conversationManager.create(tmpDir, {
      title: '恢复测试会话',
      taskType: 'development',
      taskDomain: 'existing-repo-iteration',
    })
    expect(convResult.ok).toBe(true)
    const conv = (convResult as { ok: true; data: ConversationRuntime }).data

    // 3. 启动工作流（创建任务运行态）
    const startResult = await workflowRunner.startTaskWorkflow({
      workspaceRootPath: tmpDir,
      workspaceId: conv.workspaceId,
      conversationId: conv.id,
      taskDomain: 'existing-repo-iteration',
      title: '恢复测试任务',
      operatorRole: 'tech_lead',
    })
    expect(startResult.ok).toBe(true)
    const context = (startResult as any).data

    // 4. 推进节点产生更多 trace
    await workflowRunner.advanceTaskWorkflow({
      workspaceRootPath: tmpDir,
      taskId: context.taskId,
    })

    return {
      conversationId: conv.id,
      taskId: context.taskId,
      workspaceId: conv.workspaceId,
    }
  }

  it('重启后 manifest 可恢复', async () => {
    await populateWorkspace()

    // 模拟"重启"：重新实例化 WorkspaceManager
    const newWorkspaceManager = new WorkspaceManager()
    const recoverResult = await newWorkspaceManager.recoverWorkspace(tmpDir)
    expect(recoverResult.ok).toBe(true)
    if (!recoverResult.ok) return

    const manifest = (recoverResult as { ok: true; data: WorkspaceManifest }).data
    expect(manifest.name).toBe('recovery-ws')
    expect(manifest.status).toBe('active')
    expect(manifest.lastActiveAt).toBeTruthy()
  })

  it('重启后会话数据可正常读取', async () => {
    const { conversationId } = await populateWorkspace()

    // 重新实例化
    const newConversationManager = new ConversationRuntimeManager()
    const readResult = await newConversationManager.read(tmpDir, conversationId)
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return

    const conv = (readResult as { ok: true; data: ConversationRuntime }).data
    expect(conv.title).toBe('恢复测试会话')
    expect(conv.status).toBe('active')
    expect(conv.currentTaskId).toBeTruthy()
  })

  it('重启后任务运行态可正常读取', async () => {
    const { taskId } = await populateWorkspace()

    // 重新实例化
    const newTaskManager = new TaskRuntimeManager()
    const readResult = await newTaskManager.read(tmpDir, taskId)
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return

    const task = (readResult as { ok: true; data: TaskRuntime }).data
    expect(task.title).toBe('恢复测试任务')
    expect(task.status).toBe('running')
    expect(task.currentNodeName).toBeTruthy()
  })

  it('重启后工作流上下文可从持久化文件恢复', async () => {
    const { taskId } = await populateWorkspace()

    // 重新实例化 WorkflowRunner（内存缓存清空）
    const newWorkflowRegistry = new WorkflowRegistry()
    await newWorkflowRegistry.loadBuiltinDomainWorkflows(tmpDir)
    const newWorkflowRunner = new WorkflowRunner(newWorkflowRegistry)

    // 重新实例化后内存中无 context，advance 应触发从磁盘恢复
    const advanceResult = await newWorkflowRunner.advanceTaskWorkflow({
      workspaceRootPath: tmpDir,
      taskId,
    })
    expect(advanceResult.ok).toBe(true)

    const advance = (advanceResult as any).data
    expect(advance.previousNodeId).toBeTruthy()
    expect(advance.currentNodeState).toBe('running')
    expect(advance.workflowCompleted).toBe(false)
  })

  it('重启后 DisplayTrace 数据可读', async () => {
    const { conversationId } = await populateWorkspace()

    // 重新实例化
    const newTraceService = new DisplayTraceService()
    const traceResult = await newTraceService.queryByConversation(
      tmpDir, conversationId, 50,
    )
    expect(traceResult.ok).toBe(true)

    const events = (traceResult as any).data
    // 至少有 task_created + node_started + node_completed + node_started
    expect(events.length).toBeGreaterThan(0)
  })

  it('重启后多模块数据一致性检查', async () => {
    const { conversationId, taskId } = await populateWorkspace()

    // 重新实例化所有 manager
    const newConversationManager = new ConversationRuntimeManager()
    const newTaskManager = new TaskRuntimeManager()
    const newWorkspaceManager = new WorkspaceManager()

    // 恢复 manifest
    const manifestResult = await newWorkspaceManager.recoverWorkspace(tmpDir)
    expect(manifestResult.ok).toBe(true)

    // 恢复 conversation
    const convResult = await newConversationManager.read(tmpDir, conversationId)
    expect(convResult.ok).toBe(true)
    const conv = (convResult as any).data

    // 恢复 task
    const taskResult = await newTaskManager.read(tmpDir, taskId)
    expect(taskResult.ok).toBe(true)
    const task = (taskResult as any).data

    // 交叉验证：conversation.currentTaskId 应匹配 task.id
    expect(conv.currentTaskId).toBe(task.id)

    // 交叉验证：task.conversationId 应匹配 conversation.id
    expect(task.conversationId).toBe(conv.id)
  })

  it('工作区不存在时 recover 返回错误', async () => {
    const workspaceManager = new WorkspaceManager()
    const result = await workspaceManager.recoverWorkspace(tmpDir)
    expect(result.ok).toBe(false)
  })

  it('重启后会话列表可枚举', async () => {
    await populateWorkspace()

    const newWorkspaceManager = new WorkspaceManager()
    const listResult = await newWorkspaceManager.listConversations(tmpDir)
    expect(listResult.ok).toBe(true)
    if (!listResult.ok) return
    expect(listResult.data.length).toBeGreaterThanOrEqual(1)
  })

  it('重启后回流记录可读', async () => {
    const { taskId } = await populateWorkspace()

    // 重新实例化 WorkflowRunner 并执行回流操作
    const newWorkflowRegistry = new WorkflowRegistry()
    await newWorkflowRegistry.loadBuiltinDomainWorkflows(tmpDir)
    const newWorkflowRunner = new WorkflowRunner(newWorkflowRegistry)

    // 执行回流
    const returnResult = await newWorkflowRunner.returnTaskWorkflow({
      workspaceRootPath: tmpDir,
      taskId,
      toNodeId: 'repo-review',
      reason: '恢复测试回流',
      targetType: 'tech_lead',
    })
    expect(returnResult.ok).toBe(true)

    // 验证回流记录可读
    const newBackflowManager = new BackflowManager()
    const backflowResult = await newBackflowManager.listByTask(tmpDir, taskId)
    expect(backflowResult.ok).toBe(true)
    if (!backflowResult.ok) return
    expect(backflowResult.data.length).toBeGreaterThanOrEqual(1)
    expect(backflowResult.data[0].reason).toBe('恢复测试回流')
  })
})
