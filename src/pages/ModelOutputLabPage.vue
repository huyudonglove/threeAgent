<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

type ConstraintMode = 'loose_text' | 'prompt_json' | 'api_json' | 'legacy_text'
type RunMode = 'blocking' | 'stream'
type ResultTab = 'raw' | 'parsed' | 'validation' | 'reasoning' | 'stream' | 'metrics' | 'tools'
type RunPhase = 'idle' | 'preparing' | 'invoking' | 'parsing' | 'succeeded' | 'failed'
type LabStreamEventType = 'start' | 'delta' | 'reasoning_delta' | 'tool_call_delta' | 'done' | 'error'
type LabAction = 'none' | 'single_run' | 'temperature_sweep' | 'stability_test'

interface ProviderInfo {
  id: string
  name: string
  enabled: boolean
}

interface ModelInfo {
  id: string
  providerId: string
  modelName: string
  displayName: string
  capabilities: string[]
  enabled: boolean
}

interface AppConfig {
  providers: ProviderInfo[]
  models: ModelInfo[]
  defaultProviderId?: string
  defaultModelId?: string
}

interface LabValidation {
  jsonParseOk: boolean
  jsonObjectOk: boolean
  schemaOk: boolean
  missingFields: string[]
  extraFields: string[]
  typeMismatches: Array<{ path: string; expected: string; actual: string }>
  parseError?: string | null
}

interface LabToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
  mockResult?: unknown
}

interface LabStreamEventRecord {
  index: number
  timestamp: string
  event: Record<string, unknown> & {
    type?: LabStreamEventType
    text?: string
    toolCallId?: string
    name?: string
    argumentsDelta?: string
  }
}

interface LabRequestPreview {
  messages: Array<{ role: string; content: string; name?: string }>
  params: Record<string, unknown>
  responseFormat?: 'json_object' | 'legacy_text'
  tools?: Array<Record<string, unknown>>
  toolChoice?: unknown
  providerSpecific?: Record<string, unknown>
  inactiveParams?: string[]
  constraintSources: string[]
  finalRequestJson: Record<string, unknown>
}

interface LabInputSnapshot {
  providerId?: string
  modelId?: string
  mode: RunMode
  constraintMode: ConstraintMode
  params: {
    temperature?: number
    top_p?: number
    max_tokens?: number
    seed?: number | null
    enabled_tools?: string[]
    tool_choice?: string
    provider_specific?: { thinkingType?: string }
  } & Record<string, unknown>
}

interface LabResult {
  runId: string
  rawOutput: string
  parsedJson?: unknown
  toolCalls?: LabToolCall[]
  validation: LabValidation
  streamEvents?: LabStreamEventRecord[]
  metrics: {
    latencyMs: number
    firstTokenMs?: number | null
    promptTokens?: number | null
    completionTokens?: number | null
    totalTokens?: number | null
    estimatedCost?: number | null
    finishReason?: string | null
  }
  requestPreview?: LabRequestPreview
  inputSnapshot?: LabInputSnapshot
  error?: { code: string; message: string; recoverable: boolean; detail?: unknown } | null
}

interface PromptTemplateRecord {
  id: string
  name: string
  scenario: 'task_understanding' | 'research' | 'implementation' | 'review' | 'custom'
  systemPrompt: string
  userPromptTemplate: string
  outputContract: unknown
  responseFormat: 'json_object' | 'legacy_text'
  defaultParams: Record<string, unknown>
  status: 'draft' | 'candidate' | 'approved'
  createdAt: string
  updatedAt: string
}

interface BuiltinToolUi {
  name: string
  description: string
  group: '基础工具' | '文件 CRUD'
  risk: 'safe' | 'mock' | 'write' | 'delete'
  parameters: Record<string, unknown>
}

const apiAvailable = ref(Boolean(window.agentAPI))

const providers = ref<ProviderInfo[]>([])
const models = ref<ModelInfo[]>([])
const promptTemplates = ref<PromptTemplateRecord[]>([])
const selectedTemplateId = ref('')
const templateName = ref('Vue 预研 JSON')
const templateDirty = ref(false)
const templateNotice = ref('')
const savingTemplate = ref(false)
const selectedProviderId = ref('')
const selectedModelId = ref('')
const mode = ref<RunMode>('blocking')
const constraintMode = ref<ConstraintMode>('api_json')
const resultTab = ref<ResultTab>('raw')
const selectedBatchRunId = ref('')

const systemPrompt = ref('你是 Agent 后端模型，负责返回可校验的结构化结果。')
const userPrompt = ref('帮我预研下 Vue，判断它是否适合做一个桌面端 Agent 工作台的前端框架。')
const simpleStructureText = ref(JSON.stringify({
  taskTitle: 'string',
  goal: 'string',
  steps: ['string'],
  risks: ['string'],
  artifacts: [
    {
      type: 'string',
      title: 'string',
      summary: 'string',
    },
  ],
}, null, 2))

const params = ref({
  temperature: 0.2,
  top_p: 1,
  max_tokens: 4096,
  timeout_ms: 60000,
  retry_count: 0,
  reasoning_effort: 'auto',
  seed: null as number | null,
  presence_penalty: 0,
  frequency_penalty: 0,
  stop: '',
  tool_choice: 'auto',
  enabled_tools: ['calculator', 'current_time', 'json_validator'] as string[],
  thinking_type: 'default' as 'default' | 'enabled' | 'disabled',
})

const maxTokenOptions = [512, 1024, 2048, 4096, 8192, 16384]

const runCount = ref(3)
const sweepTemperatures = ref('0, 0.2, 0.5, 0.8, 1')
const running = ref(false)
const runPhase = ref<RunPhase>('idle')
const activeAction = ref<LabAction>('none')
const lastAction = ref<LabAction>('none')
const batchSource = ref<LabAction>('none')
const error = ref<string | null>(null)
const result = ref<LabResult | null>(null)
const sweepResults = ref<LabResult[]>([])

const builtinTools: BuiltinToolUi[] = [
  {
    name: 'calculator',
    description: '四则运算参数生成观察',
    group: '基础工具',
    risk: 'safe',
    parameters: {
      type: 'object',
      required: ['expression'],
      properties: {
        expression: { type: 'string', description: '只包含数字、空格、小数点和 + - * / ( ) 的表达式。' },
      },
    },
  },
  {
    name: 'current_time',
    description: '无参数/简单参数调用观察',
    group: '基础工具',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: '可选时区，例如 Asia/Shanghai。' },
      },
    },
  },
  {
    name: 'json_validator',
    description: 'JSON 文本校验调用观察',
    group: '基础工具',
    risk: 'safe',
    parameters: {
      type: 'object',
      required: ['jsonText'],
      properties: {
        jsonText: { type: 'string', description: '需要校验的 JSON 字符串。' },
      },
    },
  },
  {
    name: 'echo_tool',
    description: '回显入参结构',
    group: '基础工具',
    risk: 'safe',
    parameters: {
      type: 'object',
      properties: {
        payload: { description: '任意要回显的内容。' },
      },
    },
  },
  {
    name: 'mock_search',
    description: '固定模拟搜索结果',
    group: '基础工具',
    risk: 'mock',
    parameters: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string', description: '搜索关键词。' },
      },
    },
  },
  {
    name: 'cli_run',
    description: '通用命令参数观察，仅 mock',
    group: '基础工具',
    risk: 'mock',
    parameters: {
      type: 'object',
      required: ['command'],
      properties: {
        command: { type: 'string', description: '要观察的命令文本，例如 pnpm test。实验阶段不会真实执行。' },
        cwd: { type: 'string', description: '期望执行目录，必须是工作区内相对路径或空。' },
        timeoutMs: { type: 'number', description: '期望超时时间；实验阶段仅观察参数。' },
      },
    },
  },
  {
    name: 'cli_list_processes',
    description: '进程列表查询观察，仅 mock',
    group: '基础工具',
    risk: 'mock',
    parameters: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: '可选进程名过滤关键词。' },
      },
    },
  },
  {
    name: 'cli_check_env',
    description: '环境版本检查观察，仅 mock',
    group: '基础工具',
    risk: 'mock',
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
  },
  {
    name: 'cli_run_tests',
    description: '测试命令执行观察，仅 mock',
    group: '基础工具',
    risk: 'mock',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '测试命令，例如 pnpm test。实验阶段不会真实执行。' },
        pattern: { type: 'string', description: '可选测试文件或用例过滤条件。' },
      },
    },
  },
  {
    name: 'file_create',
    description: '创建文件参数观察，仅 mock',
    group: '文件 CRUD',
    risk: 'write',
    parameters: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path: { type: 'string', description: '工作区内相对路径，例如 docs/research.md。' },
        content: { type: 'string', description: '要写入的新文件内容。' },
        overwrite: { type: 'boolean', description: '是否允许覆盖已存在文件；实验阶段仅观察参数。' },
      },
    },
  },
  {
    name: 'file_read',
    description: '读取文件参数观察，仅 mock',
    group: '文件 CRUD',
    risk: 'mock',
    parameters: {
      type: 'object',
      required: ['path'],
      properties: {
        path: { type: 'string', description: '工作区内相对路径。' },
        startLine: { type: 'number', description: '可选起始行号。' },
        endLine: { type: 'number', description: '可选结束行号。' },
      },
    },
  },
  {
    name: 'file_update',
    description: '修改文件参数观察，仅 mock',
    group: '文件 CRUD',
    risk: 'write',
    parameters: {
      type: 'object',
      required: ['path', 'oldText', 'newText'],
      properties: {
        path: { type: 'string', description: '工作区内相对路径。' },
        oldText: { type: 'string', description: '需要替换的原始片段。' },
        newText: { type: 'string', description: '替换后的新片段。' },
      },
    },
  },
  {
    name: 'file_delete',
    description: '删除文件参数观察，仅 mock',
    group: '文件 CRUD',
    risk: 'delete',
    parameters: {
      type: 'object',
      required: ['path', 'reason'],
      properties: {
        path: { type: 'string', description: '工作区内相对路径。' },
        reason: { type: 'string', description: '说明为什么需要删除。' },
        confirm: { type: 'boolean', description: '真实执行前必须二次确认；实验阶段仅观察参数。' },
      },
    },
  },
]

const builtinToolGroups = computed(() => {
  const groups: Array<{ name: BuiltinToolUi['group']; tools: BuiltinToolUi[] }> = []
  for (const tool of builtinTools) {
    let group = groups.find(item => item.name === tool.group)
    if (!group) {
      group = { name: tool.group, tools: [] }
      groups.push(group)
    }
    group.tools.push(tool)
  }
  return groups
})

const constraintModes = [
  { value: 'loose_text', title: 'Loose Text', text: '不约束，观察模型自然输出。' },
  { value: 'prompt_json', title: 'Prompt JSON', text: '只靠提示词要求 JSON。' },
  { value: 'api_json', title: 'API JSON', text: '使用 response_format 强制 JSON object，推荐。' },
  { value: 'legacy_text', title: 'Legacy Text', text: '旧文本兼容模式，仅用于对照。' },
] as const

const runModes = [
  { value: 'blocking', title: 'Blocking', text: '一次性返回完整结果。' },
  { value: 'stream', title: 'Stream', text: '边生成边返回片段，完成后再拼接解析。' },
] as const

const filteredModels = computed(() => {
  if (!selectedProviderId.value) return models.value
  return models.value.filter(model => model.providerId === selectedProviderId.value)
})

const selectedModel = computed(() => models.value.find(model => model.id === selectedModelId.value))
const selectedProvider = computed(() => providers.value.find(provider => provider.id === selectedProviderId.value))
const supportsReasoning = computed(() => selectedModel.value?.capabilities?.includes('reasoning') ?? false)
const supportsTools = computed(() => selectedModel.value?.capabilities?.includes('tool_call') ?? false)
const supportsStructuredOutput = computed(() => selectedModel.value?.capabilities?.includes('structured_output') ?? false)
const selectedProviderName = computed(() => selectedProvider.value?.name ?? '')
const selectedModelName = computed(() => selectedModel.value?.modelName ?? '')
const providerKey = computed(() => `${selectedProviderId.value} ${selectedProviderName.value} ${selectedModelName.value}`.toLowerCase())
const isDeepSeekModel = computed(() => providerKey.value.includes('deepseek'))
const isMimoModel = computed(() => providerKey.value.includes('mimo'))
const supportsThinkingParam = computed(() => isDeepSeekModel.value || isMimoModel.value)
const providerSpecificBody = computed<Record<string, unknown> | undefined>(() => {
  if (!supportsThinkingParam.value || params.value.thinking_type === 'default') return undefined
  return { thinking: { type: params.value.thinking_type } }
})
const inactiveParamNames = computed(() => {
  if (params.value.thinking_type !== 'enabled' || !supportsThinkingParam.value) return []
  const names: string[] = []
  if (params.value.temperature !== undefined) names.push('temperature')
  if (params.value.top_p !== undefined) names.push('top_p')
  if (isDeepSeekModel.value && params.value.presence_penalty !== undefined) names.push('presence_penalty')
  if (isDeepSeekModel.value && params.value.frequency_penalty !== undefined) names.push('frequency_penalty')
  return names
})

const parsedOutputContract = computed(() => {
  try {
    return simpleStructureText.value.trim() ? JSON.parse(simpleStructureText.value) : undefined
  } catch {
    return undefined
  }
})

const contractError = computed(() => {
  if (!simpleStructureText.value.trim()) return null
  try {
    JSON.parse(simpleStructureText.value)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
})

const localRequestPreview = computed<LabRequestPreview>(() => {
  const outputContract = parsedOutputContract.value
  const messages = [
    { role: 'system', content: systemPrompt.value.trim() },
    { role: 'user', content: userPrompt.value.trim() },
  ].filter(message => message.content)

  const stop = parseStop()
  const tools = buildPreviewTools()
  const responseFormat = constraintMode.value === 'api_json' ? 'json_object' : 'legacy_text'
  const finalRequestJson = removeUndefined({
    providerId: selectedProviderId.value || undefined,
    modelId: selectedModelId.value || undefined,
    messages,
    temperature: params.value.temperature,
    top_p: params.value.top_p,
    max_tokens: params.value.max_tokens,
    stream: mode.value === 'stream',
    response_format: constraintMode.value === 'api_json' ? { type: 'json_object' } : undefined,
    reasoning_effort: params.value.reasoning_effort !== 'auto' ? params.value.reasoning_effort : undefined,
    seed: params.value.seed ?? undefined,
    presence_penalty: params.value.presence_penalty,
    frequency_penalty: params.value.frequency_penalty,
    stop: stop.length ? stop : undefined,
    tools: tools.length ? tools : undefined,
    tool_choice: tools.length ? params.value.tool_choice : undefined,
    provider_specific: providerSpecificBody.value,
  })

  return {
    messages,
    params: {
      temperature: params.value.temperature,
      top_p: params.value.top_p,
      max_tokens: params.value.max_tokens,
      timeout_ms: params.value.timeout_ms,
      retry_count: params.value.retry_count,
      reasoning_effort: params.value.reasoning_effort,
      seed: params.value.seed,
      presence_penalty: params.value.presence_penalty,
      frequency_penalty: params.value.frequency_penalty,
      stop,
      mode: mode.value,
      thinking_type: params.value.thinking_type,
    },
    responseFormat,
    tools,
    toolChoice: tools.length ? params.value.tool_choice : undefined,
    providerSpecific: providerSpecificBody.value,
    inactiveParams: inactiveParamNames.value,
    constraintSources: [
      systemPrompt.value.trim() ? 'System Prompt' : '',
      userPrompt.value.trim() ? 'User Prompt' : '',
      outputContract !== undefined ? '期望输出 JSON（仅本地校验/预览）' : '',
      constraintMode.value === 'api_json' ? 'API response_format: json_object' : '',
      tools.length ? 'Tools / tool_choice' : '',
      providerSpecificBody.value ? 'Provider-specific params' : '',
    ].filter(Boolean),
    finalRequestJson,
  }
})

const requestPreview = computed(() => result.value?.requestPreview ?? localRequestPreview.value)
const selectedTemplate = computed(() => promptTemplates.value.find(item => item.id === selectedTemplateId.value))
const selectedBatchResult = computed(() => {
  if (!sweepResults.value.length) return null
  return sweepResults.value.find(item => item.runId === selectedBatchRunId.value) ?? sweepResults.value[0]
})
const selectedBatchSnapshot = computed(() => selectedBatchResult.value?.inputSnapshot)
const streamEvents = computed(() => result.value?.streamEvents ?? [])
const reasoningEvents = computed(() => streamEvents.value.filter(item => item.event.type === 'reasoning_delta'))
const contentDeltaEvents = computed(() => streamEvents.value.filter(item => item.event.type === 'delta'))
const toolDeltaEvents = computed(() => streamEvents.value.filter(item => item.event.type === 'tool_call_delta'))
const reasoningText = computed(() => joinStreamText(reasoningEvents.value))
const streamContentText = computed(() => joinStreamText(contentDeltaEvents.value))
const streamEventSummary = computed(() => ({
  total: streamEvents.value.length,
  delta: contentDeltaEvents.value.length,
  reasoning_delta: reasoningEvents.value.length,
  tool_call_delta: toolDeltaEvents.value.length,
  done: streamEvents.value.filter(item => item.event.type === 'done').length,
  error: streamEvents.value.filter(item => item.event.type === 'error').length,
}))
const actionLabels: Record<LabAction, string> = {
  none: '未运行',
  single_run: '单次运行',
  temperature_sweep: '温度扫描',
  stability_test: '稳定性测试',
}
const actionSourceLabel = computed(() => actionLabels[activeAction.value !== 'none' ? activeAction.value : lastAction.value])
const batchSourceLabel = computed(() => actionLabels[batchSource.value])
const batchTitle = computed(() => {
  if (batchSource.value === 'temperature_sweep') return `批量结果 - ${actionLabels.temperature_sweep}`
  if (batchSource.value === 'stability_test') return `批量结果 - ${actionLabels.stability_test}`
  return '批量结果'
})
const batchSubtitle = computed(() => {
  if (batchSource.value === 'temperature_sweep') return `温度列表：${parseNumberList(sweepTemperatures.value).join(', ') || '-'}`
  if (batchSource.value === 'stability_test') {
    const seedText = params.value.seed === null ? '未固定 seed' : `固定 seed=${params.value.seed}`
    return `同参数重复 ${runCount.value} 次，${seedText}`
  }
  return ''
})
const seedSemanticNote = computed(() => {
  if (params.value.seed === null) return '当前未固定 seed；低 temperature 只降低随机性，不等于确定性输出。'
  return `当前将尝试固定 seed=${params.value.seed}；部分服务商或模型可能忽略 seed，不能承诺逐字一致。`
})
const parameterSnapshot = computed(() => ({
  action: actionSourceLabel.value,
  provider: selectedProvider.value?.name ?? '默认/自动',
  model: selectedModel.value?.displayName ?? selectedModel.value?.modelName ?? '默认/自动',
  temperature: params.value.temperature,
  top_p: params.value.top_p,
  seed: params.value.seed,
  fixedSeed: params.value.seed !== null,
  constraintMode: constraintMode.value,
  mode: mode.value,
  stream: mode.value === 'stream',
  max_tokens: params.value.max_tokens,
  thinking_type: params.value.thinking_type,
  reasoning_effort: params.value.reasoning_effort,
}))
const showBatchPanel = computed(() => (
  sweepResults.value.length > 0
  || batchSource.value === 'temperature_sweep'
  || batchSource.value === 'stability_test'
  || activeAction.value === 'temperature_sweep'
  || activeAction.value === 'stability_test'
))
const stopWarning = computed(() => {
  if (!parseStop().length) return ''
  if (constraintMode.value === 'api_json' || constraintMode.value === 'prompt_json') {
    return 'JSON 模式下 stop 可能提前截断 JSON 或 tool call 参数。'
  }
  return ''
})
const penaltyWarning = computed(() => {
  const hasPenalty = params.value.presence_penalty > 0 || params.value.frequency_penalty > 0
  if (!hasPenalty) return ''
  if (constraintMode.value === 'api_json' || constraintMode.value === 'prompt_json') {
    return '较高 penalty 可能影响固定字段、枚举值和结构稳定性。'
  }
  return ''
})
const thinkingWarning = computed(() => {
  if (!supportsThinkingParam.value) return ''
  if (params.value.thinking_type !== 'enabled') return ''
  if (inactiveParamNames.value.length === 0) return ''
  return `当前 thinking enabled，${inactiveParamNames.value.join(', ')} 可能不生效或被服务商接管。`
})
const selectedToolCount = computed(() => params.value.enabled_tools.length)
const toolWarning = computed(() => {
  if (!selectedToolCount.value) return ''
  if (!supportsTools.value) return '当前模型未声明支持原生 tools，勾选工具后服务商可能忽略该参数。'
  return ''
})
const runDisabledReason = computed(() => {
  if (!apiAvailable.value) return '当前页面没有检测到 Electron preload API，请在桌面应用窗口中运行。'
  if (contractError.value) return `输出结构不是合法 JSON：${contractError.value}`
  if (running.value) return '正在运行，请等待当前调用完成。'
  return ''
})
const runStatusText = computed(() => {
  const text: Record<RunPhase, string> = {
    idle: '尚未运行',
    preparing: '准备请求',
    invoking: mode.value === 'stream' ? '正在流式调用模型' : '正在调用模型',
    parsing: '解析输出',
    succeeded: '运行完成',
    failed: '运行失败',
  }
  return text[runPhase.value]
})
const advancedParamSummary = computed(() => {
  const active: string[] = []
  if (params.value.reasoning_effort !== 'auto') active.push('reasoning_effort')
  if (params.value.seed !== null) active.push('seed')
  if (params.value.presence_penalty !== 0) active.push('presence_penalty')
  if (params.value.frequency_penalty !== 0) active.push('frequency_penalty')
  if (parseStop().length) active.push('stop')
  return active.length ? `已设置：${active.join(', ')}` : '默认'
})

watch([systemPrompt, userPrompt, simpleStructureText], () => {
  templateDirty.value = Boolean(selectedTemplateId.value)
})

watch(sweepResults, results => {
  if (results.length && !selectedBatchRunId.value) {
    selectedBatchRunId.value = results[0].runId
  }
})

onMounted(async () => {
  apiAvailable.value = Boolean(window.agentAPI)
  await loadConfig()
  await loadPromptTemplates()
})

async function loadConfig() {
  const api = window.agentAPI
  if (!api) {
    error.value = '当前页面没有检测到 Electron preload API，模型实验台需要在桌面应用窗口中运行。'
    return
  }

  const configResult = await api.readAppModelConfig()
  if (!configResult.ok || !configResult.data) return

  const config = configResult.data as AppConfig
  providers.value = config.providers ?? []
  models.value = config.models ?? []
  selectedProviderId.value = config.defaultProviderId ?? providers.value[0]?.id ?? ''
  selectedModelId.value = config.defaultModelId ?? models.value.find(model => model.providerId === selectedProviderId.value)?.id ?? models.value[0]?.id ?? ''
}

async function loadPromptTemplates() {
  const api = window.agentAPI
  if (!api) return

  const response = await api.modelLabListPromptTemplates()
  if (response.ok) {
    promptTemplates.value = response.data as PromptTemplateRecord[]
  } else {
    templateNotice.value = response.error?.message ?? '提示词方案加载失败'
  }
}

function buildInput(runMode: RunMode = mode.value) {
  const input = {
    providerId: selectedProviderId.value || undefined,
    modelId: selectedModelId.value || undefined,
    mode: runMode,
    constraintMode: constraintMode.value,
    systemPrompt: systemPrompt.value,
    userPrompt: userPrompt.value,
    outputContract: toPlainClone(parsedOutputContract.value),
    params: {
      temperature: params.value.temperature,
      top_p: params.value.top_p,
      max_tokens: params.value.max_tokens,
      timeout_ms: params.value.timeout_ms,
      retry_count: params.value.retry_count,
      reasoning_effort: params.value.reasoning_effort,
      seed: params.value.seed,
      presence_penalty: params.value.presence_penalty,
      frequency_penalty: params.value.frequency_penalty,
      stop: parseStop(),
      tool_calling: params.value.enabled_tools.length > 0,
      tool_choice: params.value.tool_choice,
      enabled_tools: [...params.value.enabled_tools],
      provider_specific: {
        thinkingType: params.value.thinking_type,
      },
    },
    persistRun: true,
  }
  return toPlainClone(input)
}

async function runOnce() {
  const api = window.agentAPI
  if (!api) {
    apiAvailable.value = false
    error.value = '当前页面没有检测到 Electron preload API，无法调用模型实验接口。请在桌面应用窗口中运行。'
    runPhase.value = 'failed'
    return
  }

  if (contractError.value) {
    error.value = `输出结构不是合法 JSON：${contractError.value}`
    runPhase.value = 'failed'
    return
  }

  running.value = true
  runPhase.value = 'preparing'
  activeAction.value = 'single_run'
  lastAction.value = 'single_run'
  batchSource.value = 'none'
  error.value = null
  result.value = null
  try {
    runPhase.value = 'invoking'
    const response = await api.modelLabInvoke(buildInput(mode.value))
    if (response.ok) {
      runPhase.value = 'parsing'
      result.value = response.data as LabResult
      resultTab.value = 'raw'
      runPhase.value = (response.data as LabResult).error ? 'failed' : 'succeeded'
    } else {
      error.value = response.error?.message ?? '模型实验调用失败'
      runPhase.value = 'failed'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    runPhase.value = 'failed'
  } finally {
    running.value = false
    activeAction.value = 'none'
  }
}

async function runSweep() {
  const api = window.agentAPI
  if (!api) {
    apiAvailable.value = false
    error.value = '当前页面没有检测到 Electron preload API，无法执行参数扫描。请在桌面应用窗口中运行。'
    return
  }

  if (contractError.value) {
    error.value = `输出结构不是合法 JSON：${contractError.value}`
    return
  }

  running.value = true
  activeAction.value = 'temperature_sweep'
  lastAction.value = 'temperature_sweep'
  batchSource.value = 'temperature_sweep'
  runPhase.value = 'preparing'
  error.value = null
  sweepResults.value = []
  selectedBatchRunId.value = ''
  try {
    const temperatures = parseNumberList(sweepTemperatures.value)
    runPhase.value = 'invoking'
    const response = await api.modelLabRunParameterSweep({
      baseInput: buildInput('blocking'),
      temperatures,
      topPs: [params.value.top_p],
      constraintModes: [constraintMode.value],
      streamModes: [false],
    })
    if (response.ok) {
      runPhase.value = 'parsing'
      sweepResults.value = ((response.data as { results?: LabResult[] }).results ?? [])
      selectedBatchRunId.value = sweepResults.value[0]?.runId ?? ''
      runPhase.value = sweepResults.value.some(item => item.error) ? 'failed' : 'succeeded'
    } else {
      error.value = response.error?.message ?? '参数扫描失败'
      runPhase.value = 'failed'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    runPhase.value = 'failed'
  } finally {
    running.value = false
    activeAction.value = 'none'
  }
}

async function runConsistency() {
  const api = window.agentAPI
  if (!api) {
    apiAvailable.value = false
    error.value = '当前页面没有检测到 Electron preload API，无法执行一致性测试。请在桌面应用窗口中运行。'
    return
  }

  if (contractError.value) {
    error.value = `输出结构不是合法 JSON：${contractError.value}`
    return
  }

  running.value = true
  activeAction.value = 'stability_test'
  lastAction.value = 'stability_test'
  batchSource.value = 'stability_test'
  runPhase.value = 'preparing'
  error.value = null
  sweepResults.value = []
  selectedBatchRunId.value = ''
  try {
    runPhase.value = 'invoking'
    const response = await api.modelLabRunConsistencyTest({
      input: buildInput('blocking'),
      runCount: runCount.value,
      fixedSeed: params.value.seed !== null,
      stopOnFirstFailure: false,
      delayMs: 0,
    })
    if (response.ok) {
      runPhase.value = 'parsing'
      sweepResults.value = ((response.data as { results?: LabResult[] }).results ?? [])
      selectedBatchRunId.value = sweepResults.value[0]?.runId ?? ''
      runPhase.value = sweepResults.value.some(item => item.error) ? 'failed' : 'succeeded'
    } else {
      error.value = response.error?.message ?? '稳定性测试失败'
      runPhase.value = 'failed'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    runPhase.value = 'failed'
  } finally {
    running.value = false
    activeAction.value = 'none'
  }
}

function applyPreset(name: 'stable' | 'balanced' | 'explore' | 'random') {
  const presets = {
    stable: { temperature: 0.2, top_p: 1 },
    balanced: { temperature: 0.5, top_p: 0.9 },
    explore: { temperature: 0.8, top_p: 0.95 },
    random: { temperature: 1, top_p: 1 },
  }
  params.value.temperature = presets[name].temperature
  params.value.top_p = presets[name].top_p
}

function applyTemplate() {
  const template = selectedTemplate.value
  if (!template) {
    templateNotice.value = '已切换到当前草稿'
    return
  }
  templateNotice.value = ''
  templateName.value = template.name
  systemPrompt.value = template.systemPrompt
  userPrompt.value = template.userPromptTemplate
  simpleStructureText.value = stringify(template.outputContract)
  templateDirty.value = false
  templateNotice.value = `已加载方案：${template.name}`
}

async function saveTemplate() {
  const api = window.agentAPI
  if (!api) {
    templateNotice.value = '当前页面没有检测到 Electron preload API，无法保存提示词方案。'
    return
  }

  if (contractError.value) {
    error.value = `输出结构不是合法 JSON：${contractError.value}`
    return
  }

  const name = templateName.value.trim() || selectedTemplate.value?.name || '未命名提示词方案'
  savingTemplate.value = true
  templateNotice.value = '正在保存方案...'

  try {
    const response = await api.modelLabSavePromptTemplate(toPlainClone({
      id: selectedTemplateId.value || undefined,
      name,
      scenario: 'research',
      systemPrompt: systemPrompt.value,
      userPromptTemplate: userPrompt.value,
      outputContract: toPlainClone(parsedOutputContract.value),
      responseFormat: 'json_object',
      defaultParams: {},
      status: 'draft',
    }))
    if (response.ok) {
      const saved = response.data as PromptTemplateRecord
      await loadPromptTemplates()
      selectedTemplateId.value = saved.id
      templateName.value = saved.name
      templateDirty.value = false
      templateNotice.value = `已保存方案：${saved.name}`
    } else {
      templateNotice.value = response.error?.message ?? '保存方案失败'
    }
  } finally {
    savingTemplate.value = false
  }
}

function copyTemplate() {
  const sourceName = selectedTemplate.value?.name || templateName.value.trim() || '当前草稿'
  selectedTemplateId.value = ''
  templateName.value = `${sourceName} 副本`
  templateDirty.value = true
  templateNotice.value = '已复制为未保存草稿，修改名称后点击保存。'
}

async function deleteTemplate() {
  const api = window.agentAPI
  const template = selectedTemplate.value
  if (!api) {
    templateNotice.value = '当前页面没有检测到 Electron preload API，无法删除提示词方案。'
    return
  }
  if (!template) {
    templateNotice.value = '请先选择要删除的已保存方案。'
    return
  }
  const confirmed = window.confirm(`确定删除提示词方案“${template.name}”吗？删除后不会影响当前参数、运行结果或历史记录。`)
  if (!confirmed) return

  savingTemplate.value = true
  templateNotice.value = '正在删除方案...'
  try {
    const response = await api.modelLabDeletePromptTemplate({ id: template.id })
    if (response.ok) {
      selectedTemplateId.value = ''
      templateDirty.value = false
      templateNotice.value = `已删除方案：${template.name}`
      await loadPromptTemplates()
    } else {
      templateNotice.value = response.error?.message ?? '删除方案失败'
    }
  } finally {
    savingTemplate.value = false
  }
}

function describeResultParams(item: LabResult, index: number) {
  const snapshot = item.inputSnapshot
  const parts: string[] = []
  if (batchSource.value === 'stability_test') {
    parts.push(`同参数第 ${index + 1} 次`)
  } else if (batchSource.value === 'temperature_sweep') {
    parts.push(`temp ${snapshot?.params.temperature ?? '-'}`)
  }
  parts.push(`top_p ${snapshot?.params.top_p ?? '-'}`)
  parts.push(`max ${snapshot?.params.max_tokens ?? '-'}`)
  parts.push(snapshot?.params.seed === null || snapshot?.params.seed === undefined ? 'seed 未固定' : `seed ${snapshot.params.seed}`)
  parts.push(snapshot?.constraintMode ?? constraintMode.value)
  parts.push(snapshot?.mode ?? mode.value)
  return parts.join(' · ')
}

function toggleTool(name: string, checked: boolean) {
  const set = new Set(params.value.enabled_tools)
  if (checked) set.add(name)
  else set.delete(name)
  params.value.enabled_tools = Array.from(set)
}

function parseStop() {
  return params.value.stop.split(',').map(item => item.trim()).filter(Boolean)
}

function parseNumberList(value: string) {
  return value.split(',').map(item => Number(item.trim())).filter(item => Number.isFinite(item))
}

function buildPreviewTools() {
  if (!params.value.enabled_tools.length) return []
  return builtinTools
    .filter(tool => params.value.enabled_tools.includes(tool.name))
    .map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }))
}

function isToolEnabled(name: string) {
  return params.value.enabled_tools.includes(name)
}

function stringify(value: unknown) {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function joinStreamText(events: LabStreamEventRecord[]) {
  return events.map(item => item.event.text ?? '').join('')
}

function shortRunId(runId: string) {
  return runId.replace(/^lab_/, '').slice(0, 18)
}

function removeUndefined(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined))
}

function toPlainClone<T>(value: T): T {
  if (value === undefined) return value
  return JSON.parse(JSON.stringify(value)) as T
}
</script>

<template>
  <main class="model-lab-page">
    <header class="lab-header">
      <div>
        <p class="eyebrow">Prompt & JSON Lab</p>
        <h1>模型输出实验</h1>
        <p>按“输入 → 请求预览 → 模型返回 → 解析与校验”观察模型行为。</p>
      </div>
    </header>

    <section v-if="error" class="lab-error">{{ error }}</section>

    <section class="top-grid">
      <section class="lab-panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Model</p>
            <h2>模型选择</h2>
          </div>
          <span class="muted">{{ selectedProvider?.name || '默认服务商' }}</span>
        </div>
        <div class="field-grid two">
          <label>
            <span>服务商</span>
            <select v-model="selectedProviderId">
              <option value="">默认/自动</option>
              <option v-for="provider in providers" :key="provider.id" :value="provider.id">
                {{ provider.name }}
              </option>
            </select>
          </label>
          <label>
            <span>模型</span>
            <select v-model="selectedModelId">
              <option value="">默认/自动</option>
              <option v-for="model in filteredModels" :key="model.id" :value="model.id">
                {{ model.displayName || model.modelName }}
              </option>
            </select>
          </label>
        </div>
        <div class="capability-row">
          <span :class="{ ok: supportsStructuredOutput }">结构化输出 {{ supportsStructuredOutput ? '支持' : '未声明' }}</span>
          <span :class="{ ok: selectedModel?.capabilities?.includes('streaming') }">流式 {{ selectedModel?.capabilities?.includes('streaming') ? '支持' : '未声明' }}</span>
          <span :class="{ ok: supportsTools }">工具 {{ supportsTools ? '支持' : '未声明' }}</span>
          <span :class="{ ok: supportsReasoning }">reasoning {{ supportsReasoning ? '支持' : '未声明' }}</span>
        </div>
      </section>

      <section class="lab-panel run-panel compact-run-panel">
        <div class="compact-run-row">
          <div>
            <p class="eyebrow">Run Settings</p>
            <h2>运行设置</h2>
          </div>
          <label>
            <span>调用方式</span>
            <select v-model="mode">
              <option v-for="item in runModes" :key="item.value" :value="item.value">{{ item.title }}</option>
            </select>
          </label>
          <label>
            <span>输出约束</span>
            <select v-model="constraintMode">
              <option v-for="item in constraintModes" :key="item.value" :value="item.value">{{ item.title }}</option>
            </select>
          </label>
          <button class="primary-button" type="button" :class="{ active: activeAction === 'single_run' }" :disabled="Boolean(runDisabledReason)" @click="runOnce">
            {{ running ? '运行中...' : '按当前设置运行' }}
          </button>
        </div>
        <p class="run-status" :class="{ danger: runPhase === 'failed', ok: runPhase === 'succeeded' }">
          {{ actionSourceLabel }}：{{ runStatusText }}
        </p>
        <p v-if="runDisabledReason && !running" class="warning-note">{{ runDisabledReason }}</p>
      </section>
    </section>

    <section class="lab-grid">
      <section class="lab-panel prompt-panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Input</p>
            <h2>提示词与输出结构</h2>
          </div>
          <button class="secondary-button" type="button" :disabled="savingTemplate || Boolean(contractError)" @click="saveTemplate">
            {{ savingTemplate ? '保存中...' : selectedTemplateId ? (templateDirty ? '保存方案*' : '保存方案') : '保存为方案' }}
          </button>
        </div>

        <div class="template-row">
          <label>
            <span>提示词方案</span>
            <select v-model="selectedTemplateId" @change="applyTemplate">
              <option value="">当前草稿</option>
              <option v-for="template in promptTemplates" :key="template.id" :value="template.id">
                {{ template.name }}
              </option>
            </select>
          </label>
          <label>
            <span>方案名称</span>
            <input v-model="templateName" placeholder="输入方案名称" />
          </label>
          <button class="secondary-button" type="button" @click="copyTemplate">复制为草稿</button>
          <button class="danger-button" type="button" :disabled="!selectedTemplateId || savingTemplate" @click="deleteTemplate">删除方案</button>
        </div>
        <p v-if="templateNotice" class="notice-note">{{ templateNotice }}</p>

        <label>
          <span>System Prompt</span>
          <textarea v-model="systemPrompt" rows="6" />
        </label>
        <label>
          <span>User Prompt</span>
          <textarea v-model="userPrompt" rows="6" />
        </label>

        <div class="schema-toolbar">
          <div>
            <strong>期望输出 JSON</strong>
            <p>这里只写模型最终需要返回的字段形状。string / number / boolean 是类型占位，不是固定内容。</p>
          </div>
        </div>

        <label>
          <span>期望输出 JSON</span>
          <textarea v-model="simpleStructureText" rows="12" spellcheck="false" />
        </label>
        <p v-if="contractError" class="inline-error">{{ contractError }}</p>
      </section>

      <aside class="lab-panel params-panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Parameters</p>
            <h2>实验参数</h2>
          </div>
        </div>

        <div class="preset-row">
          <button type="button" @click="applyPreset('stable')">稳定 JSON</button>
          <button type="button" @click="applyPreset('balanced')">平衡分析</button>
          <button type="button" @click="applyPreset('explore')">发散探索</button>
          <button type="button" @click="applyPreset('random')">极限随机</button>
        </div>

        <div class="param-list">
          <label>
            <span>temperature <b>{{ params.temperature }}</b></span>
            <input v-model.number="params.temperature" type="range" min="0" max="1.5" step="0.1" />
            <small>控制随机性；JSON 稳定性测试建议 0 或 0.2。</small>
          </label>
          <label>
            <span>top_p <b>{{ params.top_p }}</b></span>
            <input v-model.number="params.top_p" type="range" min="0" max="1" step="0.05" />
            <small>控制采样范围；通常先保持 1。</small>
          </label>
          <label>
            <span>max_tokens</span>
            <select v-model.number="params.max_tokens">
              <option v-for="option in maxTokenOptions" :key="option" :value="option">{{ option }}</option>
            </select>
            <small>过低可能截断 JSON，过高可能增加延迟和成本。</small>
          </label>
          <label><span>timeout_ms</span><input v-model.number="params.timeout_ms" type="number" /></label>
          <label><span>retry_count</span><input v-model.number="params.retry_count" type="number" min="0" max="5" /><small>实验默认 0，避免重试掩盖问题。</small></label>
        </div>

        <details class="advanced-box">
          <summary>
            <span>高级参数</span>
            <small>{{ advancedParamSummary }}</small>
          </summary>
          <div class="param-list">
            <label>
              <span>reasoning_effort</span>
              <select v-model="params.reasoning_effort">
                <option value="auto">auto</option>
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
              <small>{{ supportsReasoning ? '影响推理预算、延迟和 token。' : '当前模型未声明支持，服务商可能忽略。' }}</small>
            </label>
            <label><span>seed</span><input v-model.number="params.seed" type="number" placeholder="空" /><small>可复现实验辅助，仅部分模型支持。</small></label>
            <label><span>presence_penalty</span><input v-model.number="params.presence_penalty" type="number" step="0.1" /><small>鼓励新内容，可能影响固定 JSON 结构。</small></label>
            <label><span>frequency_penalty</span><input v-model.number="params.frequency_penalty" type="number" step="0.1" /><small>减少高频重复，可能影响字段稳定。</small></label>
            <label><span>stop</span><input v-model="params.stop" placeholder="逗号分隔" /><small>命中停止字符串会提前结束输出。</small></label>
          </div>
          <p v-if="stopWarning" class="warning-note">{{ stopWarning }}</p>
          <p v-if="penaltyWarning" class="warning-note">{{ penaltyWarning }}</p>
        </details>

        <details v-if="supportsThinkingParam" class="advanced-box">
          <summary>服务商专属参数</summary>
          <label>
            <span>{{ isDeepSeekModel ? 'DeepSeek Thinking' : 'MiMo Thinking' }}</span>
            <select v-model="params.thinking_type">
              <option value="default">default</option>
              <option value="enabled">enabled</option>
              <option value="disabled">disabled</option>
            </select>
            <small>provider-specific 扩展字段，不是通用 OpenAI 参数。</small>
          </label>
          <p v-if="thinkingWarning" class="warning-note">{{ thinkingWarning }}</p>
        </details>

        <details class="advanced-box">
          <summary>工具调用实验</summary>
          <p class="muted">勾选的工具会进入接口 `tools` 参数，并在请求预览里展示。</p>
          <label>
            <span>tool_choice</span>
            <select v-model="params.tool_choice" :disabled="selectedToolCount === 0">
              <option value="auto">auto</option>
              <option value="none">none</option>
              <option value="required">required</option>
            </select>
            <small>未选择工具时不发送 tool_choice。</small>
          </label>
          <div class="tool-group-list">
            <section v-for="group in builtinToolGroups" :key="group.name" class="tool-group">
              <h3>{{ group.name }}</h3>
              <div class="tool-list">
                <label v-for="tool in group.tools" :key="tool.name" class="check-row">
                  <input
                    type="checkbox"
                    :checked="isToolEnabled(tool.name)"
                    @change="toggleTool(tool.name, ($event.target as HTMLInputElement).checked)"
                  />
                  <span>
                    <b>{{ tool.name }}</b>
                    {{ tool.description }}
                    <em v-if="tool.risk === 'write'">写入类 mock</em>
                    <em v-else-if="tool.risk === 'delete'">删除类 mock</em>
                    <em v-else-if="tool.risk === 'mock'">mock</em>
                  </span>
                </label>
              </div>
            </section>
          </div>
          <p v-if="toolWarning" class="warning-note">{{ toolWarning }}</p>
          <p class="notice-note">当前选择 {{ selectedToolCount }} 个工具；请求预览会展示最终 tools 数组。</p>
          <p class="muted">CLI 和文件增删改查第一版只注入工具 schema 和 mock result，不执行真实命令或文件操作。</p>
        </details>

        <details open class="advanced-box">
          <summary>参数扫描</summary>
          <div class="scan-row">
            <label>
              <span>温度列表</span>
              <input v-model="sweepTemperatures" placeholder="0, 0.2, 0.5, 0.8, 1" />
            </label>
            <button class="secondary-button" type="button" :class="{ active: activeAction === 'temperature_sweep' }" :disabled="Boolean(runDisabledReason)" @click="runSweep">开始温度扫描</button>
          </div>
          <div class="scan-row">
            <label>
              <span>稳定性次数</span>
              <input v-model.number="runCount" type="number" min="1" max="20" />
            </label>
            <button class="secondary-button" type="button" :class="{ active: activeAction === 'stability_test' }" :disabled="Boolean(runDisabledReason)" @click="runConsistency">开始稳定性测试</button>
          </div>
          <p class="notice-note">{{ seedSemanticNote }}</p>
        </details>
      </aside>

      <section class="lab-panel preview-panel">
        <div class="section-title">
          <div>
            <p class="eyebrow">Request Preview</p>
            <h2>实际发送内容</h2>
          </div>
          <span class="status-pill">{{ requestPreview.responseFormat === 'json_object' ? 'API JSON' : 'Text / Prompt' }}</span>
        </div>

        <div class="source-list">
          <span v-for="source in requestPreview.constraintSources" :key="source">{{ source }}</span>
        </div>
        <p v-if="requestPreview.inactiveParams?.length" class="warning-note">
          预计不生效参数：{{ requestPreview.inactiveParams.join(', ') }}
        </p>

        <div class="message-preview">
          <article v-for="message in requestPreview.messages" :key="message.role + message.content.slice(0, 16)">
            <strong>{{ message.role }}</strong>
            <pre>{{ message.content }}</pre>
          </article>
        </div>

        <h3>最终请求 JSON</h3>
        <pre class="request-json">{{ stringify(requestPreview.finalRequestJson) }}</pre>
      </section>
    </section>

    <section class="lab-panel result-panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Run Result</p>
          <h2>运行结果 - {{ actionSourceLabel }}</h2>
          <p v-if="result" class="muted">{{ result.runId }}</p>
        </div>
        <span v-if="result" class="status-pill" :class="{ ok: result.validation.schemaOk && !result.error }">
          {{ result.validation.schemaOk && !result.error ? '通过' : '需检查' }}
        </span>
      </div>

      <div v-if="result" class="metrics-grid">
        <span>source <strong>{{ actionSourceLabel }}</strong></span>
        <span>latency <strong>{{ result.metrics.latencyMs }}ms</strong></span>
        <span>first <strong>{{ result.metrics.firstTokenMs ?? '-' }}</strong></span>
        <span>prompt <strong>{{ result.metrics.promptTokens ?? '-' }}</strong></span>
        <span>completion <strong>{{ result.metrics.completionTokens ?? '-' }}</strong></span>
        <span>tokens <strong>{{ result.metrics.totalTokens ?? '-' }}</strong></span>
        <span>finish <strong>{{ result.metrics.finishReason ?? '-' }}</strong></span>
      </div>

      <div v-if="result" class="snapshot-strip">
        <span>temperature <strong>{{ parameterSnapshot.temperature }}</strong></span>
        <span>top_p <strong>{{ parameterSnapshot.top_p }}</strong></span>
        <span>seed <strong>{{ parameterSnapshot.seed ?? '未固定' }}</strong></span>
        <span>constraint <strong>{{ parameterSnapshot.constraintMode }}</strong></span>
        <span>mode <strong>{{ parameterSnapshot.mode }}</strong></span>
        <span>thinking <strong>{{ parameterSnapshot.thinking_type }}</strong></span>
      </div>

      <div v-if="result?.error" class="lab-error compact">
        {{ result.error.code }}：{{ result.error.message }}
      </div>

      <div v-if="!result" class="empty-state">
        <h3>{{ runStatusText }}</h3>
        <p v-if="running">{{ actionSourceLabel }}请求已发起，正在等待模型返回；完成后这里会展示原始输出、解析结果、校验结果、流式事件、token、耗时和工具调用。</p>
        <p v-else-if="runPhase === 'failed'">{{ error || '运行失败，请查看上方错误提示。' }}</p>
        <p v-else>点击“按当前设置运行”后，这里会展示模型原始输出、解析后的 JSON、校验结果、流式事件、token、耗时和工具调用。</p>
      </div>

      <div v-if="result" class="tabs">
        <button v-for="tab in ['raw', 'parsed', 'validation', 'reasoning', 'stream', 'metrics', 'tools']" :key="tab" :class="{ active: resultTab === tab }" type="button" @click="resultTab = tab as ResultTab">
          {{ tab }}
          <span v-if="tab === 'reasoning' && reasoningEvents.length" class="tab-count">{{ reasoningEvents.length }}</span>
        </button>
      </div>

      <div v-if="result" class="tab-body">
        <pre v-if="resultTab === 'raw'">{{ result?.rawOutput || '' }}</pre>
        <pre v-else-if="resultTab === 'parsed'">{{ stringify(result?.parsedJson) }}</pre>
        <pre v-else-if="resultTab === 'validation'">{{ stringify(result?.validation) }}</pre>
        <div v-else-if="resultTab === 'reasoning'" class="stream-detail">
          <div class="stream-summary">
            <span>reasoning_delta <strong>{{ reasoningEvents.length }}</strong></span>
            <span>chars <strong>{{ reasoningText.length }}</strong></span>
          </div>
          <pre>{{ reasoningText || '本次流式事件中没有 reasoning_delta。通常只有支持 reasoning/thinking 的模型和服务商才会返回。' }}</pre>
        </div>
        <div v-else-if="resultTab === 'stream'" class="stream-detail">
          <div class="stream-summary">
            <span>events <strong>{{ streamEventSummary.total }}</strong></span>
            <span>delta <strong>{{ streamEventSummary.delta }}</strong></span>
            <span>reasoning_delta <strong>{{ streamEventSummary.reasoning_delta }}</strong></span>
            <span>tool_call_delta <strong>{{ streamEventSummary.tool_call_delta }}</strong></span>
            <span>done <strong>{{ streamEventSummary.done }}</strong></span>
            <span>error <strong>{{ streamEventSummary.error }}</strong></span>
          </div>
          <div class="result-columns">
            <div>
              <h4>Content Delta</h4>
              <pre>{{ streamContentText || '本次没有 content delta。' }}</pre>
            </div>
            <div>
              <h4>Raw Events</h4>
              <pre>{{ stringify(result?.streamEvents ?? []) }}</pre>
            </div>
          </div>
        </div>
        <pre v-else-if="resultTab === 'metrics'">{{ stringify(result?.metrics) }}</pre>
        <pre v-else>{{ stringify(result?.toolCalls ?? []) }}</pre>
      </div>
    </section>

    <section v-if="showBatchPanel" class="lab-panel sweep-panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Batch Results</p>
          <h2>{{ batchTitle }}</h2>
          <p class="muted">{{ sweepResults.length }} 次运行{{ batchSubtitle ? ` · ${batchSubtitle}` : '' }}</p>
        </div>
        <span class="status-pill" :class="{ ok: runPhase === 'succeeded' }">{{ runStatusText }}</span>
      </div>
      <div v-if="batchSource === 'stability_test'" class="notice-note">{{ seedSemanticNote }}</div>
      <div v-if="sweepResults.length" class="snapshot-strip">
        <span>source <strong>{{ batchSourceLabel }}</strong></span>
        <span>temperature <strong>{{ selectedBatchSnapshot?.params.temperature ?? '-' }}</strong></span>
        <span>top_p <strong>{{ selectedBatchSnapshot?.params.top_p ?? '-' }}</strong></span>
        <span>max_tokens <strong>{{ selectedBatchSnapshot?.params.max_tokens ?? '-' }}</strong></span>
        <span>seed <strong>{{ selectedBatchSnapshot?.params.seed ?? '未固定' }}</strong></span>
        <span>constraint <strong>{{ selectedBatchSnapshot?.constraintMode ?? '-' }}</strong></span>
        <span>mode <strong>{{ selectedBatchSnapshot?.mode ?? '-' }}</strong></span>
      </div>
      <div v-if="!sweepResults.length" class="empty-state">
        <h3>{{ runStatusText }}</h3>
        <p v-if="running">{{ batchSourceLabel }}正在运行；完成后这里会展示每一轮结果。</p>
        <p v-else>{{ batchSourceLabel }}暂无结果。</p>
      </div>
      <div v-else class="batch-grid">
        <div class="batch-list">
          <button
            v-for="(item, index) in sweepResults"
            :key="item.runId"
            type="button"
            :class="{ active: selectedBatchResult?.runId === item.runId, danger: item.error || !item.validation.schemaOk }"
            @click="selectedBatchRunId = item.runId"
          >
            <strong>{{ shortRunId(item.runId) }}</strong>
            <span>{{ describeResultParams(item, index) }}</span>
            <span>parse {{ item.validation.jsonParseOk ? 'ok' : 'fail' }} · schema {{ item.validation.schemaOk ? 'ok' : 'fail' }}</span>
            <span>{{ item.metrics.latencyMs }}ms · {{ item.metrics.totalTokens ?? '-' }} tokens</span>
          </button>
        </div>
        <div class="batch-detail">
          <h3>{{ selectedBatchResult?.runId }}</h3>
          <div class="result-columns">
            <div>
              <h4>Parameters</h4>
              <pre>{{ stringify(selectedBatchResult?.inputSnapshot) }}</pre>
            </div>
            <div>
              <h4>Metrics / Error</h4>
              <pre>{{ stringify({ metrics: selectedBatchResult?.metrics, error: selectedBatchResult?.error }) }}</pre>
            </div>
          </div>
          <div class="result-columns">
            <div>
              <h4>Raw Output</h4>
              <pre>{{ selectedBatchResult?.rawOutput || '' }}</pre>
            </div>
            <div>
              <h4>Parsed JSON</h4>
              <pre>{{ stringify(selectedBatchResult?.parsedJson) }}</pre>
            </div>
          </div>
          <div class="result-columns">
            <div>
              <h4>Validation</h4>
              <pre>{{ stringify(selectedBatchResult?.validation) }}</pre>
            </div>
            <div>
              <h4>Stream Events</h4>
              <pre>{{ stringify(selectedBatchResult?.streamEvents ?? []) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.model-lab-page {
  min-height: calc(100vh - 48px);
  padding: 18px;
  color: var(--text-primary);
  background: #f7f8fb;
}

.lab-header,
.lab-panel,
.lab-error {
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
}

.lab-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
  margin-bottom: 14px;
}

.lab-header h1,
.section-title h2 {
  margin: 0;
  font-size: 1.28rem;
}

.lab-header p,
.eyebrow,
.muted,
small {
  margin: 0;
  color: var(--text-secondary);
}

.eyebrow {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
}

.top-grid,
.lab-grid {
  display: grid;
  gap: 14px;
  align-items: start;
}

.top-grid {
  grid-template-columns: minmax(320px, 0.95fr) minmax(520px, 1.05fr);
  margin-bottom: 14px;
}

.lab-grid {
  grid-template-columns: minmax(360px, 0.95fr) minmax(300px, 0.7fr) minmax(420px, 1fr);
}

.lab-panel {
  padding: 14px;
}

.section-title,
.lab-header-actions,
.template-row,
.preset-row,
.scan-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
}

.template-row,
.scan-row {
  align-items: flex-end;
}

.field-grid.two,
.choice-grid.two,
.result-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.choice-grid.four {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.compact-run-panel {
  align-self: stretch;
}

.compact-run-row {
  display: grid;
  grid-template-columns: minmax(140px, 0.7fr) minmax(140px, 1fr) minmax(160px, 1fr) auto;
  gap: 10px;
  align-items: end;
}

.run-status {
  margin: 8px 0 0;
  font-size: 0.8rem;
  font-weight: 800;
  color: #475569;
}

.run-status.ok {
  color: #166534;
}

.run-status.danger {
  color: #991b1b;
}

label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.15);
  border-radius: 6px;
  padding: 8px 9px;
  font: inherit;
  color: var(--text-primary);
  background: #fff;
}

textarea,
pre {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.5;
}

textarea {
  resize: vertical;
}

button {
  border: 1px solid rgba(15, 23, 42, 0.13);
  border-radius: 6px;
  padding: 8px 10px;
  font: inherit;
  font-weight: 700;
  color: var(--text-primary);
  background: #fff;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

button.active {
  border-color: #2563eb;
  color: #1d4ed8;
  background: #eff6ff;
}

.primary-button {
  border-color: #2563eb;
  color: #fff;
  background: #2563eb;
}

.primary-button.active {
  color: #fff;
  background: #1d4ed8;
}

.secondary-button {
  background: #fff;
}

.danger-button {
  border-color: #fecaca;
  color: #991b1b;
  background: #fff1f2;
}

.danger-button:disabled {
  color: #64748b;
  background: #f8fafc;
  border-color: rgba(15, 23, 42, 0.13);
}

.capability-row,
.metrics-grid,
.source-list,
.snapshot-strip {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
  font-size: 0.78rem;
}

.capability-row span,
.metrics-grid span,
.source-list span,
.snapshot-strip span {
  padding: 5px 8px;
  border-radius: 6px;
  color: #475569;
  background: #f1f5f9;
}

.snapshot-strip {
  margin-bottom: 10px;
}

.snapshot-strip strong {
  color: var(--text-primary);
}

.capability-row span.ok,
.status-pill.ok {
  color: #166534;
  background: #dcfce7;
}

.setting-group,
.param-list,
.prompt-panel,
.params-panel,
.preview-panel {
  display: grid;
  gap: 12px;
}

.setting-group {
  margin-top: 12px;
}

.setting-group h3,
.preview-panel h3,
.batch-detail h3,
.batch-detail h4 {
  margin: 0;
  font-size: 0.9rem;
}

.choice-card {
  min-height: 92px;
  padding: 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  background: #fff;
}

.choice-card.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.choice-card input {
  width: auto;
}

.choice-card span {
  line-height: 1.4;
  color: var(--text-secondary);
}

.preset-row {
  justify-content: flex-start;
  flex-wrap: wrap;
}

.preset-row button {
  padding: 7px 8px;
  font-size: 0.78rem;
}

.advanced-box {
  padding: 10px;
  border: 1px solid rgba(15, 23, 42, 0.09);
  border-radius: 8px;
  background: #fafafa;
}

.advanced-box summary {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: center;
  cursor: pointer;
  font-weight: 800;
}

.advanced-box summary small {
  font-weight: 700;
}

.advanced-box .param-list,
.tool-group-list {
  margin-top: 10px;
}

.tool-group-list,
.tool-list {
  display: grid;
  gap: 8px;
}

.tool-group {
  display: grid;
  gap: 7px;
}

.tool-group h3 {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: var(--text-primary);
}

.check-row {
  flex-direction: row;
  align-items: center;
  color: var(--text-primary);
}

.check-row input {
  width: auto;
}

.check-row span {
  line-height: 1.45;
}

.check-row em {
  margin-left: 5px;
  padding: 2px 5px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-style: normal;
  font-weight: 800;
  color: #92400e;
  background: #fef3c7;
}

.schema-toolbar {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  background: #f8fafc;
}

.schema-toolbar p {
  margin: 3px 0 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.segmented-control {
  display: flex;
  gap: 4px;
  padding: 3px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 8px;
  background: #fff;
}

.segmented-control button {
  border: 0;
  padding: 7px 9px;
}

.segmented-control button.active,
.tabs button.active {
  color: #1d4ed8;
  background: #eff6ff;
}

.message-preview {
  display: grid;
  gap: 10px;
}

.message-preview article {
  display: grid;
  gap: 6px;
}

pre {
  min-height: 180px;
  max-height: 420px;
  overflow: auto;
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  color: #e2e8f0;
  background: #111827;
  white-space: pre-wrap;
}

.request-json {
  min-height: 260px;
}

.result-panel,
.sweep-panel {
  margin-top: 14px;
}

.tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 12px 0;
}

.tabs button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 7px 9px;
}

.tab-count {
  min-width: 18px;
  padding: 1px 5px;
  border-radius: 999px;
  color: #1e3a8a;
  background: #dbeafe;
  font-size: 0.7rem;
  line-height: 1.3;
}

.tab-body pre {
  min-height: 300px;
}

.stream-detail {
  display: grid;
  gap: 10px;
}

.stream-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.stream-summary span {
  padding: 6px 8px;
  border-radius: 6px;
  color: var(--text-secondary);
  background: #f1f5f9;
  font-size: 0.78rem;
}

.stream-summary strong {
  color: var(--text-primary);
}

.empty-state {
  display: grid;
  gap: 6px;
  margin-top: 12px;
  padding: 18px;
  border: 1px dashed rgba(15, 23, 42, 0.18);
  border-radius: 8px;
  background: #f8fafc;
}

.empty-state h3,
.empty-state p {
  margin: 0;
}

.empty-state p {
  color: var(--text-secondary);
}

.status-pill {
  padding: 5px 9px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 800;
  color: #92400e;
  background: #fef3c7;
}

.lab-error,
.inline-error,
.warning-note {
  color: #991b1b;
  background: #fef2f2;
}

.lab-error {
  margin-bottom: 12px;
  padding: 10px 12px;
}

.lab-error.compact,
.inline-error,
.warning-note,
.notice-note {
  margin: 8px 0 0;
  padding: 8px;
  border-radius: 6px;
  font-size: 0.8rem;
}

.notice-note {
  color: #1d4ed8;
  background: #eff6ff;
}

.batch-grid {
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  gap: 12px;
  margin-top: 12px;
}

.batch-list {
  display: grid;
  gap: 8px;
  align-content: start;
}

.batch-list button {
  display: grid;
  gap: 4px;
  text-align: left;
}

.batch-list button.active {
  border-color: #2563eb;
  background: #eff6ff;
}

.batch-list button.danger {
  border-color: #f59e0b;
}

.batch-list span {
  font-size: 0.76rem;
  color: var(--text-secondary);
}

.batch-detail {
  display: grid;
  gap: 10px;
  min-width: 0;
}

@media (max-width: 1280px) {
  .top-grid,
  .lab-grid,
  .batch-grid {
    grid-template-columns: 1fr;
  }

  .choice-grid.four {
    grid-template-columns: 1fr 1fr;
  }

  .compact-run-row {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .lab-header,
  .section-title,
  .template-row,
  .scan-row,
  .schema-toolbar,
  .compact-run-row {
    align-items: stretch;
    flex-direction: column;
  }

  .field-grid.two,
  .choice-grid.two,
  .choice-grid.four,
  .result-columns,
  .compact-run-row {
    grid-template-columns: 1fr;
  }
}
</style>
