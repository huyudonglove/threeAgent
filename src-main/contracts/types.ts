// src-main/contracts/types.ts
// 核心对象 TypeScript 类型定义
// 来源：02-工作区与工程入口、05-记忆系统、07-开发执行闭环、10-领域工作流、12-实现落地

// ─── 通用 ───

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

// ─── 工作区 ───

export interface WorkspaceManifest {
  id: string
  name: string
  description: string
  rootPath: string
  status: WorkspaceStatus
  createdAt: string
  updatedAt: string
  lastActiveAt: string
  activeRunId: string | null
  components: WorkspaceComponents
}

export type WorkspaceStatus = 'initializing' | 'active' | 'idle' | 'error'

export interface WorkspaceComponents {
  conversations: string   // 相对路径
  artifacts: string
  displayTrace: string
  agentMemory: string
  domains: string
  roles: string
  skills: string
  logs: string
  modelConfig: string
}

// ─── 全局入口 ───

export interface WorkspaceIndex {
  workspaces: WorkspaceIndexEntry[]
  lastActiveWorkspaceId: string | null
  lastWindowBounds: { x: number; y: number; width: number; height: number } | null
}

export interface WorkspaceIndexEntry {
  id: string
  name: string
  rootPath: string
  lastActiveAt: string
}

export interface EnvironmentFingerprint {
  os: string
  shell: string
  nodeVersion: string
  globalTools: Record<string, boolean>
  agentVersion: string
  generatedAt: string
}

// ─── 会话 ───

export interface ConversationRuntime {
  id: string
  workspaceId: string
  title: string
  taskType: string
  status: ConversationStatus
  currentTaskId: string | null
  currentWorkflowId: string | null
  currentNodeId?: string | null
  currentNodeName: string | null
  taskDomain: string | null
  closedAt?: string | null
  createdAt: string
  updatedAt: string
}

export type ConversationStatus = 'active' | 'paused' | 'review' | 'closed'

// ─── 任务运行态 ───

export interface TaskRuntime {
  id: string
  workspaceId: string
  conversationId: string
  title: string
  rawInput?: string
  userGoal?: string
  owner: string
  status: TaskStatus
  currentNodeId?: string | null
  currentNodeName: string
  workflowId: string | null
  domainName: string | null
  blockedReason: string | null
  waitingFor: string | null
  lastError?: RuntimeErrorSnapshot | null
  backflowCount: number
  confirmationCount: number
  artifactIds: string[]
  startedAt?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
  createdAt: string
  updatedAt: string
}

export type TaskStatus = 'running' | 'blocked' | 'done' | 'queued' | 'cancelled'

export interface RuntimeErrorSnapshot {
  code: string
  message: string
  occurredAt: string
  recoverable: boolean
}

// ─── 工作流节点 ───

export interface WorkflowNodeDefinition {
  id: string
  name: string
  role: string
  status: NodeStatus
  summary: string
  reason: string
  outputs: string[]
  confirmations: string[]
  tools: string[]
  expectedOutputs?: Array<{
    artifactType: string
    title: string
  }>
}

export type NodeStatus = 'done' | 'running' | 'blocked' | 'queued'

// ─── 产物索引 ───

export interface ArtifactIndexEntry {
  id: string
  title: string
  type: string
  node: string
  producedByNodeId?: string | null
  taskId: string
  status: ArtifactStatus
  path: string
  summary?: string
  previewText?: string
  relatedArtifactIds: string[]
  createdAt: string
  updatedAt: string
}

export type ArtifactStatus = 'draft' | 'ready' | 'updated' | 'archived'

// ─── 回流 ───

export interface BackflowRecord {
  id: string
  taskId: string
  fromNode: string
  toNode: string
  reason: string
  targetType: 'product_manager' | 'tech_lead' | 'project_manager' | 'code'
  createdAt: string
}

// ─── 变更请求 ───

export interface ChangeRequest {
  id: string
  taskId: string
  requestedBy: string
  field: string
  oldValue: string
  newValue: string
  reason: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  resolvedAt: string | null
}

// ─── 领域工作流 ───

export interface DomainWorkflowDefinition {
  id: string
  name: string
  taskDomain: string
  version: string
  status: 'builtin' | 'custom' | 'candidate'
  nodes: WorkflowNodeDefinition[]
  roleBindings: DomainRoleBinding[]
  skillBindings: DomainSkillBinding[]
}

export interface DomainRoleBinding {
  nodeName: string
  role: string
  description: string
}

export interface DomainSkillBinding {
  nodeName: string
  skill: string
  description: string
}

// ─── 时间线事件 ───

export interface TimelineEvent {
  id: string
  time: string
  title: string
  detail: string
  tone: StatusTone
}

// ─── 记忆 ───

export interface MemorySummary {
  id: string
  title: string
  detail: string
  source: string
}

// ─── 风险 ───

export interface RiskSummary {
  id: string
  title: string
  detail: string
  level: 'low' | 'medium' | 'high'
}

// ─── 指标 ───

export interface MetricCard {
  label: string
  value: string
  tone: StatusTone
  helper: string
}

// ─── 阶段 ───

export interface StageSummary {
  id: string
  name: string
  state: 'done' | 'current' | 'upcoming'
}

// ─── 插件启用记录 ───

export interface PluginEnablementRecord {
  id: string
  pluginId: string
  pluginType: 'workflow' | 'role' | 'skill'
  pluginName: string
  status: PluginEnablementStatus
  domain?: string
  version?: string
  enabledAt: string | null
  disabledAt: string | null
  enabledBy: string
  reason: string
  affectedObjectIds: string[]
  createdAt: string
  updatedAt: string
}

export type PluginEnablementStatus = 'draft' | 'validated' | 'pending_confirmation' | 'enabled' | 'disabled' | 'failed'
