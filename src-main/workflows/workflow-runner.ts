// src-main/workflows/workflow-runner.ts
// 最小流程推进器
// 来源：T11 workflow-runner-minimal、TaskRuntime任务运行时设计、WorkflowStateAndBackflow流程状态与回流机制
// 来源：统一状态机与状态迁移约束

import type { TaskRuntime, TaskStatus, DomainWorkflowDefinition, BackflowRecord } from '../contracts/types'
import type { NodeStateRecord, WorkflowNodeState } from './node-transition-service'
import { NodeTransitionService } from './node-transition-service'
import { WorkflowRegistry } from './workflow-registry'
import { TaskRuntimeManager } from '../runtime/task-runtime-manager'
import { ConversationRuntimeManager } from '../runtime/conversation-runtime-manager'
import { BackflowManager } from '../runtime/backflow-manager'
import { ArtifactService } from '../artifacts/artifact-service'
import { DisplayTraceService } from '../trace/display-trace-service'
import { ResultPersistenceService } from '../results/result-persistence-service'
import { validateTaskTransition } from '../validation/state-transition'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'

// ─── WorkflowRunner 运行时上下文 ───

/**
 * 持久化到磁盘的 workflow 上下文快照
 */
interface PersistedWorkflowContext {
  taskId: string
  workflowId: string
  workspaceRootPath: string
  workspaceId: string
  conversationId: string
  operatorRole: string
  nodeStates: NodeStateRecord[]
  currentNodeName: string
  startedAt: string
}

/**
 * 单个 workflow 执行实例的运行时上下文
 * 维护节点状态、关联的 TaskRuntime 等
 */
export interface WorkflowExecutionContext {
  taskId: string
  workspaceRootPath: string
  workspaceId: string
  conversationId: string
  workflowId: string
  workflow: DomainWorkflowDefinition
  nodeStates: NodeStateRecord[]
  operatorRole: string
}

/**
 * 节点推进结果
 */
export interface NodeAdvanceResult {
  task: TaskRuntime
  nodeStates: NodeStateRecord[]
  previousNodeId: string | null
  currentNodeId: string
  currentNodeState: WorkflowNodeState
  traceWritten: boolean
}

/**
 * 阻塞结果
 */
export interface NodeBlockResult {
  task: TaskRuntime
  nodeStates: NodeStateRecord[]
  blockedNodeId: string
  reason: string
  traceWritten: boolean
}

/**
 * 回流结果
 */
export interface BackflowResult {
  task: TaskRuntime
  nodeStates: NodeStateRecord[]
  fromNodeId: string
  toNodeId: string
  backflowRecord: BackflowRecord
  traceWritten: boolean
}

/**
 * 节点完成结果
 */
export interface NodeCompleteResult {
  task: TaskRuntime
  nodeStates: NodeStateRecord[]
  completedNodeId: string
  workflowCompleted: boolean
  traceWritten: boolean
}

// ─── WorkflowRunner ───

/**
 * 最小流程推进器
 *
 * 职责：
 * - 启动任务流程
 * - 推进节点
 * - 阻塞节点
 * - 回流
 * - 完成节点
 * - 驱动 TaskRuntime / Artifact / DisplayTrace 联动
 *
 * 关键约束：
 * - 写入顺序：真源先于镜像，正文先于索引
 * - DisplayTrace 写失败不回滚运行态真源
 * - 节点状态迁移必须经过校验
 */
export class WorkflowRunner {
  private nodeTransitionService: NodeTransitionService
  private taskManager: TaskRuntimeManager
  private conversationManager: ConversationRuntimeManager
  private backflowManager: BackflowManager
  private artifactService: ArtifactService
  private traceService: DisplayTraceService
  private resultPersistenceService: ResultPersistenceService
  private registry: WorkflowRegistry

  /** 运行中的 workflow 上下文（taskId → context） */
  private activeContexts = new Map<string, WorkflowExecutionContext>()

  constructor(registry?: WorkflowRegistry) {
    this.nodeTransitionService = new NodeTransitionService()
    this.taskManager = new TaskRuntimeManager()
    this.conversationManager = new ConversationRuntimeManager()
    this.backflowManager = new BackflowManager()
    this.artifactService = new ArtifactService()
    this.traceService = new DisplayTraceService()
    this.resultPersistenceService = new ResultPersistenceService()
    this.registry = registry ?? new WorkflowRegistry()
  }

  /**
   * 获取 WorkflowRegistry
   */
  getRegistry(): WorkflowRegistry {
    return this.registry
  }

  // ─── 1. startTaskWorkflow ───

  /**
   * 启动任务流程
   * 来源：模块接口I/O契约 - WorkflowRunner.startTaskWorkflow
   *
   * 步骤：
   * 1. 按 taskDomain 解析 workflow
   * 2. 创建 TaskRuntime（status=running）
   * 3. 初始化节点状态（首节点 running，其余 pending）
   * 4. 更新 ConversationRuntime 的 currentTaskId/currentWorkflowId/currentNodeName
   * 5. 写 DisplayTrace（降级容忍）
   */
  async startTaskWorkflow(input: {
    workspaceRootPath: string
    workspaceId: string
    conversationId: string
    taskDomain: string
    title: string
    operatorRole: string
  }): Promise<Result<WorkflowExecutionContext>> {
    // 1. 解析 workflow
    const workflowResult = this.registry.resolveWorkflowByTaskDomain(input.taskDomain)
    if (!workflowResult.ok) {
      return err(createError('TASK_CREATE_FAILED', 'workflow-runner',
        `Cannot resolve workflow for taskDomain "${input.taskDomain}"`, {
          recoverable: true,
          suggestedAction: 'Register a domain workflow for this taskDomain first.',
          detail: workflowResult.error,
        }))
    }
    const workflow = workflowResult.data

    // 2. 创建 TaskRuntime
    const firstNode = workflow.nodes[0]
    if (!firstNode) {
      return err(createError('TASK_CREATE_FAILED', 'workflow-runner',
        `Workflow "${workflow.id}" has no nodes`, {
          recoverable: false,
        }))
    }

    const taskResult = await this.taskManager.create(
      input.workspaceRootPath,
      input.conversationId,
      {
        title: input.title,
        owner: input.operatorRole,
        currentNodeName: firstNode.name,
        workflowId: workflow.id,
        domainName: workflow.taskDomain,
      },
    )
    if (!taskResult.ok) return taskResult as Result<never>
    const task = taskResult.data

    // 3. 初始化节点状态，首节点设为 running
    let nodeStates = this.nodeTransitionService.initializeNodeStates(workflow)
    const transitionResult = this.nodeTransitionService.transitionNode(
      nodeStates, firstNode.id, 'running',
    )
    if (!transitionResult.ok) {
      // 节点初始化失败 → 删除刚创建的 task
      return err(createError('TASK_CREATE_FAILED', 'workflow-runner',
        `Failed to initialize first node "${firstNode.id}"`, {
          detail: transitionResult.error,
        }))
    }
    nodeStates = transitionResult.data

    // 4. 更新 ConversationRuntime
    await this.conversationManager.update(input.workspaceRootPath, input.conversationId, {
      currentTaskId: task.id,
      currentWorkflowId: workflow.id,
      currentNodeName: firstNode.name,
      taskDomain: input.taskDomain,
    })

    // 5. 构建 context
    const context: WorkflowExecutionContext = {
      taskId: task.id,
      workspaceRootPath: input.workspaceRootPath,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      workflowId: workflow.id,
      workflow,
      nodeStates,
      operatorRole: input.operatorRole,
    }

    this.activeContexts.set(task.id, context)

    // 持久化上下文
    await this.persistContext(context)

    // 6. 写 DisplayTrace（降级容忍）
    await this.appendTraceSafely(context, 'task_created', task.id, `Task "${input.title}" created with workflow "${workflow.name}"`)
    await this.appendTraceSafely(context, 'node_started', firstNode.id, `Node "${firstNode.name}" started`, input.operatorRole)

    // 6b. 写 trace：首节点预期产出与工具信息
    if (firstNode.expectedOutputs && firstNode.expectedOutputs.length > 0) {
      const expectedSummary = firstNode.expectedOutputs.map(e => e.artifactType).join(', ')
      const toolsInfo = firstNode.tools.length > 0 ? `，需要工具：${firstNode.tools.join(', ')}` : ''
      await this.appendTraceSafely(context, 'node_output', firstNode.id,
        `进入节点 "${firstNode.name}"，预期产出：${expectedSummary}${toolsInfo}`)
    } else if (firstNode.tools.length > 0) {
      await this.appendTraceSafely(context, 'node_output', firstNode.id,
        `进入节点 "${firstNode.name}"，需要工具：${firstNode.tools.join(', ')}`)
    }

    return ok(context)
  }

  // ─── 2. advanceTaskWorkflow ───

  /**
   * 推进任务流程到下一个节点
   * 来源：模块接口I/O契约 - WorkflowRunner.advanceTaskWorkflow
   *
   * 步骤：
   * 1. 完成当前 running 节点 → completed
   * 2. 激活下一个 pending 节点 → running
   * 3. 更新 TaskRuntime.currentNodeName
   * 4. 更新 ConversationRuntime.currentNodeName
   * 5. 写 DisplayTrace（降级容忍）
   */
  async advanceTaskWorkflow(input: {
    workspaceRootPath: string
    taskId: string
  }): Promise<Result<NodeAdvanceResult>> {
    const context = await this.getOrCreateContext(input.workspaceRootPath, input.taskId)
    if (!context) {
      return err(createError('TASK_NOT_FOUND', 'workflow-runner',
        `No active workflow context for task "${input.taskId}"`, {
          recoverable: true,
          suggestedAction: 'Start the task workflow first.',
        }))
    }

    // 1. 找到当前 running 节点
    const runningNode = this.nodeTransitionService.getRunningNode(context.nodeStates)
    if (!runningNode) {
      return err(createError('TASK_STATE_INVALID', 'workflow-runner',
        `No running node found for task "${input.taskId}"`, {
          recoverable: true,
          suggestedAction: 'Check if the workflow is already completed or blocked.',
        }))
    }

    const previousNodeId = runningNode.nodeId

    // 2. 完成当前节点
    const completeResult = this.nodeTransitionService.transitionNode(
      context.nodeStates, runningNode.nodeId, 'completed',
    )
    if (!completeResult.ok) return completeResult as Result<never>
    context.nodeStates = completeResult.data

    // 3. 查找下一个节点
    const nextNodeId = this.nodeTransitionService.getNextNodeId(context.workflow, runningNode.nodeId)

    // 写 trace：当前节点完成
    await this.appendTraceSafely(context, 'node_completed', runningNode.nodeId,
      `Node "${runningNode.nodeName}" completed`, context.operatorRole)

    // 检查 workflow 是否全部完成
    if (!nextNodeId || this.nodeTransitionService.isWorkflowCompleted(context.nodeStates)) {
      // 更新 TaskRuntime → done
      await this.taskManager.updateStatus(input.workspaceRootPath, input.taskId, 'done')

      // 更新 context
      this.activeContexts.set(input.taskId, context)
      await this.persistContext(context)

      // 写 trace：任务完成
      await this.appendTraceSafely(context, 'task_status_changed', input.taskId,
        `Task completed (all nodes done)`)

      // 自动触发结果沉淀
      try {
        await this.resultPersistenceService.collectAndPersist({
          rootPath: input.workspaceRootPath,
          taskId: input.taskId,
          conversationId: context.conversationId,
          operatorRole: context.operatorRole,
        })
        await this.appendTraceSafely(context, 'artifact_status_changed', input.taskId,
          `任务结果已自动沉淀`)
      } catch {
        // 结果沉淀失败不阻塞主流程
      }

      // 重新读取 task
      const taskResult = await this.taskManager.read(input.workspaceRootPath, input.taskId)
      if (!taskResult.ok) return taskResult as Result<never>

      return ok({
        task: taskResult.data,
        nodeStates: context.nodeStates,
        previousNodeId,
        currentNodeId: runningNode.nodeId,
        currentNodeState: 'completed',
        traceWritten: true,
        workflowCompleted: true,
      })
    }

    // 4. 激活下一个节点
    const activateResult = this.nodeTransitionService.transitionNode(
      context.nodeStates, nextNodeId, 'running',
    )
    if (!activateResult.ok) return activateResult as Result<never>
    context.nodeStates = activateResult.data

    const nextNode = context.workflow.nodes.find(n => n.id === nextNodeId)!

    // 5. 更新 TaskRuntime
    await this.taskManager.setCurrentNode(input.workspaceRootPath, input.taskId, nextNode.name)

    // 6. 更新 ConversationRuntime
    await this.conversationManager.update(input.workspaceRootPath, context.conversationId, {
      currentNodeName: nextNode.name,
    })

    // 7. 写 trace
    await this.appendTraceSafely(context, 'node_started', nextNodeId,
      `Node "${nextNode.name}" started`, context.operatorRole)

    // 7b. 写 trace：节点预期产出与工具信息
    if (nextNode.expectedOutputs && nextNode.expectedOutputs.length > 0) {
      const expectedSummary = nextNode.expectedOutputs.map(e => e.artifactType).join(', ')
      const toolsInfo = nextNode.tools.length > 0 ? `，需要工具：${nextNode.tools.join(', ')}` : ''
      await this.appendTraceSafely(context, 'node_output', nextNodeId,
        `进入节点 "${nextNode.name}"，预期产出：${expectedSummary}${toolsInfo}`)
    } else if (nextNode.tools.length > 0) {
      await this.appendTraceSafely(context, 'node_output', nextNodeId,
        `进入节点 "${nextNode.name}"，需要工具：${nextNode.tools.join(', ')}`)
    }

    // 更新 context
    this.activeContexts.set(input.taskId, context)
    await this.persistContext(context)

    // 重新读取 task
    const taskResult = await this.taskManager.read(input.workspaceRootPath, input.taskId)
    if (!taskResult.ok) return taskResult as Result<never>

    return ok({
      task: taskResult.data,
      nodeStates: context.nodeStates,
      previousNodeId,
      currentNodeId: nextNodeId,
      currentNodeState: 'running',
      traceWritten: true,
      workflowCompleted: false,
    })
  }

  // ─── 3. blockTaskWorkflowNode ───

  /**
   * 阻塞当前节点
   * 来源：模块接口I/O契约 - WorkflowRunner.blockTaskWorkflowNode
   *
   * 步骤：
   * 1. 将当前 running 节点 → blocked
   * 2. 更新 TaskRuntime → blocked + blockedReason
   * 3. 写 DisplayTrace（降级容忍）
   */
  async blockTaskWorkflowNode(input: {
    workspaceRootPath: string
    taskId: string
    reason: string
    waitingFor?: string
  }): Promise<Result<NodeBlockResult>> {
    const context = await this.getOrCreateContext(input.workspaceRootPath, input.taskId)
    if (!context) {
      return err(createError('TASK_NOT_FOUND', 'workflow-runner',
        `No active workflow context for task "${input.taskId}"`))
    }

    const runningNode = this.nodeTransitionService.getRunningNode(context.nodeStates)
    if (!runningNode) {
      return err(createError('TASK_STATE_INVALID', 'workflow-runner',
        `No running node to block for task "${input.taskId}"`))
    }

    // 1. 节点 → blocked
    const blockResult = this.nodeTransitionService.transitionNode(
      context.nodeStates, runningNode.nodeId, 'blocked',
    )
    if (!blockResult.ok) return blockResult as Result<never>
    context.nodeStates = blockResult.data

    // 2. 更新 TaskRuntime → blocked（含 blockedReason 和 waitingFor）
    await this.taskManager.blockTask(
      input.workspaceRootPath, input.taskId, input.reason, input.waitingFor,
    )

    // 3. 写 trace
    await this.appendTraceSafely(context, 'node_blocked', runningNode.nodeId,
      `Node "${runningNode.nodeName}" blocked: ${input.reason}`)

    // 更新 context
    this.activeContexts.set(input.taskId, context)
    await this.persistContext(context)

    const taskResult = await this.taskManager.read(input.workspaceRootPath, input.taskId)
    if (!taskResult.ok) return taskResult as Result<never>

    return ok({
      task: taskResult.data,
      nodeStates: context.nodeStates,
      blockedNodeId: runningNode.nodeId,
      reason: input.reason,
      traceWritten: true,
    })
  }

  // ─── 4. returnTaskWorkflow ───

  /**
   * 回流到指定节点
   * 来源：模块接口I/O契约 - WorkflowRunner.returnTaskWorkflow
   * 来源：WorkflowStateAndBackflow流程状态与回流机制
   *
   * 步骤：
   * 1. 当前 running 节点 → backflow
   * 2. 目标节点 → pending（如果已完成则重置）
   * 3. 目标节点之后的节点 → pending（重新执行）
   * 4. 创建 BackflowRecord
   * 5. 更新 TaskRuntime
   * 6. 写 DisplayTrace（降级容忍）
   */
  async returnTaskWorkflow(input: {
    workspaceRootPath: string
    taskId: string
    toNodeId: string
    reason: string
    targetType?: BackflowRecord['targetType']
  }): Promise<Result<BackflowResult>> {
    const context = await this.getOrCreateContext(input.workspaceRootPath, input.taskId)
    if (!context) {
      return err(createError('TASK_NOT_FOUND', 'workflow-runner',
        `No active workflow context for task "${input.taskId}"`))
    }

    const runningNode = this.nodeTransitionService.getRunningNode(context.nodeStates)
    if (!runningNode) {
      return err(createError('TASK_STATE_INVALID', 'workflow-runner',
        `No running node to return from for task "${input.taskId}"`))
    }

    // 验证目标节点存在
    const toNodeIndex = this.nodeTransitionService.getNodeIndex(context.workflow, input.toNodeId)
    if (toNodeIndex === -1) {
      return err(createError('TASK_NOT_FOUND', 'workflow-runner',
        `Target node "${input.toNodeId}" not found in workflow`))
    }

    // 1. 当前节点 → backflow
    const backflowTransition = this.nodeTransitionService.transitionNode(
      context.nodeStates, runningNode.nodeId, 'backflow',
    )
    if (!backflowTransition.ok) return backflowTransition as Result<never>
    context.nodeStates = backflowTransition.data

    // 2. 重置目标节点及其之后的所有节点为 pending
    const currentRunningIndex = this.nodeTransitionService.getNodeIndex(context.workflow, runningNode.nodeId)
    for (let i = toNodeIndex; i <= currentRunningIndex; i++) {
      const nodeId = context.workflow.nodes[i].id
      const nodeState = context.nodeStates.find(n => n.nodeId === nodeId)
      if (nodeState && nodeState.state !== 'pending' && nodeState.state !== 'backflow') {
        const resetResult = this.nodeTransitionService.transitionNode(
          context.nodeStates, nodeId, 'pending', true,
        )
        if (resetResult.ok) {
          context.nodeStates = resetResult.data
        }
        // 如果无法重置为 pending（比如已经是 pending），跳过
      }
    }

    // 3. 激活目标节点为 running
    const activateResult = this.nodeTransitionService.transitionNode(
      context.nodeStates, input.toNodeId, 'running',
    )
    if (!activateResult.ok) return activateResult as Result<never>
    context.nodeStates = activateResult.data

    const toNode = context.workflow.nodes.find(n => n.id === input.toNodeId)!

    // 4. 创建 BackflowRecord
    const backflowRecord: BackflowRecord = {
      id: `backflow_${Date.now()}`,
      taskId: input.taskId,
      fromNode: runningNode.nodeId,
      toNode: input.toNodeId,
      reason: input.reason,
      targetType: input.targetType ?? 'tech_lead',
      createdAt: new Date().toISOString(),
    }
    await this.backflowManager.append(input.workspaceRootPath, backflowRecord)

    // 5. 更新 TaskRuntime
    await this.taskManager.setCurrentNode(input.workspaceRootPath, input.taskId, toNode.name)

    // 如果 task 之前是 blocked，恢复为 running
    const taskReadResult = await this.taskManager.read(input.workspaceRootPath, input.taskId)
    if (taskReadResult.ok && taskReadResult.data.status === 'blocked') {
      await this.taskManager.updateStatus(input.workspaceRootPath, input.taskId, 'running')
    }

    // 更新 ConversationRuntime
    await this.conversationManager.update(input.workspaceRootPath, context.conversationId, {
      currentNodeName: toNode.name,
    })

    // 6. 写 trace
    await this.appendTraceSafely(context, 'node_backflow', runningNode.nodeId,
      `Backflow from "${runningNode.nodeName}" to "${toNode.name}": ${input.reason}`)
    await this.appendTraceSafely(context, 'backflow_created', backflowRecord.id,
      `Backflow record created: ${runningNode.nodeName} → ${toNode.name}`)
    await this.appendTraceSafely(context, 'node_started', input.toNodeId,
      `Node "${toNode.name}" restarted after backflow`, context.operatorRole)

    // 更新 context
    this.activeContexts.set(input.taskId, context)
    await this.persistContext(context)

    const taskResult = await this.taskManager.read(input.workspaceRootPath, input.taskId)
    if (!taskResult.ok) return taskResult as Result<never>

    return ok({
      task: taskResult.data,
      nodeStates: context.nodeStates,
      fromNodeId: runningNode.nodeId,
      toNodeId: input.toNodeId,
      backflowRecord,
      traceWritten: true,
    })
  }

  // ─── 5. completeTaskWorkflowNode ───

  /**
   * 完成当前节点（含可选产物生成）
   * 来源：模块接口I/O契约 - WorkflowRunner.completeTaskWorkflowNode
   *
   * 步骤：
   * 1. 当前 running 节点 → completed
   * 2. 如果提供了 artifact 内容，创建产物（正文 + 索引）
   * 3. 更新 TaskRuntime
   * 4. 写 DisplayTrace（降级容忍）
   * 5. 如果后续无节点，自动完成任务
   */
  async completeTaskWorkflowNode(input: {
    workspaceRootPath: string
    taskId: string
    artifact?: {
      artifactType: string
      title: string
      format: 'markdown' | 'json' | 'jsonl'
      content: string
    }
    summary?: string
  }): Promise<Result<NodeCompleteResult>> {
    const context = await this.getOrCreateContext(input.workspaceRootPath, input.taskId)
    if (!context) {
      return err(createError('TASK_NOT_FOUND', 'workflow-runner',
        `No active workflow context for task "${input.taskId}"`))
    }

    const runningNode = this.nodeTransitionService.getRunningNode(context.nodeStates)
    if (!runningNode) {
      return err(createError('TASK_STATE_INVALID', 'workflow-runner',
        `No running node to complete for task "${input.taskId}"`))
    }

    // 1. 节点 → completed
    const completeResult = this.nodeTransitionService.transitionNode(
      context.nodeStates, runningNode.nodeId, 'completed',
    )
    if (!completeResult.ok) return completeResult as Result<never>
    context.nodeStates = completeResult.data

    // 2. 如果有产物，创建
    if (input.artifact) {
      const artifactResult = await this.artifactService.createArtifact({
        workspaceRootPath: input.workspaceRootPath,
        conversationId: context.conversationId,
        taskId: input.taskId,
        artifactType: input.artifact.artifactType,
        title: input.artifact.title,
        format: input.artifact.format,
        content: input.artifact.content,
        createdByRole: context.operatorRole,
        createdFromNode: runningNode.nodeId,
      })

      if (artifactResult.ok) {
        // 写 trace：产物创建
        await this.appendTraceSafely(context, 'artifact_created', artifactResult.data.id,
          `Artifact "${input.artifact.title}" created at node "${runningNode.nodeName}"`)
      }
      // 产物创建失败不阻塞节点完成，但记录降级
    }

    // 2b. 自动创建 expectedOutputs 产物（draft placeholder）
    const currentNodeDef = context.workflow.nodes.find(n => n.id === runningNode.nodeId)
    if (currentNodeDef?.expectedOutputs && currentNodeDef.expectedOutputs.length > 0) {
      const createdArtifactIds: string[] = []
      for (const expected of currentNodeDef.expectedOutputs) {
        // 如果调用方已通过 input.artifact 显式提供了同类型产物，跳过
        if (input.artifact && input.artifact.artifactType === expected.artifactType) continue

        const autoArtifactResult = await this.artifactService.createArtifact({
          workspaceRootPath: input.workspaceRootPath,
          conversationId: context.conversationId,
          taskId: input.taskId,
          artifactType: expected.artifactType,
          title: expected.title,
          format: 'markdown',
          content: `# ${expected.title}\n\n> Placeholder: 待填充实际内容`,
          createdByRole: context.operatorRole,
          createdFromNode: runningNode.nodeId,
        })
        if (autoArtifactResult.ok) {
          createdArtifactIds.push(autoArtifactResult.data.id)
        }
      }

      // 写 trace：节点产出摘要
      if (createdArtifactIds.length > 0) {
        const artifactSummary = currentNodeDef.expectedOutputs
          .filter(e => !input.artifact || input.artifact.artifactType !== e.artifactType)
          .map(e => e.artifactType)
          .join(', ')
        const toolsSummary = currentNodeDef.tools.length > 0 ? `，使用工具：${currentNodeDef.tools.join(', ')}` : ''
        await this.appendTraceSafely(context, 'node_output', runningNode.nodeId,
          `节点 "${runningNode.nodeName}" 产出：${artifactSummary}${toolsSummary}`)
      }
    }

    // 3. 写 trace：节点完成
    await this.appendTraceSafely(context, 'node_completed', runningNode.nodeId,
      `Node "${runningNode.nodeName}" completed${input.summary ? `: ${input.summary}` : ''}`,
      context.operatorRole)

    // 4. 检查 workflow 是否全部完成
    const workflowCompleted = this.nodeTransitionService.isWorkflowCompleted(context.nodeStates)

    if (workflowCompleted) {
      // 任务完成
      await this.taskManager.updateStatus(input.workspaceRootPath, input.taskId, 'done')
      await this.appendTraceSafely(context, 'task_status_changed', input.taskId,
        `Task completed (all nodes done)`)

      // 自动触发结果沉淀
      try {
        const task = await this.taskManager.read(input.workspaceRootPath, input.taskId)
        if (task.ok) {
          await this.resultPersistenceService.collectAndPersist({
            rootPath: input.workspaceRootPath,
            taskId: input.taskId,
            conversationId: context.conversationId,
            operatorRole: context.operatorRole,
          })
          await this.appendTraceSafely(context, 'artifact_status_changed', input.taskId,
            `任务结果已自动沉淀`)
        }
      } catch {
        // 结果沉淀失败不阻塞主流程
      }
    } else {
      // 检查是否有下一个节点可推进
      const nextNodeId = this.nodeTransitionService.getNextNodeId(context.workflow, runningNode.nodeId)
      if (nextNodeId) {
        // 自动激活下一个节点
        const activateResult = this.nodeTransitionService.transitionNode(
          context.nodeStates, nextNodeId, 'running',
        )
        if (activateResult.ok) {
          context.nodeStates = activateResult.data
          const nextNode = context.workflow.nodes.find(n => n.id === nextNodeId)!

          await this.taskManager.setCurrentNode(input.workspaceRootPath, input.taskId, nextNode.name)
          await this.conversationManager.update(input.workspaceRootPath, context.conversationId, {
            currentNodeName: nextNode.name,
          })

          await this.appendTraceSafely(context, 'node_started', nextNodeId,
            `Node "${nextNode.name}" started`, context.operatorRole)

          // 写 trace：新节点预期产出与工具信息
          if (nextNode.expectedOutputs && nextNode.expectedOutputs.length > 0) {
            const expectedSummary = nextNode.expectedOutputs.map(e => e.artifactType).join(', ')
            const toolsInfo = nextNode.tools.length > 0 ? `，需要工具：${nextNode.tools.join(', ')}` : ''
            await this.appendTraceSafely(context, 'node_output', nextNodeId,
              `进入节点 "${nextNode.name}"，预期产出：${expectedSummary}${toolsInfo}`)
          } else if (nextNode.tools.length > 0) {
            await this.appendTraceSafely(context, 'node_output', nextNodeId,
              `进入节点 "${nextNode.name}"，需要工具：${nextNode.tools.join(', ')}`)
          }
        }
      }
    }

    // 更新 context
    this.activeContexts.set(input.taskId, context)
    await this.persistContext(context)

    const taskResult = await this.taskManager.read(input.workspaceRootPath, input.taskId)
    if (!taskResult.ok) return taskResult as Result<never>

    return ok({
      task: taskResult.data,
      nodeStates: context.nodeStates,
      completedNodeId: runningNode.nodeId,
      workflowCompleted,
      traceWritten: true,
    })
  }

  // ─── 上下文管理 ───

  /**
   * 获取指定任务的执行上下文
   */
  getContext(taskId: string): WorkflowExecutionContext | undefined {
    return this.activeContexts.get(taskId)
  }

  /**
   * 获取所有活跃的 workflow 上下文
   */
  getActiveContexts(): WorkflowExecutionContext[] {
    return Array.from(this.activeContexts.values())
  }

  /**
   * 从磁盘恢复上下文（公开方法，供外部调用恢复）
   * 三级恢复：内存 → 磁盘 → null
   */
  async restoreContext(workspaceRootPath: string, taskId: string): Promise<WorkflowExecutionContext | null> {
    return this.getOrCreateContext(workspaceRootPath, taskId)
  }

  /**
   * 获取当前 running 节点（公开方法）
   */
  getRunningNodeFromContext(context: WorkflowExecutionContext): NodeStateRecord | undefined {
    return this.nodeTransitionService.getRunningNode(context.nodeStates)
  }

  /**
   * 获取所有节点状态中是否有 blocked 节点
   */
  getBlockedNode(context: WorkflowExecutionContext): NodeStateRecord | undefined {
    return context.nodeStates.find(n => n.state === 'blocked')
  }

  /**
   * 清除指定任务的上下文
   */
  clearContext(taskId: string): void {
    this.activeContexts.delete(taskId)
  }

  // ─── 私有方法 ───

  /**
   * 获取或重建上下文
   * 1. 先查内存缓存
   * 2. 缓存不存在时，从磁盘持久化文件恢复
   * 3. 文件不存在时返回 null
   */
  private async getOrCreateContext(
    workspaceRootPath: string,
    taskId: string,
  ): Promise<WorkflowExecutionContext | null> {
    const existing = this.activeContexts.get(taskId)
    if (existing) return existing

    // 尝试从持久化文件恢复
    const resolver = new PathResolver(workspaceRootPath)
    const contextPath = resolver.workflowContextPath(taskId)
    const fileExists = await JsonStore.exists(contextPath)
    if (!fileExists) return null

    const readResult = await JsonStore.read<PersistedWorkflowContext>(contextPath)
    if (!readResult.ok) return null

    const persisted = readResult.data
    // 校验基本字段
    if (!persisted.taskId || !persisted.workflowId || !persisted.nodeStates) return null

    // 从 registry 重新加载 workflow 定义
    const workflow = this.registry.getById(persisted.workflowId)
    if (!workflow) return null

    const context: WorkflowExecutionContext = {
      taskId: persisted.taskId,
      workspaceRootPath: persisted.workspaceRootPath,
      workspaceId: persisted.workspaceId,
      conversationId: persisted.conversationId,
      workflowId: persisted.workflowId,
      workflow,
      nodeStates: persisted.nodeStates,
      operatorRole: persisted.operatorRole,
    }

    this.activeContexts.set(taskId, context)
    return context
  }

  /**
   * 将 WorkflowExecutionContext 持久化到磁盘
   * 写失败不阻塞主流程（降级容忍）
   */
  private async persistContext(context: WorkflowExecutionContext): Promise<void> {
    try {
      const resolver = new PathResolver(context.workspaceRootPath)
      const contextPath = resolver.workflowContextPath(context.taskId)

      // 找到当前 running 节点名称
      const runningNode = this.nodeTransitionService.getRunningNode(context.nodeStates)
      const currentNodeName = runningNode?.nodeName ??
        context.workflow.nodes[context.workflow.nodes.length - 1]?.name ?? ''

      const persisted: PersistedWorkflowContext = {
        taskId: context.taskId,
        workflowId: context.workflowId,
        workspaceRootPath: context.workspaceRootPath,
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        operatorRole: context.operatorRole,
        nodeStates: context.nodeStates,
        currentNodeName,
        startedAt: new Date().toISOString(),
      }

      await JsonStore.write(contextPath, persisted)
    } catch {
      // 持久化失败不阻塞主流程
    }
  }

  /**
   * 安全地追加 DisplayTrace 事件
   * 关键约束：trace 写失败不回滚运行态真源
   */
  private async appendTraceSafely(
    context: WorkflowExecutionContext,
    eventType: import('../trace/display-trace-types').DisplayTraceEventType,
    dataId: string,
    summary: string,
    actorRole?: string,
  ): Promise<boolean> {
    try {
      const result = await this.traceService.appendEvent({
        workspaceRootPath: context.workspaceRootPath,
        workspaceId: context.workspaceId,
        conversationId: context.conversationId,
        taskId: context.taskId,
        eventType,
        dataName: context.workflow.name,
        dataId,
        actorRole: actorRole ?? context.operatorRole,
        summary,
      })
      return result.ok
    } catch {
      // trace 写失败不阻塞主流程
      return false
    }
  }
}
