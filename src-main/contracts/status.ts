// src-main/contracts/status.ts
// 状态枚举与合法迁移约束

import type {
  WorkspaceStatus,
  ConversationStatus,
  TaskStatus,
  NodeStatus,
  ArtifactStatus,
  PluginEnablementStatus,
} from './types'

// ─── 状态枚举值（用于运行时校验） ───

export const WORKSPACE_STATUSES: readonly WorkspaceStatus[] = [
  'initializing', 'active', 'idle', 'error',
]

export const CONVERSATION_STATUSES: readonly ConversationStatus[] = [
  'active', 'paused', 'review', 'closed',
]

export const TASK_STATUSES: readonly TaskStatus[] = [
  'running', 'blocked', 'done', 'queued', 'cancelled',
]

export const NODE_STATUSES: readonly NodeStatus[] = [
  'done', 'running', 'blocked', 'queued',
]

export const ARTIFACT_STATUSES: readonly ArtifactStatus[] = [
  'draft', 'ready', 'updated', 'archived',
]

export const PLUGIN_ENABLEMENT_STATUSES: readonly PluginEnablementStatus[] = [
  'draft', 'validated', 'pending_confirmation', 'enabled', 'disabled', 'failed',
]

// ─── 合法状态迁移映射 ───

export const WORKSPACE_TRANSITIONS: Record<WorkspaceStatus, WorkspaceStatus[]> = {
  initializing: ['active', 'error'],
  active: ['idle', 'error'],
  idle: ['active', 'error'],
  error: ['initializing', 'active', 'idle'],
}

export const CONVERSATION_TRANSITIONS: Record<ConversationStatus, ConversationStatus[]> = {
  active: ['paused', 'review', 'closed'],
  paused: ['active', 'closed'],
  review: ['active', 'paused', 'closed'],
  closed: [],
}

export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  running: ['blocked', 'done', 'cancelled'],
  blocked: ['running', 'cancelled'],
  done: [],
  queued: ['running', 'blocked', 'cancelled'],
  cancelled: [],
}

export const NODE_TRANSITIONS: Record<NodeStatus, NodeStatus[]> = {
  done: [],
  running: ['done', 'blocked'],
  blocked: ['running'],
  queued: ['running', 'blocked'],
}

export const ARTIFACT_TRANSITIONS: Record<ArtifactStatus, ArtifactStatus[]> = {
  draft: ['ready', 'archived'],
  ready: ['updated', 'archived'],
  updated: ['ready', 'archived'],
  archived: [],
}

export const PLUGIN_ENABLEMENT_TRANSITIONS: Record<PluginEnablementStatus, PluginEnablementStatus[]> = {
  draft: ['validated', 'failed'],
  validated: ['pending_confirmation', 'enabled', 'failed'],
  pending_confirmation: ['enabled', 'disabled', 'failed'],
  enabled: ['disabled'],
  disabled: ['enabled', 'pending_confirmation'],
  failed: ['draft', 'validated'],
}

// ─── 校验辅助函数 ───

export function isValidTransition<T extends string>(
  transitions: Record<T, T[]>,
  from: T,
  to: T,
): boolean {
  return transitions[from]?.includes(to) ?? false
}
