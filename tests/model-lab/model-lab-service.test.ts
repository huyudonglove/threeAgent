// tests/model-lab/model-lab-service.test.ts
// 模型输出实验服务测试

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { AppPathResolver } from '../../src-main/storage/app-path-resolver'
import { ModelLabService } from '../../src-main/model-lab/model-lab-service'
import type { ModelInvokeInput, ModelInvokeOutput, ModelStreamEvent, StreamEventCallback, ToolCall } from '../../src-main/model-runtime/contracts'
import type { PromptSlot } from '../../src-main/model-lab/model-lab-contracts'

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

function promptSlots(task: string, outputSchema: unknown, agent = '只返回 JSON'): PromptSlot[] {
  return [
    {
      id: 'slot-agent',
      type: 'agent',
      title: 'Agent Role',
      enabled: true,
      order: 10,
      content: agent,
      source: 'manual',
      channel: 'system',
    },
    {
      id: 'slot-task',
      type: 'task',
      title: 'Task / Instruction',
      enabled: true,
      order: 20,
      content: task,
      source: 'manual',
      channel: 'user',
    },
    {
      id: 'slot-output-schema',
      type: 'output_schema',
      title: 'Expected Output JSON',
      enabled: true,
      order: 30,
      content: JSON.stringify(outputSchema, null, 2),
      source: 'manual',
      channel: 'system',
    },
  ]
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
    const outputContract = { taskTitle: 'string', goal: 'string', steps: ['string'] }
    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      promptSlots: promptSlots('帮我预研下 Vue', outputContract),
      outputContract,
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
    const outputContract = {
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
    }
    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      promptSlots: promptSlots('帮我预研下 Vue', outputContract),
      outputContract,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.validation.schemaOk).toBe(true)
      expect(result.data.validation.missingFields).toEqual([])
      expect(result.data.validation.typeMismatches).toEqual([])
    }
  })

  it('PromptBuilder 使用显式 prompt slots 组装最终请求', async () => {
    const contract = { taskTitle: 'string', goal: 'string' }
    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      promptSlots: promptSlots('帮我预研下 Vue', contract, '系统提示'),
      outputContract: contract,
    })

    expect(result.ok).toBe(true)
    const messages = stub.lastInput?.messages ?? []
    expect(messages).toHaveLength(2)
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('## Agent Role')
    expect(messages[0].content).toContain('系统提示')
    expect(messages[0].content).toContain('## Expected Output JSON')
    expect(messages[0].content).toContain('"taskTitle": "string"')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content).toContain('## Task / Instruction')
    expect(messages[1].content).toContain('帮我预研下 Vue')
    expect(messages[1].content).not.toContain('Expected Output JSON')
    expect(stub.lastInput?.outputContract).toBe(JSON.stringify(contract, null, 2))
    if (result.ok) {
      expect(result.data.requestPreview?.promptSlots.map(slot => slot.type)).toEqual(['agent', 'task', 'output_schema'])
      expect(result.data.requestPreview?.promptSlots.map(slot => slot.channel)).toEqual(['system', 'user', 'system'])
      expect(result.data.requestPreview?.assembledPrompt).toContain('Expected Output JSON')
      expect(result.data.requestPreview?.finalRequestJson.response_format).toEqual({ type: 'json_object' })
    }
  })

  it('disabled prompt slot 不进入最终 messages', async () => {
    const contract = { taskTitle: 'string' }
    const slots = promptSlots('test', contract)
    slots[2].enabled = false

    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      promptSlots: slots,
      outputContract: contract,
    })

    expect(result.ok).toBe(true)
    expect(stub.lastInput?.messages[0].content).not.toContain('Expected Output JSON')
    expect(stub.lastInput?.messages[1].content).toContain('## Task / Instruction')
    if (result.ok) {
      expect(result.data.requestPreview?.promptSlots.map(slot => slot.type)).toEqual(['agent', 'task'])
    }
  })

  it('output schema slot can be prompt-only text without JSON validation contract', async () => {
    const slots = promptSlots('test', 'Return JSON with a short explanation first.')
    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      promptSlots: slots,
      outputContract: 'Return JSON with a short explanation first.',
    })

    expect(result.ok).toBe(true)
    expect(stub.lastInput?.messages[0].content).toContain('Return JSON with a short explanation first.')
    expect(stub.lastInput?.outputContract).toBe('Return JSON with a short explanation first.')
    if (result.ok) {
      expect(result.data.validation.schemaOk).toBe(true)
      expect(result.data.validation.missingFields).toEqual([])
    }
  })

  it('stream 调用收集事件并在 done 后校验拼接 JSON', async () => {
    const outputContract = { taskTitle: 'string', goal: 'string' }
    const result = await service.invoke({
      mode: 'stream',
      constraintMode: 'api_json',
      promptSlots: promptSlots('帮我预研下 Vue', outputContract),
      outputContract,
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
        promptSlots: promptSlots('test', { taskTitle: 'string' }),
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
        promptSlots: promptSlots('test', { taskTitle: 'string', goal: 'string' }),
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
      promptSlots: promptSlots('user', { taskTitle: 'string' }, 'system'),
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
      promptSlots: promptSlots('运行测试', { taskTitle: 'string' }),
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

  it('web_search mock tool uses configured search schema and mock result', async () => {
    stub.toolCalls = [
      {
        id: 'call_web_search',
        type: 'function',
        function: {
          name: 'web_search',
          arguments: '{"query":"Wuhan AI news","type":"web_search","max_keyword":3,"force_search":true,"limit":1,"user_location":{"type":"approximate","country":"China","region":"Hubei","city":"Wuhan"}}',
        },
      },
    ]

    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      promptSlots: promptSlots('search current context', { taskTitle: 'string' }),
      outputContract: { taskTitle: 'string' },
      params: {
        enabled_tools: ['web_search'],
        tool_choice: 'auto',
      },
    })

    expect(result.ok).toBe(true)
    expect(stub.lastInput?.tools?.[0]?.function.name).toBe('web_search')
    expect(stub.lastInput?.tools?.[0]?.function.parameters).toMatchObject({
      required: ['query'],
      properties: {
        max_keyword: { default: 3 },
        force_search: { default: true },
        limit: { default: 1 },
        user_location: {
          properties: {
            country: { default: 'China' },
            region: { default: 'Hubei' },
            city: { default: 'Wuhan' },
          },
        },
      },
    })
    if (result.ok) {
      expect(result.data.toolCalls?.[0]?.mockResult).toMatchObject({
        mode: 'mock',
        operation: 'web_search',
        applied: false,
      })
    }
  })

  it('MiMo native web_search uses provider-native tool shape', async () => {
    const result = await service.invoke({
      mode: 'blocking',
      constraintMode: 'api_json',
      promptSlots: promptSlots('search current context', { taskTitle: 'string' }),
      outputContract: { taskTitle: 'string' },
      params: {
        enabled_tools: ['web_search'],
        native_web_search: true,
        tool_choice: 'auto',
      },
    })

    expect(result.ok).toBe(true)
    expect(stub.lastInput?.tools).toEqual([
      {
        type: 'web_search',
        max_keyword: 3,
        force_search: true,
        limit: 1,
        user_location: {
          type: 'approximate',
          country: 'China',
          region: 'Hubei',
          city: 'Wuhan',
        },
      },
    ])
    if (result.ok) {
      expect(result.data.requestPreview?.finalRequestJson.tools).toEqual(stub.lastInput?.tools)
    }
  })
})
