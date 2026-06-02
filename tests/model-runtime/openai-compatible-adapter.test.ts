import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { OpenAICompatibleAdapter } from '../../src-main/model-runtime/provider-adapters/openai-compatible-adapter'
import type { ModelInvokeInput } from '../../src-main/model-runtime/contracts'

describe('OpenAICompatibleAdapter tools', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      return {
        ok: true,
        json: async () => ({
          id: 'chatcmpl_test',
          choices: [{ message: { role: 'assistant', content: JSON.stringify({ tools: body.tools }) }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      } as Response
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('preserves native web_search tool shape', async () => {
    const adapter = new OpenAICompatibleAdapter()
    await adapter.invoke(baseInput({
      tools: [
        {
          type: 'web_search',
          max_keyword: 3,
          force_search: true,
          limit: 1,
          user_location: { type: 'approximate', country: 'China', region: 'Hubei', city: 'Wuhan' },
        },
      ],
    }))

    const body = JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body))
    expect(body.tools).toEqual([
      {
        type: 'web_search',
        max_keyword: 3,
        force_search: true,
        limit: 1,
        user_location: { type: 'approximate', country: 'China', region: 'Hubei', city: 'Wuhan' },
      },
    ])
  })

  it('keeps function tools in function shape', async () => {
    const adapter = new OpenAICompatibleAdapter()
    await adapter.invoke(baseInput({
      tools: [
        {
          type: 'function',
          function: {
            name: 'echo_tool',
            description: 'Echo input',
            parameters: { type: 'object' },
          },
        },
      ],
    }))

    const body = JSON.parse(String((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body))
    expect(body.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'echo_tool',
          description: 'Echo input',
          parameters: { type: 'object' },
        },
      },
    ])
  })
})

function baseInput(overrides: Partial<ModelInvokeInput> = {}): ModelInvokeInput {
  return {
    mode: 'blocking',
    messages: [{ role: 'user', content: 'test' }],
    resolvedProfile: {
      providerId: 'provider_mimo',
      providerName: 'MiMo',
      providerType: 'openai',
      apiBaseUrl: 'https://example.test/v1',
      modelId: 'model_mimo',
      modelName: 'mimo-v2.5',
      capabilities: ['chat', 'tool_call'],
      bindingRole: 'default',
      bindingScope: 'global',
      hasApiKey: true,
      state: 'ready',
    },
    apiKey: 'test-key',
    ...overrides,
  }
}
