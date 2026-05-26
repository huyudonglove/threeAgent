// src-main/model-lab/model-lab-service.ts
// 模型输出实验服务：不创建正式任务，只用于诊断模型行为。

import type { AppPathResolver } from '../storage/app-path-resolver'
import type { ModelInvokeService } from '../model-runtime/model-invoke-service'
import type { ModelInvokeInput, ModelStreamEvent, ToolCall, ToolChoice, ToolDefinition } from '../model-runtime/contracts'
import type { Result } from '../errors/result'
import { ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import { ModelOutputValidator } from './model-output-validator'
import { ModelLabRunStore } from './model-lab-run-store'
import { PromptTemplateStore } from './prompt-template-store'
import { StructuredOutputPromptBuilder, stringifyContract } from './structured-output-prompt-builder'
import type {
  ModelLabConsistencyInput,
  ModelLabConsistencyResult,
  ModelLabConstraintMode,
  ModelLabInvokeInput,
  ModelLabInvokeResult,
  ModelLabInputSnapshot,
  ModelLabParameterSweepInput,
  ModelLabParameterSweepResult,
  ModelLabRunRecord,
  ModelLabStreamEvent,
  ModelLabRequestPreview,
  ModelLabToolDefinition,
  ModelLabProviderSpecificParams,
  PromptTemplateRecord,
} from './model-lab-contracts'

export class ModelLabService {
  private validator = new ModelOutputValidator()
  private promptBuilder = new StructuredOutputPromptBuilder()
  private runStore: ModelLabRunStore
  private templateStore: PromptTemplateStore

  constructor(
    appPathResolver: AppPathResolver,
    private modelInvokeService: ModelInvokeService,
  ) {
    this.runStore = new ModelLabRunStore(appPathResolver)
    this.templateStore = new PromptTemplateStore(appPathResolver)
  }

  async invoke(input: ModelLabInvokeInput): Promise<Result<ModelLabInvokeResult>> {
    if (input.mode === 'stream') {
      return this.invokeStream(input)
    }
    return this.invokeBlocking(input)
  }

  async invokeBlocking(input: ModelLabInvokeInput): Promise<Result<ModelLabInvokeResult>> {
    const startedAt = Date.now()
    const runId = `lab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const invokeResult = await this.modelInvokeService.invoke(this.toModelInvokeInput(input, 'blocking'))
    const latencyMs = Date.now() - startedAt

    if (!invokeResult.ok) {
      const result = this.buildErrorResult(runId, input, latencyMs, invokeResult.error)
      await this.persistIfNeeded(input, result)
      return ok(result)
    }

    const shouldParse = shouldParseJson(input.constraintMode)
    const validation = this.validator.validate(invokeResult.data.content, input.outputContract, shouldParse)
    const toolCalls = attachMockToolResults(invokeResult.data.toolCalls, input)
    const result: ModelLabInvokeResult = {
      runId,
      rawOutput: invokeResult.data.content,
      parsedJson: validation.parsedJson,
      toolCalls,
      validation: validation.validation,
      metrics: {
        latencyMs: invokeResult.data.latencyMs ?? latencyMs,
        firstTokenMs: null,
        promptTokens: invokeResult.data.usage?.promptTokens ?? null,
        completionTokens: invokeResult.data.usage?.completionTokens ?? null,
        totalTokens: invokeResult.data.usage?.totalTokens ?? null,
        estimatedCost: null,
        finishReason: invokeResult.data.finishReason ?? null,
      },
      requestPreview: this.buildRequestPreview(input, 'blocking'),
      inputSnapshot: this.buildInputSnapshot(input, 'blocking'),
      error: validation.validation.schemaOk || !shouldParse
        ? null
        : createError('MODEL_OUTPUT_PARSE_FAILED', 'model-lab', 'Model output failed JSON or contract validation.', {
          recoverable: true,
          detail: validation.validation,
        }),
    }

    await this.persistIfNeeded(input, result)
    return ok(result)
  }

  async invokeStream(input: ModelLabInvokeInput): Promise<Result<ModelLabInvokeResult>> {
    const startedAt = Date.now()
    const runId = `lab_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const streamEvents: ModelLabStreamEvent[] = []
    const chunks: string[] = []
    let firstTokenMs: number | null = null
    let finishReason: string | null = null
    let promptTokens: number | null = null
    let completionTokens: number | null = null
    let totalTokens: number | null = null
    let streamError: ReturnType<typeof createError> | null = null

    await this.modelInvokeService.invokeStream(this.toModelInvokeInput(input, 'stream'), (event: ModelStreamEvent) => {
      streamEvents.push({
        index: streamEvents.length,
        timestamp: new Date().toISOString(),
        event,
      })

      if (event.type === 'delta') {
        if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt
        chunks.push(event.text)
      } else if (event.type === 'done') {
        finishReason = event.finishReason ?? null
        const usage = event.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined
        promptTokens = usage?.promptTokens ?? usage?.prompt_tokens ?? null
        completionTokens = usage?.completionTokens ?? usage?.completion_tokens ?? null
        totalTokens = usage?.totalTokens ?? usage?.total_tokens ?? null
      } else if (event.type === 'error') {
        streamError = createError('MODEL_INVOKE_FAILED', 'model-lab', event.message, {
          recoverable: event.recoverable,
        })
      }
    })

    const rawOutput = chunks.join('')
    const shouldParse = shouldParseJson(input.constraintMode)
    const validation = this.validator.validate(rawOutput, input.outputContract, shouldParse)
    const result: ModelLabInvokeResult = {
      runId,
      rawOutput,
      parsedJson: validation.parsedJson,
      validation: validation.validation,
      streamEvents,
      metrics: {
        latencyMs: Date.now() - startedAt,
        firstTokenMs,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost: null,
        finishReason,
      },
      requestPreview: this.buildRequestPreview(input, 'stream'),
      inputSnapshot: this.buildInputSnapshot(input, 'stream'),
      error: streamError ?? (validation.validation.schemaOk || !shouldParse
        ? null
        : createError('MODEL_OUTPUT_PARSE_FAILED', 'model-lab', 'Streamed model output failed JSON or contract validation.', {
          recoverable: true,
          detail: validation.validation,
        })),
    }

    await this.persistIfNeeded(input, result)
    return ok(result)
  }

  validateOutput(input: { rawOutput: string; outputContract?: unknown; shouldParseJson?: boolean }): Result<ReturnType<ModelOutputValidator['validate']>> {
    return ok(this.validator.validate(input.rawOutput, input.outputContract, input.shouldParseJson ?? true))
  }

  async runParameterSweep(input: ModelLabParameterSweepInput): Promise<Result<ModelLabParameterSweepResult>> {
    const runId = `sweep_${Date.now()}`
    const temperatures = input.temperatures?.length ? input.temperatures : [input.baseInput.params?.temperature ?? 0.2]
    const topPs = input.topPs?.length ? input.topPs : [input.baseInput.params?.top_p ?? 1]
    const constraintModes = input.constraintModes?.length ? input.constraintModes : [input.baseInput.constraintMode]
    const streamModes = input.streamModes?.length ? input.streamModes : [input.baseInput.mode === 'stream']
    const seeds = input.seeds?.length ? input.seeds : [input.baseInput.params?.seed ?? null]
    const results: ModelLabInvokeResult[] = []

    for (const temperature of temperatures) {
      for (const topP of topPs) {
        for (const constraintMode of constraintModes) {
          for (const stream of streamModes) {
            for (const seed of seeds) {
              const result = await this.invoke({
                ...input.baseInput,
                mode: stream ? 'stream' : 'blocking',
                constraintMode,
                params: {
                  ...input.baseInput.params,
                  temperature,
                  top_p: topP,
                  seed,
                },
              })
              if (result.ok) results.push(result.data)
            }
          }
        }
      }
    }

    return ok({ runId, results })
  }

  async runConsistencyTest(input: ModelLabConsistencyInput): Promise<Result<ModelLabConsistencyResult>> {
    const runId = `consistency_${Date.now()}`
    const results: ModelLabInvokeResult[] = []
    const count = Math.max(1, Math.min(input.runCount, 20))

    for (let i = 0; i < count; i++) {
      const result = await this.invoke({
        ...input.input,
        params: {
          ...input.input.params,
          seed: input.fixedSeed ? input.input.params?.seed ?? 1 : input.input.params?.seed,
        },
      })
      if (result.ok) {
        results.push(result.data)
        if (input.stopOnFirstFailure && !result.data.validation.schemaOk) break
      }
      if (input.delayMs && i < count - 1) {
        await delay(input.delayMs)
      }
    }

    return ok({
      runId,
      results,
      summary: summarizeConsistency(results),
    })
  }

  listPromptTemplates(): Promise<Result<PromptTemplateRecord[]>> {
    return this.templateStore.list()
  }

  savePromptTemplate(input: Parameters<PromptTemplateStore['save']>[0]): Promise<Result<PromptTemplateRecord>> {
    return this.templateStore.save(input)
  }

  deletePromptTemplate(input: { id: string }): Promise<Result<{ deleted: boolean; id: string }>> {
    return this.templateStore.delete(input.id)
  }

  listRuns(limit?: number): Promise<Result<ModelLabRunRecord[]>> {
    return this.runStore.list(limit)
  }

  private toModelInvokeInput(input: ModelLabInvokeInput, mode: 'blocking' | 'stream'): ModelInvokeInput {
    const prompt = this.promptBuilder.build(input)
    const params = input.params ?? {}
    const tools = buildToolDefinitions(input)
    return {
      providerId: input.providerId,
      modelId: input.modelId,
      mode,
      messages: prompt.messages,
      responseFormat: input.constraintMode === 'api_json' ? 'json_object' : 'legacy_text',
      outputContract: prompt.contractText,
      temperature: params.temperature,
      topP: params.top_p,
      maxTokens: params.max_tokens,
      timeoutMs: params.timeout_ms,
      seed: params.seed,
      presencePenalty: params.presence_penalty,
      frequencyPenalty: params.frequency_penalty,
      stop: params.stop,
      reasoningEffort: params.reasoning_effort,
      providerSpecific: buildProviderSpecificParams(params.provider_specific),
      tools: tools.length ? tools : undefined,
      toolChoice: normalizeToolChoice(params.tool_choice, tools),
    }
  }

  private buildRequestPreview(input: ModelLabInvokeInput, mode: 'blocking' | 'stream'): ModelLabRequestPreview {
    const modelInput = this.toModelInvokeInput(input, mode)
    const params = input.params ?? {}
    const responseFormat = modelInput.responseFormat === 'legacy_text'
      ? undefined
      : { type: 'json_object' }
    const finalRequestJson = {
      modelId: modelInput.modelId,
      providerId: modelInput.providerId,
      messages: modelInput.messages,
      temperature: modelInput.temperature,
      top_p: modelInput.topP,
      max_tokens: modelInput.maxTokens,
      stream: mode === 'stream',
      response_format: responseFormat,
      reasoning_effort: modelInput.reasoningEffort && modelInput.reasoningEffort !== 'auto'
        ? modelInput.reasoningEffort
        : undefined,
      seed: modelInput.seed ?? undefined,
      presence_penalty: modelInput.presencePenalty,
      frequency_penalty: modelInput.frequencyPenalty,
      stop: modelInput.stop?.length ? modelInput.stop : undefined,
      tools: modelInput.tools,
      tool_choice: modelInput.toolChoice,
      provider_specific: modelInput.providerSpecific,
    }

    return {
      messages: modelInput.messages.map(message => ({
        role: message.role,
        content: message.content,
        name: message.name,
      })),
      params: {
        temperature: params.temperature,
        top_p: params.top_p,
        max_tokens: params.max_tokens,
        timeout_ms: params.timeout_ms,
        retry_count: params.retry_count,
        reasoning_effort: params.reasoning_effort,
        seed: params.seed,
        presence_penalty: params.presence_penalty,
        frequency_penalty: params.frequency_penalty,
        stop: params.stop,
        mode,
      },
      responseFormat: modelInput.responseFormat,
      tools: modelInput.tools,
      toolChoice: modelInput.toolChoice,
      providerSpecific: modelInput.providerSpecific,
      inactiveParams: buildInactiveParams(params, modelInput.providerSpecific),
      constraintSources: buildConstraintSources(input, modelInput),
      finalRequestJson: removeUndefined(finalRequestJson),
    }
  }

  private buildInputSnapshot(input: ModelLabInvokeInput, mode: 'blocking' | 'stream'): ModelLabInputSnapshot {
    return {
      providerId: input.providerId,
      modelId: input.modelId,
      mode,
      constraintMode: input.constraintMode,
      params: {
        ...(input.params ?? {}),
      },
    }
  }

  private buildErrorResult(
    runId: string,
    input: ModelLabInvokeInput,
    latencyMs: number,
    error: ReturnType<typeof createError>,
  ): ModelLabInvokeResult {
    return {
      runId,
      rawOutput: '',
      requestPreview: this.buildRequestPreview(input, input.mode),
      inputSnapshot: this.buildInputSnapshot(input, input.mode),
      validation: this.validator.validate('', input.outputContract, shouldParseJson(input.constraintMode)).validation,
      metrics: {
        latencyMs,
        firstTokenMs: null,
        promptTokens: null,
        completionTokens: null,
        totalTokens: null,
        estimatedCost: null,
        finishReason: null,
      },
      error,
    }
  }

  private async persistIfNeeded(input: ModelLabInvokeInput, result: ModelLabInvokeResult): Promise<void> {
    if (!input.persistRun) return

    await this.runStore.append({
      ...result,
      providerId: input.providerId,
      modelId: input.modelId,
      mode: input.mode,
      constraintMode: input.constraintMode,
      params: input.params ?? {},
      createdAt: new Date().toISOString(),
    })
  }
}

function shouldParseJson(mode: ModelLabConstraintMode): boolean {
  return mode === 'prompt_json' || mode === 'api_json'
}

function buildConstraintSources(input: ModelLabInvokeInput, modelInput: ModelInvokeInput): string[] {
  const sources: string[] = []
  if (input.systemPrompt.trim()) sources.push('System Prompt')
  if (input.userPrompt.trim()) sources.push('User Prompt')
  if (input.outputContract !== undefined) sources.push('期望输出 JSON（仅本地校验/预览，不自动注入 prompt）')
  if (modelInput.responseFormat === 'json_object') sources.push('API response_format: json_object')
  if (modelInput.tools?.length) sources.push('Tools / tool_choice')
  if (modelInput.providerSpecific) sources.push('Provider-specific params')
  return sources
}

function buildProviderSpecificParams(input?: ModelLabProviderSpecificParams): Record<string, unknown> | undefined {
  if (!input) return undefined
  const body: Record<string, unknown> = {}
  if (input.thinkingType && input.thinkingType !== 'default') {
    body.thinking = { type: input.thinkingType }
  }
  return Object.keys(body).length ? body : undefined
}

function buildInactiveParams(
  params: ModelLabInvokeInput['params'] | undefined,
  providerSpecific?: Record<string, unknown>,
): string[] {
  const thinking = providerSpecific?.thinking as { type?: string } | undefined
  if (thinking?.type !== 'enabled') return []
  const inactive: string[] = []
  if (params?.temperature !== undefined) inactive.push('temperature')
  if (params?.top_p !== undefined) inactive.push('top_p')
  if (params?.presence_penalty !== undefined) inactive.push('presence_penalty')
  if (params?.frequency_penalty !== undefined) inactive.push('frequency_penalty')
  return inactive
}

function buildToolDefinitions(input: ModelLabInvokeInput): ToolDefinition[] {
  const params = input.params ?? {}

  const enabledNames = params.enabled_tools ?? (params.tool_calling ? ['calculator', 'current_time', 'json_validator'] : [])
  if (!enabledNames.length) return []

  const builtinTools = getBuiltinLabTools().filter(tool => enabledNames.includes(tool.name))
  const customTools = (params.custom_tools ?? []).filter(tool => enabledNames.includes(tool.name))
  return [...builtinTools, ...customTools].map(toToolDefinition)
}

function getBuiltinLabTools(): ModelLabToolDefinition[] {
  return [
    {
      name: 'calculator',
      description: '执行安全的基础四则运算表达式，用于观察模型是否会生成结构化工具参数。',
      builtin: true,
      parameters: {
        type: 'object',
        required: ['expression'],
        properties: {
          expression: { type: 'string', description: '只包含数字、空格、小数点和 + - * / ( ) 的表达式。' },
        },
      },
      mockResult: { value: 42, note: 'mock calculator result' },
    },
    {
      name: 'current_time',
      description: '返回当前时间，用于观察无参数或简单参数工具调用。',
      builtin: true,
      parameters: {
        type: 'object',
        properties: {
          timezone: { type: 'string', description: '可选时区，例如 Asia/Shanghai。' },
        },
      },
      mockResult: { iso: new Date(0).toISOString(), timezone: 'mock' },
    },
    {
      name: 'json_validator',
      description: '校验一段 JSON 文本是否可解析。',
      builtin: true,
      parameters: {
        type: 'object',
        required: ['jsonText'],
        properties: {
          jsonText: { type: 'string', description: '需要校验的 JSON 字符串。' },
        },
      },
      mockResult: { valid: true },
    },
    {
      name: 'echo_tool',
      description: '原样返回入参，用于观察工具调用参数结构。',
      builtin: true,
      parameters: {
        type: 'object',
        properties: {
          payload: { description: '任意要回显的内容。' },
        },
      },
      mockResult: { echoed: true },
    },
    {
      name: 'mock_search',
      description: '返回固定模拟搜索结果，不访问网络。',
      builtin: true,
      parameters: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: '搜索关键词。' },
        },
      },
      mockResult: {
        results: [
          { title: 'Mock result', summary: '这是固定模拟搜索结果，不代表真实网络内容。' },
        ],
      },
    },
    {
      name: 'cli_run',
      description: '生成通用 CLI 命令调用参数，用于观察模型是否会产生命令执行意图；实验阶段只返回 mock result，不执行真实命令。',
      builtin: true,
      parameters: {
        type: 'object',
        required: ['command'],
        properties: {
          command: { type: 'string', description: '要观察的命令文本，例如 pnpm test。实验阶段不会真实执行。' },
          cwd: { type: 'string', description: '期望执行目录，必须是工作区内相对路径或空。' },
          timeoutMs: { type: 'number', description: '期望超时时间；实验阶段仅观察参数。' },
        },
      },
      mockResult: {
        mode: 'mock',
        operation: 'cli_run',
        exitCode: 0,
        stdout: 'Mock CLI output from model lab.',
        stderr: '',
        applied: false,
      },
    },
    {
      name: 'cli_list_processes',
      description: '生成进程列表查询参数，用于观察模型是否会调用系统诊断类工具；实验阶段只返回 mock result。',
      builtin: true,
      parameters: {
        type: 'object',
        properties: {
          filter: { type: 'string', description: '可选进程名过滤关键词。' },
        },
      },
      mockResult: {
        mode: 'mock',
        operation: 'cli_list_processes',
        processes: [
          { pid: 1001, name: 'node', cpu: 1.2 },
          { pid: 1002, name: 'electron', cpu: 0.8 },
        ],
      },
    },
    {
      name: 'cli_check_env',
      description: '生成环境版本检查参数，用于观察模型是否会检查 Node、pnpm、Git 等运行环境；实验阶段只返回 mock result。',
      builtin: true,
      parameters: {
        type: 'object',
        properties: {
          targets: {
            type: 'array',
            description: '要检查的工具名，例如 node、pnpm、git。',
            items: { type: 'string' },
          },
        },
      },
      mockResult: {
        mode: 'mock',
        operation: 'cli_check_env',
        versions: {
          node: 'mock-v20.0.0',
          pnpm: 'mock-9.0.0',
          git: 'mock-2.45.0',
        },
      },
    },
    {
      name: 'cli_run_tests',
      description: '生成测试命令调用参数，用于观察模型是否会选择合适测试命令；实验阶段只返回 mock result，不执行真实测试。',
      builtin: true,
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: '测试命令，例如 pnpm test。实验阶段不会真实执行。' },
          pattern: { type: 'string', description: '可选测试文件或用例过滤条件。' },
        },
      },
      mockResult: {
        mode: 'mock',
        operation: 'cli_run_tests',
        exitCode: 0,
        summary: 'Mock test run passed: 12 files, 128 tests.',
      },
    },
    {
      name: 'file_create',
      description: '创建工作区文件，用于观察模型是否会生成创建文件的工具参数；实验阶段只返回 mock result。',
      builtin: true,
      parameters: {
        type: 'object',
        required: ['path', 'content'],
        properties: {
          path: { type: 'string', description: '工作区内相对路径，例如 docs/research.md。' },
          content: { type: 'string', description: '要写入的新文件内容。' },
          overwrite: { type: 'boolean', description: '是否允许覆盖已存在文件；实验阶段仅观察参数。' },
        },
      },
      mockResult: {
        mode: 'mock',
        operation: 'create',
        applied: false,
        message: 'file_create is mocked in the model lab; no file was created.',
      },
    },
    {
      name: 'file_read',
      description: '读取工作区文件内容，用于观察模型是否会生成读取文件的工具参数；实验阶段只返回 mock result。',
      builtin: true,
      parameters: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', description: '工作区内相对路径。' },
          startLine: { type: 'number', description: '可选起始行号。' },
          endLine: { type: 'number', description: '可选结束行号。' },
        },
      },
      mockResult: {
        mode: 'mock',
        operation: 'read',
        content: 'Mock file content from model lab.',
      },
    },
    {
      name: 'file_update',
      description: '修改工作区文件片段，用于观察模型是否会生成更新文件的工具参数；实验阶段只返回 mock result。',
      builtin: true,
      parameters: {
        type: 'object',
        required: ['path', 'oldText', 'newText'],
        properties: {
          path: { type: 'string', description: '工作区内相对路径。' },
          oldText: { type: 'string', description: '需要替换的原始片段。' },
          newText: { type: 'string', description: '替换后的新片段。' },
        },
      },
      mockResult: {
        mode: 'mock',
        operation: 'update',
        applied: false,
        diffPreview: 'Mock diff only; no file was changed.',
      },
    },
    {
      name: 'file_delete',
      description: '删除工作区文件，用于观察模型是否会生成删除文件的工具参数；实验阶段只返回 mock result。',
      builtin: true,
      parameters: {
        type: 'object',
        required: ['path', 'reason'],
        properties: {
          path: { type: 'string', description: '工作区内相对路径。' },
          reason: { type: 'string', description: '说明为什么需要删除。' },
          confirm: { type: 'boolean', description: '真实执行前必须二次确认；实验阶段仅观察参数。' },
        },
      },
      mockResult: {
        mode: 'mock',
        operation: 'delete',
        applied: false,
        message: 'file_delete is mocked in the model lab; no file was deleted.',
      },
    },
  ]
}

function toToolDefinition(tool: ModelLabToolDefinition): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }
}

function attachMockToolResults(toolCalls: ToolCall[] | undefined, input: ModelLabInvokeInput): ModelLabInvokeResult['toolCalls'] {
  if (!toolCalls?.length) return undefined
  const tools = [...getBuiltinLabTools(), ...(input.params?.custom_tools ?? [])]
  return toolCalls.map(toolCall => ({
    ...toolCall,
    mockResult: tools.find(tool => tool.name === toolCall.function.name)?.mockResult,
  }))
}

function normalizeToolChoice(toolChoice: ToolChoice | undefined, tools: ToolDefinition[]): ToolChoice | undefined {
  if (!tools.length) return undefined
  return toolChoice ?? 'auto'
}

function removeUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

function summarizeConsistency(results: ModelLabInvokeResult[]): ModelLabConsistencyResult['summary'] {
  const total = results.length || 1
  const jsonOk = results.filter(result => result.validation.jsonParseOk).length
  const schemaOk = results.filter(result => result.validation.schemaOk).length
  const latency = average(results.map(result => result.metrics.latencyMs))
  const tokenValues = results.map(result => result.metrics.totalTokens).filter((v): v is number => typeof v === 'number')
  const fieldSets = results
    .map(result => result.parsedJson)
    .filter(isPlainObject)
    .map(value => new Set(Object.keys(value)))
  const fieldStabilityScore = calculateFieldStability(fieldSets)

  return {
    jsonParseSuccessRate: jsonOk / total,
    schemaSuccessRate: schemaOk / total,
    averageLatencyMs: latency,
    averageTotalTokens: tokenValues.length ? average(tokenValues) : null,
    fieldStabilityScore,
    contentDriftSummary: fieldStabilityScore === 1
      ? '字段集合稳定'
      : '字段集合存在漂移，请展开单轮结果查看差异',
  }
}

function calculateFieldStability(fieldSets: Array<Set<string>>): number {
  if (fieldSets.length <= 1) return fieldSets.length
  const allFields = new Set(fieldSets.flatMap(set => Array.from(set)))
  if (allFields.size === 0) return 1
  let stableCount = 0
  for (const field of allFields) {
    if (fieldSets.every(set => set.has(field))) stableCount += 1
  }
  return stableCount / allFields.size
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
