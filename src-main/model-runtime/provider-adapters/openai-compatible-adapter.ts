// src-main/model-runtime/provider-adapters/openai-compatible-adapter.ts
// OpenAI 兼容协议适配器
// 支持所有 openai-compatible 协议的 provider（OpenAI、DeepSeek、MiMo 等）

import type {
  ModelInvokeInput,
  ModelInvokeOutput,
  ModelStreamEvent,
  StreamEventCallback,
  ChatMessage,
  ToolCall,
  ProviderAdapter,
} from '../contracts'
import type { ResolvedModelProfile } from '../../model-config/contracts'

/** 生成唯一请求 ID */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * OpenAI 兼容协议适配器
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly name = 'openai-compatible'
  readonly protocol = 'openai-compatible'

  /**
   * 阻塞模式：POST {baseUrl}/chat/completions
   */
  async invoke(input: ModelInvokeInput): Promise<ModelInvokeOutput> {
    const requestId = generateRequestId()
    const profile = input.resolvedProfile!
    const apiKey = input.apiKey!

    const chatCompletionsPath = (profile as unknown as { chatCompletionsPath?: string }).chatCompletionsPath ?? '/chat/completions'
    const baseUrl = profile.apiBaseUrl.replace(/\/+$/, '')
    const url = `${baseUrl}${chatCompletionsPath}`

    const startTime = Date.now()

    const body = {
      model: profile.modelName,
      messages: input.messages.map(m => formatChatMessage(m)),
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 4096,
      tools: input.tools?.length ? input.tools.map(t => ({
        type: t.type,
        function: t.function,
      })) : undefined,
      stream: false,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error ${response.status}: ${errorText}`)
    }

    const data = await response.json() as {
      id: string
      choices: Array<{
        message: {
          role: string
          content: string | null
          tool_calls?: Array<{
            id: string
            type: 'function'
            function: { name: string; arguments: string }
          }>
        }
        finish_reason: string
      }>
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    const choice = data.choices[0]
    const latencyMs = Date.now() - startTime

    return {
      requestId,
      modelId: profile.modelId,
      content: choice.message.content ?? '',
      toolCalls: choice.message.tool_calls?.map(tc => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
      finishReason: choice.finish_reason,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
      latencyMs,
    }
  }

  /**
   * 流式模式：POST {baseUrl}/chat/completions with stream: true
   * 将 SSE（Server-Sent Events）解析为标准 ModelStreamEvent
   */
  async invokeStream(input: ModelInvokeInput, onEvent: StreamEventCallback): Promise<void> {
    const requestId = generateRequestId()
    const profile = input.resolvedProfile!
    const apiKey = input.apiKey!

    onEvent({ type: 'start', requestId, modelId: profile.modelId })

    const chatCompletionsPath = (profile as unknown as { chatCompletionsPath?: string }).chatCompletionsPath ?? '/chat/completions'
    const baseUrl = profile.apiBaseUrl.replace(/\/+$/, '')
    const url = `${baseUrl}${chatCompletionsPath}`

    const body = {
      model: profile.modelName,
      messages: input.messages.map(m => formatChatMessage(m)),
      temperature: input.temperature ?? 0.7,
      max_tokens: input.maxTokens ?? 4096,
      tools: input.tools?.length ? input.tools.map(t => ({
        type: t.type,
        function: t.function,
      })) : undefined,
      stream: true,
      stream_options: { include_usage: true },
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      const errorText = await response.text()
      onEvent({ type: 'error', message: `HTTP ${response.status}: ${errorText}`, recoverable: false })
      return
    }

    // 解析 SSE 流
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const activeToolCalls: Map<number, { id: string; name?: string }> = new Map()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') continue

          try {
            const chunk = JSON.parse(dataStr) as {
              choices?: Array<{
                delta: {
                  role?: string
                  content?: string | null
                  reasoning_content?: string
                  tool_calls?: Array<{
                    index: number
                    id?: string
                    function?: { name?: string; arguments?: string }
                  }>
                }
                finish_reason?: string | null
              }>
              usage?: {
                prompt_tokens: number
                completion_tokens: number
                total_tokens: number
              }
            }

            const choice = chunk.choices?.[0]
            if (!choice) continue

            const delta = choice.delta

            // 处理普通文本 delta
            if (delta.content) {
              onEvent({ type: 'delta', text: delta.content })
            }

            // 处理推理 delta（DeepSeek 特有）
            if ((delta as { reasoning_content?: string }).reasoning_content) {
              onEvent({
                type: 'reasoning_delta',
                text: (delta as { reasoning_content?: string }).reasoning_content!,
              })
            }

            // 处理工具调用 delta
            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                // 新工具调用开始
                if (tc.id && !activeToolCalls.has(tc.index)) {
                  activeToolCalls.set(tc.index, { id: tc.id, name: tc.function?.name })
                  onEvent({
                    type: 'tool_call_delta',
                    toolCallId: tc.id,
                    name: tc.function?.name,
                  })
                  continue
                }

                // 工具调用参数 delta
                const activeTc = activeToolCalls.get(tc.index)
                if (tc.function?.arguments && activeTc) {
                  onEvent({
                    type: 'tool_call_delta',
                    toolCallId: activeTc.id,
                    argumentsDelta: tc.function.arguments,
                  })
                }
              }
            }

            // 完成
            if (choice.finish_reason) {
              onEvent({
                type: 'done',
                usage: chunk.usage,
                finishReason: choice.finish_reason,
              })
            }
          } catch {
            // 忽略无法解析的 chunk
          }
        }
      }
    } catch (e) {
      onEvent({
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
        recoverable: false,
      })
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════

/**
 * 将 ChatMessage 格式化为 OpenAI API 格式
 */
function formatChatMessage(message: ChatMessage): Record<string, unknown> {
  const formatted: Record<string, unknown> = {
    role: message.role,
    content: message.content,
  }

  if (message.name) {
    formatted.name = message.name
  }

  if (message.toolCallId) {
    formatted.tool_call_id = message.toolCallId
  }

  if (message.toolCalls?.length) {
    formatted.tool_calls = message.toolCalls.map(tc => ({
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    }))
  }

  return formatted
}
