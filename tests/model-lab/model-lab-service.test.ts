// tests/model-lab/model-lab-service.test.ts
// 模型输出实验服务测试

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { AppPathResolver } from '../../src-main/storage/app-path-resolver'
import { ModelLabService } from '../../src-main/model-lab/model-lab-service'
import type { ModelInvokeInput, ModelInvokeOutput, ModelStreamEvent, StreamEventCallback, ToolCall } from '../../src-main/model-runtime/contracts'

class StubInvokeService {
  content = '{"taskTitle":"Vue 预研","goal":"评估 Vue","steps":["调研"],"risks":["生态"],"artifacts":[{"type":"Research","title":"报告","summary":"摘要"}]}'
  toolCalls: ToolCall[] | undefined
  lastInput: ModelInvokeInput | null = null

  async invoke(input: ModelInvokeInput): Promise<{ ok: true; data: ModelInvokeOutput }> {
    this.lastInput = input
    return {
      ok: true,
      data: {
        requestId: 'req_test',
        modelId: input.modelId ?? 'model',
        content: this.content,
        parsedJson: input.responseFormat === 'json_object' ? JSON.parse(this.content) : undefined,
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
        latencyMs: 12,
        toolCalls: this.toolCalls,
      },
    }
  }

  async invokeStream(input: ModelInvokeInput, onEvent: StreamEventCallback): Promise<void> {
    this.lastInput = input
    onEvent({ type: 'start', requestId: 'req_stream', modelId: input.modelId ?? 'model' })
    for (const text of ['{"taskTitle":"Vue"', ',"goal":"评估"}']) {
      onEvent({ type: 'delta', text })
    }
    onEvent({ type: 'done', usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 }, finishReason: 'stop' } as ModelStreamEvent)
  }
}

describe('ModelLabService', () => {
  let tmpDir: string
  let service: ModelLabService
  let stub: StubInvokeService

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-model-lab-'))
    const resolver = new AppPathResolver({ baseDir: tmpDir })
    resolver.ensureConfigDir()
    stub = new StubInvokeService()
    service = new ModelLabService(resolver, stub as any)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('blocking 调用返回 raw、parsed、validation 和 metrics', async () => {
    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      systemPrompt: '只返回 JSON',
      userPrompt: '帮我预研下 Vue',
      outputContract: { taskTitle: 'string', goal: 'string', steps: ['string'] },
      persistRun: true,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.validation.schemaOk).toBe(true)
      expect(result.data.metrics.totalTokens).toBe(30)
      expect(result.data.parsedJson).toMatchObject({ taskTitle: 'Vue 预研' })
    }

    const runs = await service.listRuns()
    expect(runs.ok).toBe(true)
    if (runs.ok) expect(runs.data.length).toBe(1)
  })

  it('支持 schema-like JSON Schema 结构说明校验', async () => {
    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      systemPrompt: '只返回 JSON',
      userPrompt: '帮我预研下 Vue',
      outputContract: {
        type: 'object',
        description: '结构化预研输出',
        required: ['taskTitle', 'goal', 'steps'],
        properties: {
          taskTitle: { type: 'string', description: '任务标题' },
          goal: { type: 'string', description: '目标' },
          steps: {
            type: 'array',
            description: '步骤列表',
            items: { type: 'string', description: '单个步骤' },
          },
        },
      },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.validation.schemaOk).toBe(true)
      expect(result.data.validation.missingFields).toEqual([])
      expect(result.data.validation.typeMismatches).toEqual([])
    }
  })

  it('PromptBuilder 不自动注入隐藏提示词，User/System Prompt 保持原始输入', async () => {
    const contract = { taskTitle: 'string', goal: 'string' }
    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      systemPrompt: '系统提示',
      userPrompt: '帮我预研下 Vue',
      outputContract: contract,
    })

    expect(result.ok).toBe(true)
    const messages = stub.lastInput?.messages ?? []
    expect(messages).toHaveLength(2)
    expect(messages[0]).toEqual({ role: 'system', content: '系统提示' })
    expect(messages[1]).toEqual({ role: 'user', content: '帮我预研下 Vue' })
    expect(stub.lastInput?.outputContract).toBe(JSON.stringify(contract, null, 2))
    if (result.ok) {
      expect(result.data.requestPreview?.constraintSources).toContain('期望输出 JSON（仅本地校验/预览，不自动注入 prompt）')
      expect(result.data.requestPreview?.finalRequestJson.response_format).toEqual({ type: 'json_object' })
    }
  })

  it('stream 调用收集事件并在 done 后校验拼接 JSON', async () => {
    const result = await service.invoke({
      mode: 'stream',
      constraintMode: 'api_json',
      systemPrompt: '只返回 JSON',
      userPrompt: '帮我预研下 Vue',
      outputContract: { taskTitle: 'string', goal: 'string' },
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.streamEvents?.length).toBeGreaterThan(1)
      expect(result.data.validation.schemaOk).toBe(true)
      expect(result.data.metrics.totalTokens).toBe(12)
    }
  })

  it('参数扫描会按温度组合运行多次', async () => {
    const spy = vi.spyOn(stub, 'invoke')
    const result = await service.runParameterSweep({
      baseInput: {
        mode: 'blocking',
        constraintMode: 'api_json',
        systemPrompt: '',
        userPrompt: 'test',
        outputContract: { taskTitle: 'string' },
      },
      temperatures: [0, 0.5],
      topPs: [1],
      constraintModes: ['api_json'],
      streamModes: [false],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.results.length).toBe(2)
      expect(result.data.results[0].inputSnapshot?.params.temperature).toBe(0)
      expect(result.data.results[1].inputSnapshot?.params.temperature).toBe(0.5)
    }
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('一致性测试会汇总成功率和字段稳定性', async () => {
    const result = await service.runConsistencyTest({
      input: {
        mode: 'blocking',
        constraintMode: 'api_json',
        systemPrompt: '',
        userPrompt: 'test',
        outputContract: { taskTitle: 'string', goal: 'string' },
      },
      runCount: 3,
      fixedSeed: true,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.results.length).toBe(3)
      expect(result.data.results[0].inputSnapshot?.params.seed).toBe(1)
      expect(result.data.summary.jsonParseSuccessRate).toBe(1)
      expect(result.data.summary.fieldStabilityScore).toBe(1)
    }
  })

  it('提示词方案支持保存和删除', async () => {
    const saved = await service.savePromptTemplate({
      name: 'Vue 预研',
      scenario: 'research',
      systemPrompt: 'system',
      userPromptTemplate: 'user',
      outputContract: { taskTitle: 'string' },
      responseFormat: 'json_object',
      defaultParams: {},
      status: 'draft',
    })

    expect(saved.ok).toBe(true)
    if (!saved.ok) return

    const deleted = await service.deletePromptTemplate({ id: saved.data.id })
    expect(deleted.ok).toBe(true)

    const list = await service.listPromptTemplates()
    expect(list.ok).toBe(true)
    if (list.ok) expect(list.data).toHaveLength(0)
  })

  it('CLI mock 工具会注入 tools 并附加 mock result', async () => {
    stub.toolCalls = [
      {
        id: 'call_cli_run',
        type: 'function',
        function: {
          name: 'cli_run',
          arguments: '{"command":"pnpm test"}',
        },
      },
    ]

    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      systemPrompt: '只返回 JSON',
      userPrompt: '运行测试',
      outputContract: { taskTitle: 'string' },
      params: {
        enabled_tools: ['cli_run'],
        tool_choice: 'auto',
      },
    })

    expect(result.ok).toBe(true)
    expect(stub.lastInput?.tools?.[0]?.function.name).toBe('cli_run')
    expect(stub.lastInput?.tools?.[0]?.function.parameters).toMatchObject({
      required: ['command'],
    })
    if (result.ok) {
      expect(result.data.toolCalls?.[0]?.mockResult).toMatchObject({
        mode: 'mock',
        operation: 'cli_run',
        applied: false,
      })
    }
  })
})
