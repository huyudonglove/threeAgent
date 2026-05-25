// src-main/trace/display-trace-types.ts
// 展示镜像事件类型定义
// 来源：05-记忆系统/DisplayTraceEventTemplate、12-实现落地/GUIInformationArchitecture

/**
 * DisplayTrace 事件类型字典
 * 来源：系统级校验层约束 - GUI 与 Trace 使用方式
 */
export const DISPLAY_TRACE_EVENT_TYPES = [
  'task_created',
  'task_status_changed',
  'node_started',
  'node_completed',
  'node_blocked',
  'node_backflow',
  'artifact_created',
  'artifact_status_changed',
  'validation_failed',
  'validation_passed_with_notes',
  'recovery_validation_failed',
  'permission_validation_blocked',
  'backflow_created',
  'backflow_resolved',
  'change_request_created',
  'change_request_approved',
  'memory_source_submitted',
  'plugin_enabled',
  'plugin_disabled',
  'model_config_changed',
  'health_check_performed',
  'node_output',
] as const

export type DisplayTraceEventType = typeof DISPLAY_TRACE_EVENT_TYPES[number]

/**
 * 单条 DisplayTrace 事件
 * 这是展示镜像，不是运行态真源
 */
export interface DisplayTraceEvent {
  id: string
  workspaceId: string
  conversationId: string
  taskId?: string | null
  turnId?: string | null
  eventType: DisplayTraceEventType
  dataName: string
  dataId?: string | null
  actorRole?: string | null
  summary: string
  displayPayload?: Record<string, unknown>
  timestamp: string
}

/**
 * DisplayTrace 空间 manifest
 * 记录当前空间的 segment 信息
 */
export interface DisplayTraceManifest {
  workspaceId: string
  conversationId: string
  currentSegment: number
  totalEvents: number
  createdAt: string
  updatedAt: string
}

/**
 * 查询参数
 */
export interface TraceQueryOptions {
  workspaceId: string
  conversationId?: string
  taskId?: string
  limit?: number
  eventTypes?: DisplayTraceEventType[]
}
