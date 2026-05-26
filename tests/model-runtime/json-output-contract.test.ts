// tests/model-runtime/json-output-contract.test.ts
// 模型运行时 JSON-only 输出契约

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { AppPathResolver } from '../../src-main/storage/app-path-resolver'
import { ModelConfigManager } from '../../src-main/model-config/model-config-manager'
import { ModelProfileResolver } from '../../src-main/model-config/model-profile-resolver'
import { ModelInvokeService } from '../../src-main/model-runtime/model-invoke-service'
import type { ModelInvokeInput, ModelInvokeOutput, ProviderAdapter, StreamEventCallback } from '../../src-main/model-runtime/contracts'

class StubAdapter implements ProviderAdapter {
  readonly name = 'stub'
  readonly protocol = 'openai-compatible'

  constructor(private content: string) {}

  async invoke(input: ModelInvokeInput): Promise<ModelInvokeOutput> {
    return {
      requestId: 'req_test',
      modelId: input.resolvedProfile?.modelId ?? 'model_test',
      content: this.content,
      finishReason: 'stop',
      latencyMs: 1,
    }
  }

  async invokeStream(_input: ModelInvokeInput, onEvent: StreamEventCallback): Promise<void> {
    onEvent({ type: 'done', finishReason: 'stop' })
  }
}

describe('ModelInvokeService JSON-only output contract', () => {
  let tmpDir: string
  let manager: ModelConfigManager
  let service: ModelInvokeService

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-json-model-'))
    const resolver = new AppPathResolver({ baseDir: tmpDir })
    resolver.ensureConfigDir()
    manager = new ModelConfigManager(resolver)
    service = new ModelInvokeService(manager, new ModelProfileResolver())

    await manager.addAppProvider({
      id: 'stub-provider',
      name: 'Stub Provider',
      apiBaseUrl: 'https://example.test/v1',
      type: 'openai',
      providerProtocol: 'openai-compatible',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'provider-stub-provider-apiKey' },
      enabled: true,
    })
    await manager.addAppModel({
      id: 'stub-model',
      providerId: 'stub-provider',
      modelName: 'stub-json',
      displayName: 'Stub JSON',
      capabilities: ['chat', 'structured_output'],
      contextWindow: 8000,
      enabled: true,
    })
    await manager.setAppDefaultProvider('stub-provider')
    await manager.setAppDefaultModel('stub-model')
    await manager.setAppSecret('provider-stub-provider-apiKey', 'test-key')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('默认要求 JSON object 并返回 parsedJson', async () => {
    service.registerAdapter(new StubAdapter('{"status":"ok","items":[1]}'))

    const result = await service.invoke({
      mode: 'blocking',
      messages: [{ role: 'user', content: '生成结构化结果' }],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.parsedJson).toEqual({ status: 'ok', items: [1] })
    }
  })

  it('非 JSON 输出会失败，且错误可恢复', async () => {
    service.registerAdapter(new StubAdapter('这是普通文本'))

    const result = await service.invoke({
      mode: 'blocking',
      messages: [{ role: 'user', content: '生成结构化结果' }],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_OUTPUT_PARSE_FAILED')
      expect(result.error.recoverable).toBe(true)
    }
  })

  it('只有显式 legacy_text 才允许返回自由文本', async () => {
    service.registerAdapter(new StubAdapter('legacy text'))

    const result = await service.invoke({
      mode: 'blocking',
      responseFormat: 'legacy_text',
      messages: [{ role: 'user', content: '旧接口文本' }],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.content).toBe('legacy text')
      expect(result.data.parsedJson).toBeUndefined()
    }
  })
})
