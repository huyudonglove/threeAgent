// src-main/workflows/node-transition-service.ts
// 节点状态迁移服务
// 来源：统一状态机 - WorkflowNodeState 正式状态值与迁移约束
// 来源：WorkflowStateAndBackflow流程状态与回流机制

import type { DomainWorkflowDefinition, WorkflowNodeDefinition } from '../contracts/types'
import { validateNodeTransition } from '../validation/state-transition'
import type { ValidationResult } from '../validation/types'
import { makeValidationResult, makeIssue } from '../validation/types'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

// ─── 统一状态机中的 WorkflowNodeState ───

/**
 * WorkflowNodeState 正式状态值
 * 来源：统一状态机（8 个正式状态对象）
 */
export type WorkflowNodeState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'skipped'
  | 'backflow'

/**
 * WorkflowNodeState 合法迁移映射
 * 来源：统一状态机 - WorkflowNodeState 写入责任方为 WorkflowRunner
 */
export const WORKFLOW_NODE_TRANSITIONS: Record<WorkflowNodeState, WorkflowNodeState[]> = {
  pending: ['running', 'skipped'],
  running: ['completed', 'blocked', 'failed', 'backflow'],
  completed: [],
  blocked: ['running', 'backflow', 'skipped'],
  failed: ['running', 'pending'],
  skipped: [],
  backflow: ['running', 'pending'],
}

/**
 * 运行时节点状态追踪
 * 每个 workflow 执行中的节点状态记录
 */
export interface NodeStateRecord {
  nodeId: string
  nodeName: string
  state: WorkflowNodeState
  enteredAt: string
  previousState: WorkflowNodeState | null
  role: string
}

/**
 * 节点状态迁移校验
 */
export function validateWorkflowNodeTransition(
  from: WorkflowNodeState,
  to: WorkflowNodeState,
  nodeId?: string,
): ValidationResult {
  const allowed = WORKFLOW_NODE_TRANSITIONS[from]
  if (!allowed?.includes(to)) {
    return makeValidationResult([
      makeIssue('state', 'invalid_state_transition', 'state',
        `Invalid node state transition: "${from}" → "${to}"`, 'error', nodeId),
    ])
  }
  return makeValidationResult([])
}

// ─── 节点迁移服务 ───

export class NodeTransitionService {
  /**
   * 初始化 workflow 中所有节点的状态为 pending
   */
  initializeNodeStates(workflow: DomainWorkflowDefinition): NodeStateRecord[] {
    const now = new Date().toISOString()
    return workflow.nodes.map(node => ({
      nodeId: node.id,
      nodeName: node.name,
      state: 'pending' as WorkflowNodeState,
      enteredAt: now,
      previousState: null,
      role: node.role,
    }))
  }

  /**
   * 将指定节点迁移到新状态
   * 迁移前校验合法性
   */
  transitionNode(
    nodeStates: NodeStateRecord[],
    nodeId: string,
    toState: WorkflowNodeState,
    force: boolean = false,
  ): Result<NodeStateRecord[]> {
    const nodeIndex = nodeStates.findIndex(n => n.nodeId === nodeId)
    if (nodeIndex === -1) {
      return err(createError('TASK_NOT_FOUND', 'workflow-runner',
        `Node "${nodeId}" not found in current workflow`, {
          recoverable: true,
          suggestedAction: 'Check if the node ID exists in the workflow definition.',
        }))
    }

    const current = nodeStates[nodeIndex]

    // force 模式跳过迁移校验（用于回流场景中重置已完成节点）
    if (!force) {
      const validation = validateWorkflowNodeTransition(current.state, toState, nodeId)
      if (!validation.ok) {
        return err(createError('TASK_TRANSITION_INVALID', 'workflow-runner',
          `Cannot transition node "${nodeId}" from "${current.state}" to "${toState}"`, {
            detail: validation.issues,
          }))
      }
    }

    const updated = [...nodeStates]
    updated[nodeIndex] = {
      ...current,
      state: toState,
      enteredAt: new Date().toISOString(),
      previousState: current.state,
    }

    return ok(updated)
  }

  /**
   * 获取指定节点当前状态
   */
  getNodeState(nodeStates: NodeStateRecord[], nodeId: string): Result<NodeStateRecord> {
    const node = nodeStates.find(n => n.nodeId === nodeId)
    if (!node) {
      return err(createError('TASK_NOT_FOUND', 'workflow-runner',
        `Node "${nodeId}" not found`))
    }
    return ok(node)
  }

  /**
   * 获取当前正在运行的节点（应该只有一个）
   */
  getRunningNode(nodeStates: NodeStateRecord[]): NodeStateRecord | undefined {
    return nodeStates.find(n => n.state === 'running')
  }

  /**
   * 获取下一个应该推进的节点（第一个 pending 节点，按顺序）
   */
  getNextPendingNode(nodeStates: NodeStateRecord[]): NodeStateRecord | undefined {
    return nodeStates.find(n => n.state === 'pending')
  }

  /**
   * 判断 workflow 是否全部完成
   */
  isWorkflowCompleted(nodeStates: NodeStateRecord[]): boolean {
    return nodeStates.every(
      n => n.state === 'completed' || n.state === 'skipped',
    )
  }

  /**
   * 判断 workflow 是否有失败节点
   */
  hasFailedNode(nodeStates: NodeStateRecord[]): boolean {
    return nodeStates.some(n => n.state === 'failed')
  }

  /**
   * 获取指定节点在 workflow 定义中的索引
   */
  getNodeIndex(workflow: DomainWorkflowDefinition, nodeId: string): number {
    return workflow.nodes.findIndex(n => n.id === nodeId)
  }

  /**
   * 获取指定节点之后的下一个节点 ID（按顺序）
   */
  getNextNodeId(workflow: DomainWorkflowDefinition, currentNodeId: string): string | null {
    const index = this.getNodeIndex(workflow, currentNodeId)
    if (index === -1 || index >= workflow.nodes.length - 1) return null
    return workflow.nodes[index + 1].id
  }

  /**
   * 获取指定节点之前的节点 ID（用于回流）
   */
  getPreviousNodeId(workflow: DomainWorkflowDefinition, currentNodeId: string): string | null {
    const index = this.getNodeIndex(workflow, currentNodeId)
    if (index <= 0) return null
    return workflow.nodes[index - 1].id
  }
}
