// src-main/validation/state-transition.ts
// 状态迁移校验
// 来源：12-实现落地/系统级校验层约束 - StateValidation

import type {
  WorkspaceStatus,
  ConversationStatus,
  TaskStatus,
  NodeStatus,
  ArtifactStatus,
} from '../contracts/types'
import {
  WORKSPACE_TRANSITIONS,
  CONVERSATION_TRANSITIONS,
  TASK_TRANSITIONS,
  NODE_TRANSITIONS,
  ARTIFACT_TRANSITIONS,
} from '../contracts/status'
import type { ValidationIssue } from './types'
import { makeValidationResult, makeIssue } from './types'
import type { ValidationResult } from './types'

function stateIssue(objectType: string, from: string, to: string, relatedObjectId?: string): ValidationIssue {
  return makeIssue(
    'state',
    'invalid_state_transition',
    'status',
    `Invalid state transition on ${objectType}: "${from}" → "${to}"`,
    'error',
    relatedObjectId,
  )
}

export function validateWorkspaceTransition(from: WorkspaceStatus, to: WorkspaceStatus, workspaceId?: string): ValidationResult {
  const allowed = WORKSPACE_TRANSITIONS[from]
  if (!allowed?.includes(to)) {
    return makeValidationResult([stateIssue('Workspace', from, to, workspaceId)])
  }
  return makeValidationResult([])
}

export function validateConversationTransition(from: ConversationStatus, to: ConversationStatus, conversationId?: string): ValidationResult {
  const allowed = CONVERSATION_TRANSITIONS[from]
  if (!allowed?.includes(to)) {
    return makeValidationResult([stateIssue('Conversation', from, to, conversationId)])
  }
  return makeValidationResult([])
}

export function validateTaskTransition(from: TaskStatus, to: TaskStatus, taskId?: string): ValidationResult {
  const allowed = TASK_TRANSITIONS[from]
  if (!allowed?.includes(to)) {
    return makeValidationResult([stateIssue('Task', from, to, taskId)])
  }
  return makeValidationResult([])
}

export function validateNodeTransition(from: NodeStatus, to: NodeStatus, taskId?: string): ValidationResult {
  const allowed = NODE_TRANSITIONS[from]
  if (!allowed?.includes(to)) {
    return makeValidationResult([stateIssue('Node', from, to, taskId)])
  }
  return makeValidationResult([])
}

export function validateArtifactTransition(from: ArtifactStatus, to: ArtifactStatus, artifactId?: string): ValidationResult {
  const allowed = ARTIFACT_TRANSITIONS[from]
  if (!allowed?.includes(to)) {
    return makeValidationResult([stateIssue('Artifact', from, to, artifactId)])
  }
  return makeValidationResult([])
}

/**
 * 校验 TaskRuntime 与 WorkflowNodeState 的一致性
 * 来源：统一状态机 - 跨对象同步规则
 */
export function validateTaskNodeStateConsistency(
  taskStatus: TaskStatus,
  currentNodeStatus: NodeStatus | undefined,
  taskId?: string,
): ValidationResult {
  const issues: ValidationIssue[] = []

  if (taskStatus === 'running') {
    if (!currentNodeStatus || currentNodeStatus !== 'running') {
      issues.push(makeIssue('state', 'runtime_node_state_mismatch', 'currentNode',
        'TaskRuntime.status=running but currentNode is not running', 'error', taskId))
    }
  }

  if (taskStatus === 'blocked') {
    if (currentNodeStatus && currentNodeStatus !== 'blocked' && currentNodeStatus !== 'queued') {
      issues.push(makeIssue('state', 'runtime_node_state_mismatch', 'currentNode',
        'TaskRuntime.status=blocked but currentNode is not blocked/queued', 'warning', taskId))
    }
  }

  return makeValidationResult(issues)
}
