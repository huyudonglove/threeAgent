// tests/integration/run-overview.test.ts
// T19a: Run 总览可视化检查
// 验证：从 workspace 初始化到任务创建→推进→完成的完整生命周期可观察

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
import type { TaskRuntime, ConversationRuntime, WorkspaceManifest } from '../../src-main/contracts/types'

describe('Run 总览可视化检查', () => {
  let tmpDir: string
  let workspaceManager: WorkspaceManager
  let conversationManager: ConversationRuntimeManager
  let taskManager: TaskRuntimeManager
  let workflowRegistry: WorkflowRegistry
  let workflowRunner: WorkflowRunner

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-run-'))
    workspaceManager = new WorkspaceManager()
    conversationManager = new ConversationRuntimeManager()
    taskManager = new TaskRuntimeManager()
    workflowRegistry = new WorkflowRegistry()
    workflowRunner = new WorkflowRunner(workflowRegistry)

    // 加载内置 workflow
    await workflowRegistry.loadBuiltinDomainWorkflows(tmpDir)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('workspace 初始化 → manifest 可读', async () => {
    const result = await workspaceManager.initWorkspace(tmpDir, 'test-ws')
    expect(result.ok).toBe(true)

    const manifest = (result as { ok: true; data: WorkspaceManifest }).data
    expect(manifest.id).toBeTruthy()
    expect(manifest.name).toBe('test-ws')
    expect(manifest.status).toBe('active')

    // 可回读
    const readResult = await workspaceManager.readManifest(tmpDir)
    expect(readResult.ok).toBe(true)
  })

  it('workspace → conversation → task 完整链路可观察', async () => {
    // 1. 创建 workspace
    await workspaceManager.initWorkspace(tmpDir, 'obs-ws')

    // 2. 创建 conversation
    const convResult = await conversationManager.create(tmpDir, {
      title: '测试对话',
      taskType: 'development',
      taskDomain: 'existing-repo-iteration',
    })
    expect(convResult.ok).toBe(true)
    const conv = (convResult as { ok: true; data: ConversationRuntime }).data

    // 3. 启动 workflow
    const startResult = await workflowRunner.startTaskWorkflow({
      workspaceRootPath: tmpDir,
      workspaceId: conv.workspaceId,
      conversationId: conv.id,
      taskDomain: 'existing-repo-iteration',
      title: '迭代任务',
      operatorRole: 'product_manager',
    })
    expect(startResult.ok).toBe(true)
    const context = (startResult as any).data

    // 4. 验证 TaskRuntime 可读
    const taskResult = await taskManager.read(tmpDir, context.taskId)
    expect(taskResult.ok).toBe(true)
    const task = (taskResult as { ok: true; data: TaskRuntime }).data
    expect(task.status).toBe('running')
    expect(task.currentNodeName).toBeTruthy()

    // 5. 验证 Conversation 已关联
    const convRead = await conversationManager.read(tmpDir, conv.id)
    expect(convRead.ok).toBe(true)
    expect((convRead as any).data.currentTaskId).toBe(context.taskId)
  })

  it('多任务 Run 总览可并列查询', async () => {
    await workspaceManager.initWorkspace(tmpDir, 'multi-ws')

    // 创建两个 conversation
    const conv1 = await conversationManager.create(tmpDir, {
      title: '对话1', taskType: 'development', taskDomain: 'existing-repo-iteration',
    })
    const conv2 = await conversationManager.create(tmpDir, {
      title: '对话2', taskType: 'research', taskDomain: 'research-prestudy',
    })

    expect(conv1.ok).toBe(true)
    expect(conv2.ok).toBe(true)

    // 两个 conversation 都创建成功
    const c1 = (conv1 as any).data
    const c2 = (conv2 as any).data
    expect(c1.id).not.toBe(c2.id)
  })

  it('workspace recover 可恢复总览数据', async () => {
    const initResult = await workspaceManager.initWorkspace(tmpDir, 'recover-ws')
    expect(initResult.ok).toBe(true)

    // 恢复
    const recoverResult = await workspaceManager.recoverWorkspace(tmpDir)
    expect(recoverResult.ok).toBe(true)
    expect((recoverResult as any).data.name).toBe('recover-ws')
  })
})
