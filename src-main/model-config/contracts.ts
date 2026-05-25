// src-main/model-config/contracts.ts
// 模型配置数据契约

// ─── Provider ───

export interface ModelProviderConfig {
  id: string
  name: string
  apiBaseUrl: string
  type: 'openai' | 'anthropic' | 'custom'
  /** 协议类型 */
  providerProtocol?: 'openai-compatible' | 'anthropic-compatible' | 'custom'
  /** 认证模式 */
  authMode?: 'authorization-bearer' | 'api-key-header' | 'custom-header'
  /** 认证头名称 */
  authHeaderName?: string
  /** Chat Completions 接口路径 */
  chatCompletionsPath?: string
  /** 模型列表接口路径 */
  modelsPath?: string
  /** 是否支持流式输出 */
  supportsStreaming?: boolean
  /** 预设来源 */
  presetSource?: 'openai' | 'anthropic' | 'deepseek' | 'mimo' | 'custom'
  apiKeyRef: SecretRef          // 密钥引用，不存明文
  enabled: boolean
  createdAt: string
  updatedAt: string
}

// ─── Model ───

export interface ModelProfileConfig {
  id: string
  providerId: string
  modelName: string
  displayName: string
  capabilities: string[]       // 如 ['chat', 'completion', 'embedding']
  contextWindow: number | null
  /** 是否支持推理 */
  supportsReasoning?: boolean
  /** 是否支持工具调用 */
  supportsToolCall?: boolean
  /** 是否支持流式输出 */
  supportsStreaming?: boolean
  /** 是否已废弃 */
  deprecated?: boolean
  /** 废弃说明 */
  deprecationNote?: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

// ─── Binding ───

export interface ModelBindingConfig {
  id: string
  role: string                 // 如 'orchestrator', 'product_manager', 'code'
  modelId: string
  providerId: string
  scope: 'global' | 'workspace' // 全局级 vs 工作区级
  priority: number             // 工作区级覆盖全局级时用
  enabled: boolean
  createdAt: string
  updatedAt: string
}

// ─── Health Check ───

export interface ModelHealthCheckRecord {
  id: string
  providerId: string
  status: 'healthy' | 'degraded' | 'failed'
  latencyMs: number | null
  error: string | null
  checkedAt: string
}

// ─── Resolved Profile ───

export interface ResolvedModelProfile {
  providerId: string
  providerName: string
  providerType: string
  apiBaseUrl: string
  modelId: string
  modelName: string
  capabilities: string[]
  bindingRole: string
  bindingScope: 'global' | 'workspace'
  hasApiKey: boolean
  state: ModelConfigState
}

// ─── Config State ───

/** 模型配置状态（§15.1 规格） */
export type ModelConfigState =
  | 'no_provider'
  | 'provider_missing_key'
  | 'no_model'
  | 'no_default_model'
  | 'not_tested'
  | 'test_failed'
  | 'ready'

// ─── Secret Reference ───

export interface SecretRef {
  type: 'secretRef'
  store: 'secrets'
  key: string                  // 如 'provider-{id}-apiKey'
}

// ─── Runtime State ───

export interface ModelConfigRuntimeState {
  lastHealthCheck: Record<string, ModelHealthCheckRecord>  // providerId -> record
  configState: ModelConfigState
  blockedReason: string | null
  updatedAt: string
}

// ─── 全局配置 vs 工作区配置 ───

export interface GlobalModelConfig {
  providers: ModelProviderConfig[]
  models: ModelProfileConfig[]
  bindings: ModelBindingConfig[]
}

// ─── 应用级模型配置（独立于工作区） ───

export interface AppModelConfig {
  providers: ModelProviderConfig[]
  models: ModelProfileConfig[]
  bindings: ModelBindingConfig[]
  defaultProviderId?: string
  defaultModelId?: string
}

export interface WorkspaceModelConfig {
  providers: ModelProviderConfig[]   // 工作区级覆盖
  models: ModelProfileConfig[]
  bindings: ModelBindingConfig[]
}

// ─── 模型候选 ───

export interface ModelCandidate {
  id: string
  modelName: string
  displayName: string
  providerId: string
  providerName: string
  providerIcon?: string
  capabilities: string[]
  contextWindow: number | null
  supportsReasoning: boolean
  supportsToolCall: boolean
  supportsStreaming: boolean
  deprecated: boolean
  deprecationNote: string | null
  /** 来源：preset（内置预设） | user（用户已配置） */
  source: 'preset' | 'user'
}

// ─── 配置状态摘要 ───

export interface ModelConfigStatus {
  hasProvider: boolean
  hasModel: boolean
  hasBinding: boolean
  defaultProvider: string | null
  defaultModel: string | null
  defaultProviderName: string | null
  defaultModelName: string | null
}
