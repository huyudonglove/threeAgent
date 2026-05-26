// src-main/runtime/workbench-state-service.ts
// 工作台聚合读取：把真源运行态、工作流上下文、产物和展示镜像拼成 GUI 可直接渲染的状态。

import type {
  ArtifactIndexEntry,
  ConversationRuntime,
  TaskRuntime,
  WorkflowNodeDefinition,
  WorkspaceManifest,
} from '../contracts/types'
import type { Result } from '../errors/result'
import { ok } from '../errors/result'
import type { DisplayTraceEvent } from '../trace/display-trace-types'
import type { WorkspaceManager } from '../storage/workspace-manager'
import type { ConversationRuntimeManager } from './conversation-runtime-manager'
import type { TaskRuntimeManager } from './task-runtime-manager'
import type { ArtifactService } from '../artifacts/artifact-service'
import type { DisplayTraceService } from '../trace/display-trace-service'
import type { WorkflowExecutionContext, WorkflowRunner } from '../workflows/workflow-runner'
import type { NodeStateRecord } from '../workflows/node-transition-service'

export interface WorkbenchAvailableAction {
  id: 'advance' | 'complete' | 'block' | 'return' | 'resume'
  label: string
  enabled: boolean
  reason: string | null
}

export interface WorkbenchCurrentNode {
  id: string | null
  name: string
  role: string | null
  state: string | null
  summary: string | null
  reason: string | null
  expectedOutputs: WorkflowNodeDefinition['expectedOutputs']
}

export interface WorkbenchCurrentState {
  workspace: WorkspaceManifest
  conversation: ConversationRuntime | null
  task: TaskRuntime | null
  workflowContext: WorkflowExecutionContext | null
  currentNode: WorkbenchCurrentNode | null
  artifacts: ArtifactIndexEntry[]
  timeline: DisplayTraceEvent[]
  availableActions: WorkbenchAvailableAction[]
}

export class WorkbenchStateService {
  constructor(private deps: {
    workspaceManager: WorkspaceManager
    conversationManager: ConversationRuntimeManager
    taskManager: TaskRuntimeManager
    artifactService: ArtifactService
    traceService: DisplayTraceService
    workflowRunner: WorkflowRunner
  }) {}

  async getCurrentState(
    rootPath: string,
    conversationId?: string,
  ): Promise<Result<WorkbenchCurrentState>> {
    const workspaceResult = await this.deps.workspaceManager.readManifest(rootPath)
    if (!workspaceResult.ok) return workspaceResult as Result<never>

    const conversationResult = await this.resolveConversation(rootPath, conversationId)
    if (!conversationResult.ok) return conversationResult as Result<never>

    const conversation = conversationResult.data
    if (!conversation?.currentTaskId) {
      return ok({
        workspace: workspaceResult.data,
        conversation,
        task: null,
        workflowContext: null,
        currentNode: null,
        artifacts: [],
        timeline: await this.readTimeline(rootPath, conversation?.id ?? null),
        availableActions: this.deriveActions(null, null),
      })
    }

    const taskResult = await this.deps.taskManager.read(rootPath, conversation.currentTaskId)
    if (!taskResult.ok) return taskResult as Result<never>
    const task = taskResult.data

    await this.deps.workflowRunner.getRegistry().loadBuiltinDomainWorkflows(rootPath)
    const workflowContext = await this.deps.workflowRunner.restoreContext(rootPath, task.id)
    const artifacts = await this.readArtifacts(rootPath, task.id)
    const timeline = await this.readTimeline(rootPath, conversation.id)

    return ok({
      workspace: workspaceResult.data,
      conversation,
      task,
      workflowContext,
      currentNode: this.deriveCurrentNode(task, workflowContext),
      artifacts,
      timeline,
      availableActions: this.deriveActions(task, workflowContext),
    })
  }

  private async resolveConversation(
    rootPath: string,
    conversationId?: string,
  ): Promise<Result<ConversationRuntime | null>> {
    if (conversationId) {
      const result = await this.deps.conversationManager.read(rootPath, conversationId)
      if (!result.ok) return result as Result<never>
      return ok(result.data)
    }

    const idsResult = await this.deps.workspaceManager.listConversations(rootPath)
    if (!idsResult.ok) return idsResult as Result<never>

    const conversations: ConversationRuntime[] = []
    for (const id of idsResult.data) {
      const result = await this.deps.conversationManager.read(rootPath, id)
      if (result.ok && result.data.status !== 'closed') {
        conversations.push(result.data)
      }
    }

    conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    return ok(conversations[0] ?? null)
  }

  private async readArtifacts(rootPath: string, taskId: string): Promise<ArtifactIndexEntry[]> {
    const result = await this.deps.artifactService.listArtifactsByTask(rootPath, taskId)
    return result.ok ? result.data : []
  }

  private async readTimeline(rootPath: string, conversationId: string | null): Promise<DisplayTraceEvent[]> {
    if (!conversationId) return []
    const result = await this.deps.traceService.readSummary(rootPath, conversationId, 20)
    return result.ok ? result.data : []
  }

  private deriveCurrentNode(
    task: TaskRuntime,
    context: WorkflowExecutionContext | null,
  ): WorkbenchCurrentNode | null {
    const state = this.findCurrentNodeState(task, context)
    const definition = context?.workflow.nodes.find(node =>
      node.id === (state?.nodeId ?? task.currentNodeId) || node.name === task.currentNodeName,
    )

    if (!state && !definition && !task.currentNodeName) return null

    return {
      id: state?.nodeId ?? definition?.id ?? task.currentNodeId ?? null,
      name: state?.nodeName ?? definition?.name ?? task.currentNodeName,
      role: state?.role ?? definition?.role ?? null,
      state: state?.state ?? task.status,
      summary: definition?.summary ?? null,
      reason: definition?.reason ?? task.blockedReason ?? null,
      expectedOutputs: definition?.expectedOutputs,
    }
  }

  private findCurrentNodeState(
    task: TaskRuntime,
    context: WorkflowExecutionContext | null,
  ): NodeStateRecord | undefined {
    if (!context) return undefined
    return context.nodeStates.find(node => node.state === 'running' || node.state === 'blocked')
      ?? context.nodeStates.find(node => node.nodeId === task.currentNodeId)
      ?? context.nodeStates.find(node => node.nodeName === task.currentNodeName)
  }

  private deriveActions(
    task: TaskRuntime | null,
    context: WorkflowExecutionContext | null,
  ): WorkbenchAvailableAction[] {
    const hasContext = Boolean(context)
    const isRunning = task?.status === 'running'
    const isBlocked = task?.status === 'blocked'
    const isTerminal = task?.status === 'done' || task?.status === 'cancelled'

    return [
      this.createAction('advance', '下一步', Boolean(task && hasContext && isRunning), task, hasContext, '任务运行中才可以推进'),
      this.createAction('complete', '完成当前节点', Boolean(task && hasContext && isRunning), task, hasContext, '任务运行中才可以完成节点'),
      this.createAction('block', '标记阻塞', Boolean(task && hasContext && isRunning), task, hasContext, '任务运行中才可以标记阻塞'),
      this.createAction('return', '回流', Boolean(task && hasContext && !isTerminal), task, hasContext, '已结束任务不能回流'),
      this.createAction('resume', '继续', Boolean(task && hasContext && isBlocked), task, hasContext, '只有阻塞任务需要继续'),
    ]
  }

  private createAction(
    id: WorkbenchAvailableAction['id'],
    label: string,
    enabled: boolean,
    task: TaskRuntime | null,
    hasContext: boolean,
    fallback: string,
  ): WorkbenchAvailableAction {
    return {
      id,
      label,
      enabled,
      reason: enabled ? null : this.disabledReason(task, hasContext, fallback),
    }
  }

  private disabledReason(
    task: TaskRuntime | null,
    hasContext: boolean,
    fallback: string,
  ): string | null {
    if (!task) return '当前没有任务'
    if (!hasContext) return '缺少工作流上下文'
    return fallback
  }
}
