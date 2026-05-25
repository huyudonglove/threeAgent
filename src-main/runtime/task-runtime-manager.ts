// src-main/runtime/task-runtime-manager.ts
// 任务运行态管理

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import type { TaskRuntime, TaskStatus } from '../contracts/types'
import { validateTaskRuntime } from '../validation/structure'
import { validateTaskTransition } from '../validation/state-transition'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import type { WorkflowRunner } from '../workflows/workflow-runner'
import { ConversationRuntimeManager } from './conversation-runtime-manager'

// ─── 恢复任务结果 ───

export interface ResumeTaskResult {
  resumed: boolean
  currentNodeId?: string
  status?: string
  blockReason?: string
}

export class TaskRuntimeManager {
  private workflowRunner: WorkflowRunner | null = null
  private conversationManager: ConversationRuntimeManager | null = null

  /**
   * 注入 WorkflowRunner 依赖（避免循环引用，由 main.ts 延迟注入）
   */
  setWorkflowRunner(runner: WorkflowRunner): void {
    this.workflowRunner = runner
  }

  /**
   * 注入 ConversationRuntimeManager 依赖
   */
  setConversationManager(manager: ConversationRuntimeManager): void {
    this.conversationManager = manager
  }
  /**
   * 创建新任务运行态
   */
  async create(
    workspaceRootPath: string,
    conversationId: string,
    input: { title: string; owner: string; currentNodeName: string; workflowId?: string; domainName?: string },
  ): Promise<Result<TaskRuntime>> {
    const resolver = new PathResolver(workspaceRootPath)
    const now = new Date().toISOString()
    const taskId = `task_${Date.now()}`

    // 获取 workspaceId
    let workspaceId = ''
    const manifestResult = await JsonStore.read<{ id: string }>(resolver.manifestPath)
    if (manifestResult.ok) {
      workspaceId = manifestResult.data.id
    }

    const task: TaskRuntime = {
      id: taskId,
      workspaceId,
      conversationId,
      title: input.title,
      owner: input.owner,
      status: 'running',
      currentNodeName: input.currentNodeName,
      workflowId: input.workflowId ?? null,
      domainName: input.domainName ?? null,
      blockedReason: null,
      waitingFor: null,
      backflowCount: 0,
      confirmationCount: 0,
      artifactIds: [],
      createdAt: now,
      updatedAt: now,
    }

    const validation = validateTaskRuntime(task)
    if (!validation.ok) {
      return err(createError('TASK_CREATE_FAILED', 'task-runtime', 'Validation failed', { detail: validation.issues }))
    }

    const writeResult = await JsonStore.write(resolver.taskRuntimePath(taskId), task)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(task)
  }

  /**
   * 读取任务运行态
   */
  async read(workspaceRootPath: string, taskId: string): Promise<Result<TaskRuntime>> {
    const resolver = new PathResolver(workspaceRootPath)
    const result = await JsonStore.read<TaskRuntime>(resolver.taskRuntimePath(taskId))
    if (!result.ok) {
      return err(createError('TASK_NOT_FOUND', 'task-runtime', `Task "${taskId}" not found`, {
        recoverable: true,
        suggestedAction: 'Check if the task ID is correct.',
        detail: result.error,
      }))
    }
    return ok(result.data)
  }

  /**
   * 更新任务状态（含状态迁移校验）
   */
  async updateStatus(
    workspaceRootPath: string,
    taskId: string,
    newStatus: TaskStatus,
  ): Promise<Result<void>> {
    const readResult = await this.read(workspaceRootPath, taskId)
    if (!readResult.ok) return readResult as Result<never>

    const transition = validateTaskTransition(readResult.data.status, newStatus)
    if (!transition.ok) {
      return err(createError('TASK_TRANSITION_INVALID', 'task-runtime',
        `Invalid transition: ${readResult.data.status} → ${newStatus}`, {
          detail: transition.issues,
        }))
    }

    return this.update(workspaceRootPath, taskId, {
      status: newStatus,
      blockedReason: newStatus === 'blocked' ? readResult.data.blockedReason : null,
    })
  }

  /**
   * 阻塞任务（同时设置 blockedReason 和 waitingFor）
   */
  async blockTask(
    workspaceRootPath: string,
    taskId: string,
    reason: string,
    waitingFor?: string,
  ): Promise<Result<void>> {
    const readResult = await this.read(workspaceRootPath, taskId)
    if (!readResult.ok) return readResult as Result<never>

    const transition = validateTaskTransition(readResult.data.status, 'blocked')
    if (!transition.ok) {
      return err(createError('TASK_TRANSITION_INVALID', 'task-runtime',
        `Invalid transition: ${readResult.data.status} → blocked`, {
          detail: transition.issues,
        }))
    }

    return this.update(workspaceRootPath, taskId, {
      status: 'blocked',
      blockedReason: reason,
      waitingFor: waitingFor ?? null,
    })
  }

  /**
   * 设置当前节点
   */
  async setCurrentNode(
    workspaceRootPath: string,
    taskId: string,
    nodeName: string,
  ): Promise<Result<void>> {
    return this.update(workspaceRootPath, taskId, { currentNodeName: nodeName })
  }

  /**
   * 通用更新方法
   */
  private async update(
    workspaceRootPath: string,
    taskId: string,
    patch: Partial<TaskRuntime>,
  ): Promise<Result<void>> {
    const readResult = await this.read(workspaceRootPath, taskId)
    if (!readResult.ok) return readResult as Result<never>

    const updated: TaskRuntime = {
      ...readResult.data,
      ...patch,
      id: readResult.data.id,
      workspaceId: readResult.data.workspaceId,
      conversationId: readResult.data.conversationId,
      updatedAt: new Date().toISOString(),
    }

    const resolver = new PathResolver(workspaceRootPath)
    return JsonStore.write(resolver.taskRuntimePath(taskId), updated)
  }

  // ─── 恢复/继续入口 ───

  /**
   * 恢复/继续指定会话的任务工作流
   *
   * 步骤：
   * 1. 读取会话获取 currentTaskId
   * 2. 通过 WorkflowRunner 恢复工作流上下文
   * 3. 如果上下文存在且有阻塞节点，返回阻塞信息
   * 4. 如果上下文存在且有 pending/running 节点，推进工作流
   */
  async resumeTask(
    workspaceRootPath: string,
    conversationId: string,
  ): Promise<Result<ResumeTaskResult>> {
    if (!this.workflowRunner || !this.conversationManager) {
      return err(createError('TASK_STATE_INVALID', 'task-runtime',
        'WorkflowRunner or ConversationRuntimeManager not injected', {
          recoverable: false,
          suggestedAction: 'Call setWorkflowRunner/setConversationManager before using resumeTask.',
        }))
    }

    // 1. 读取会话获取 currentTaskId
    const convResult = await this.conversationManager.read(workspaceRootPath, conversationId)
    if (!convResult.ok) {
      return err(createError('CONV_NOT_FOUND', 'task-runtime',
        `Conversation "${conversationId}" not found`, {
          recoverable: true,
          suggestedAction: 'Check if the conversation ID is correct.',
          detail: convResult.error,
        }))
    }

    const conversation = convResult.data
    const taskId = conversation.currentTaskId

    if (!taskId) {
      return ok({ resumed: false })
    }

    // 2. 恢复工作流上下文（三级恢复：内存 → 磁盘 → null）
    const context = await this.workflowRunner.restoreContext(workspaceRootPath, taskId)
    if (!context) {
      // 没有工作流上下文，无法恢复
      return ok({ resumed: false })
    }

    // 3. 检查是否有阻塞节点
    const blockedNode = this.workflowRunner.getBlockedNode(context)
    if (blockedNode) {
      return ok({
        resumed: false,
        currentNodeId: blockedNode.nodeId,
        status: 'blocked',
        blockReason: blockedNode.nodeName ?? 'Node is blocked',
      })
    }

    // 4. 检查是否有 running/pending 节点
    const runningNode = this.workflowRunner.getRunningNodeFromContext(context)
    if (runningNode) {
      // 有正在运行的节点，推进工作流
      const advanceResult = await this.workflowRunner.advanceTaskWorkflow({
        workspaceRootPath,
        taskId,
      })

      if (!advanceResult.ok) {
        return err(createError('TASK_STATE_INVALID', 'task-runtime',
          `Failed to advance workflow for task "${taskId}"`, {
            recoverable: true,
            suggestedAction: 'Check workflow state and retry.',
            detail: advanceResult.error,
          }))
      }

      return ok({
        resumed: true,
        currentNodeId: advanceResult.data.currentNodeId,
        status: advanceResult.data.currentNodeState,
      })
    }

    // 没有可恢复的节点
    return ok({ resumed: false })
  }
}
