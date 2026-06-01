// src-main/model-config/provider-presets.ts
// 内置 Provider Preset 定义
// 供模型配置向导使用，普通用户无需手写 provider 细节

/** Provider 认证模式 */
export type ProviderAuthMode = 'authorization-bearer' | 'api-key-header' | 'custom-header'

/** Provider 协议类型 */
export type ProviderProtocol = 'openai-compatible' | 'anthropic-compatible' | 'custom'

/** Provider 预设 */
export interface ProviderPreset {
  /** 预设唯一标识 */
  id: string
  /** 显示名称 */
  name: string
  /** 图标（emoji 或图标标识） */
  icon: string
  /** Provider 类型（openai / anthropic / custom） */
  providerType: 'openai' | 'anthropic' | 'custom'
  /** 协议类型 */
  providerProtocol: ProviderProtocol
  /** 默认 API 基础地址 */
  defaultBaseUrl: string
  /** Chat Completions 接口路径（如 /chat/completions） */
  chatCompletionsPath: string
  /** 模型列表接口路径（如 /models） */
  modelsPath: string
  /** 认证模式 */
  authMode: ProviderAuthMode
  /** 认证头名称 */
  authHeaderName: string
  /** 环境变量名称（用于密钥参考） */
  secretEnvName: string
  /** 是否支持流式输出 */
  supportsStreaming: boolean
  /** 推荐模型列表 */
  recommendedModels: ProviderPresetModel[]
}

/** 推荐模型 */
export interface ProviderPresetModel {
  /** 模型 ID */
  id: string
  /** 模型名称（API 实际名称） */
  modelName: string
  /** 显示名称 */
  displayName: string
  /** 能力标签 */
  capabilities: string[]
  /** 默认上下文窗口 */
  contextWindow: number | null
  /** 是否支持推理 */
  supportsReasoning?: boolean
  /** 是否支持工具调用 */
  supportsToolCall?: boolean
  /** 是否已废弃 */
  deprecated?: boolean
  /** 废弃说明 */
  deprecationNote?: string | null
}

// ═══════════════════════════════════════════════════════════════
// 内置 Provider Presets
// ═══════════════════════════════════════════════════════════════

const BUILTIN_PRESETS: ProviderPreset[] = [
  // ─── OpenAI ───
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '🤖',
    providerType: 'openai',
    providerProtocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.openai.com/v1',
    chatCompletionsPath: '/chat/completions',
    modelsPath: '/models',
    authMode: 'authorization-bearer',
    authHeaderName: 'Authorization',
    secretEnvName: 'OPENAI_API_KEY',
    supportsStreaming: true,
    recommendedModels: [
      {
        id: 'gpt-4o',
        modelName: 'gpt-4o',
        displayName: 'GPT-4o',
        capabilities: ['chat', 'completion', 'reasoning'],
        contextWindow: 128000,
        supportsReasoning: true,
        supportsToolCall: true,
      },
      {
        id: 'gpt-4o-mini',
        modelName: 'gpt-4o-mini',
        displayName: 'GPT-4o Mini',
        capabilities: ['chat', 'completion'],
        contextWindow: 128000,
        supportsToolCall: true,
      },
      {
        id: 'gpt-4-turbo',
        modelName: 'gpt-4-turbo',
        displayName: 'GPT-4 Turbo',
        capabilities: ['chat', 'completion'],
        contextWindow: 128000,
        supportsToolCall: true,
        deprecated: true,
        deprecationNote: '推荐使用 GPT-4o',
      },
      {
        id: 'o3-mini',
        modelName: 'o3-mini',
        displayName: 'o3-mini',
        capabilities: ['chat', 'reasoning'],
        contextWindow: 200000,
        supportsReasoning: true,
      },
    ],
  },

  // ─── Anthropic ───
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: '🧠',
    providerType: 'anthropic',
    providerProtocol: 'anthropic-compatible',
    defaultBaseUrl: 'https://api.anthropic.com',
    chatCompletionsPath: '/v1/messages',
    modelsPath: '/v1/models',
    authMode: 'api-key-header',
    authHeaderName: 'x-api-key',
    secretEnvName: 'ANTHROPIC_API_KEY',
    supportsStreaming: true,
    recommendedModels: [
      {
        id: 'claude-sonnet-4-20250514',
        modelName: 'claude-sonnet-4-20250514',
        displayName: 'Claude Sonnet 4',
        capabilities: ['chat', 'completion', 'reasoning'],
        contextWindow: 200000,
        supportsReasoning: true,
        supportsToolCall: true,
      },
      {
        id: 'claude-3-5-sonnet-20241022',
        modelName: 'claude-3-5-sonnet-20241022',
        displayName: 'Claude 3.5 Sonnet',
        capabilities: ['chat', 'completion'],
        contextWindow: 200000,
        supportsToolCall: true,
      },
      {
        id: 'claude-3-5-haiku-20241022',
        modelName: 'claude-3-5-haiku-20241022',
        displayName: 'Claude 3.5 Haiku',
        capabilities: ['chat', 'completion'],
        contextWindow: 200000,
        supportsToolCall: true,
      },
      {
        id: 'claude-3-opus-20240229',
        modelName: 'claude-3-opus-20240229',
        displayName: 'Claude 3 Opus',
        capabilities: ['chat', 'completion'],
        contextWindow: 200000,
        deprecated: true,
        deprecationNote: '推荐使用 Claude Sonnet 4',
      },
    ],
  },

  // ─── DeepSeek ───
  {
    id: 'deepseek',
    name: 'DeepSeek',
    icon: '🔍',
    providerType: 'openai',
    providerProtocol: 'openai-compatible',
    defaultBaseUrl: 'https://api.deepseek.com',
    chatCompletionsPath: '/chat/completions',
    modelsPath: '/models',
    authMode: 'authorization-bearer',
    authHeaderName: 'Authorization',
    secretEnvName: 'DEEPSEEK_API_KEY',
    supportsStreaming: true,
    recommendedModels: [
      {
        id: 'deepseek-v4-flash',
        modelName: 'deepseek-v4-flash',
        displayName: 'DeepSeek V4 Flash',
        capabilities: ['chat', 'completion', 'reasoning'],
        contextWindow: 128000,
        supportsReasoning: true,
        supportsToolCall: true,
      },
      {
        id: 'deepseek-v4-pro',
        modelName: 'deepseek-v4-pro',
        displayName: 'DeepSeek V4 Pro',
        capabilities: ['chat', 'completion', 'reasoning'],
        contextWindow: 128000,
        supportsReasoning: true,
        supportsToolCall: true,
      },
      {
        id: 'deepseek-chat',
        modelName: 'deepseek-chat',
        displayName: 'DeepSeek Chat (V3)',
        capabilities: ['chat', 'completion'],
        contextWindow: 64000,
        deprecated: true,
        deprecationNote: '推荐使用 DeepSeek V4 Flash',
      },
      {
        id: 'deepseek-reasoner',
        modelName: 'deepseek-reasoner',
        displayName: 'DeepSeek Reasoner (R1)',
        capabilities: ['chat', 'reasoning'],
        contextWindow: 64000,
        deprecated: true,
        deprecationNote: '推荐使用 DeepSeek V4 Pro（已内置推理能力）',
      },
    ],
  },

  // ─── MiMo ───
  {
    id: 'mimo',
    name: 'MiMo',
    icon: '🌐',
    providerType: 'openai',
    providerProtocol: 'openai-compatible',
    defaultBaseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
    chatCompletionsPath: '/chat/completions',
    modelsPath: '/models',
    authMode: 'authorization-bearer',
    authHeaderName: 'Authorization',
    secretEnvName: 'MIMO_API_KEY',
    supportsStreaming: true,
    recommendedModels: [
      {
        id: 'mimo-v2.5-pro',
        modelName: 'mimo-v2.5-pro',
        displayName: 'MiMo V2.5 Pro',
        capabilities: ['chat', 'completion', 'reasoning'],
        contextWindow: 1000000,
        supportsReasoning: true,
        supportsToolCall: true,
      },
      {
        id: 'mimo-v2.5',
        modelName: 'mimo-v2.5',
        displayName: 'MiMo V2.5',
        capabilities: ['chat', 'completion', 'reasoning'],
        contextWindow: 1000000,
        supportsReasoning: true,
        supportsToolCall: true,
      },
      {
        id: 'mimo-v2.5-flash',
        modelName: 'mimo-v2.5-flash',
        displayName: 'MiMo V2.5 Flash',
        capabilities: ['chat', 'completion'],
        contextWindow: 256000,
        supportsReasoning: false,
        supportsToolCall: true,
      },
    ],
  },
]

// ═══════════════════════════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════════════════════════

/**
 * 获取所有内置 Provider Preset
 */
export function getBuiltinProviderPresets(): ProviderPreset[] {
  return [...BUILTIN_PRESETS]
}

/**
 * 按 ID 获取指定 Provider Preset
 */
export function getPresetById(id: string): ProviderPreset | undefined {
  return BUILTIN_PRESETS.find(p => p.id === id)
}
