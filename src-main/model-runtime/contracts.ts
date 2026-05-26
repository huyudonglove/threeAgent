// src-main/model-runtime/contracts.ts
// 模型调用层统一类型定义

import type { ResolvedModelProfile } from '../model-config/contracts'

// ═══════════════════════════════════════════════════════════════
// 调用模式
// ═══════════════════════════════════════════════════════════════

/** 模型调用模式 */
export type ModelInvokeMode = 'stream' | 'blocking'

// ═══════════════════════════════════════════════════════════════
// 消息结构
// ═══════════════════════════════════════════════════════════════

/** 对话消息 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  toolCallId?: string
  toolCalls?: ToolCall[]
}

/** 工具调用 */
export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

/** 工具定义 */
export interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } }

// ═══════════════════════════════════════════════════════════════
// 调用输入
// ═══════════════════════════════════════════════════════════════

export interface ModelInvokeInput {
  /** 工作区根路径（可选） */
  workspaceRootPath?: string
  /** 角色绑定 */
  role?: string
  /** Provider ID */
  providerId?: string
  /** Model ID */
  modelId?: string
  /** 调用模式 */
  mode: ModelInvokeMode
  /** 对话消息 */
  messages: ChatMessage[]
  /** 是否使用流式（stream 模式下强制为 true） */
  stream?: boolean
  /** 工具定义 */
  tools?: ToolDefinition[]
  /** 工具选择策略 */
  toolChoice?: ToolChoice
  /** 输出格式。Agent 默认要求 JSON，只有显式 legacy-text 才允许自由文本。 */
  responseFormat?: 'json_object' | 'legacy_text'
  /** JSON 输出的意图说明，用于提示模型保持稳定结构。 */
  outputContract?: string
  /** 扩展元数据 */
  metadata?: Record<string, unknown>
  /** 温度 */
  temperature?: number
  /** nucleus sampling */
  topP?: number
  /** 最大 token 数 */
  maxTokens?: number
  /** 调用超时毫秒 */
  timeoutMs?: number
  /** 可复现实验 seed，仅部分 provider 支持 */
  seed?: number | null
  /** presence penalty */
  presencePenalty?: number
  /** frequency penalty */
  frequencyPenalty?: number
  /** stop sequences */
  stop?: string[]
  /** reasoning effort，仅部分模型支持 */
  reasoningEffort?: string
  /** 服务商专属扩展 body，仅由明确支持的 provider/model 使用 */
  providerSpecific?: Record<string, unknown>
  /** 解析后的模型配置（若不传则内部解析） */
  resolvedProfile?: ResolvedModelProfile
  /** API Key（若不传则从 SecretStore 获取） */
  apiKey?: string
}

// ═══════════════════════════════════════════════════════════════
// 调用输出
// ═══════════════════════════════════════════════════════════════

/** 阻塞模式输出 */
export interface ModelInvokeOutput {
  /** 请求 ID */
  requestId: string
  /** 模型 ID */
  modelId: string
  /** 生成文本 */
  content: string
  /** JSON-only 模式下解析后的结构化对象 */
  parsedJson?: unknown
  /** 推理过程文本（若模型支持） */
  reasoningContent?: string
  /** 工具调用（若模型返回） */
  toolCalls?: ToolCall[]
  /** 完成原因 */
  finishReason: string
  /** Token 用量 */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  /** 延迟（毫秒） */
  latencyMs: number
}

// ═══════════════════════════════════════════════════════════════
// 流式事件
// ═══════════════════════════════════════════════════════════════

/** 流式输出事件 */
export type ModelStreamEvent =
  | { type: 'start'; requestId: string; modelId: string }
  | { type: 'delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call_delta'; toolCallId: string; name?: string; argumentsDelta?: string }
  | { type: 'done'; usage?: unknown; finishReason?: string }
  | { type: 'error'; message: string; recoverable: boolean }

/** 流式事件回调 */
export type StreamEventCallback = (event: ModelStreamEvent) => void

// ═══════════════════════════════════════════════════════════════
// Provider 适配器接口
// ═══════════════════════════════════════════════════════════════

export interface ProviderAdapter {
  /** 适配器名称 */
  readonly name: string
  /** 支持的协议 */
  readonly protocol: string

  /** 阻塞模式调用 */
  invoke(input: ModelInvokeInput): Promise<ModelInvokeOutput>

  /** 流式模式调用 */
  invokeStream(input: ModelInvokeInput, onEvent: StreamEventCallback): Promise<void>
}
