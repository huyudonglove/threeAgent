<script setup lang="ts">
// ModelConfigPage.vue - 模型连接与路由配置
// 改造目标：服务商连接 → 可用模型 → 使用场景 → 高级设置 的树形层级流程
// 从"数据表管理页面"改为"模型连接与路由配置页面"

import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import ConfirmDialog from '../components/ConfirmDialog.vue'

const router = useRouter()
const api = window.agentAPI

// ─── 类型 ───

interface ProviderInfo {
  id: string
  name: string
  apiBaseUrl: string
  type: string
  presetSource?: string
  apiKeyRef?: { type: string; store: string; key: string }
  enabled: boolean
  hasApiKey: boolean
}

interface ModelInfo {
  id: string
  providerId: string
  modelName: string
  displayName: string
  description?: string
  capabilities: string[]
  contextWindow: number | null
  enabled: boolean
}

interface HealthCheckInfo {
  ok: boolean
  status: 'healthy' | 'degraded' | 'failed' | 'ok' | 'error'
  latencyMs: number | null
  error: string | null
  checkedUrl?: string | null
  checkedAt?: string
}

interface BindingInfo {
  id: string
  role: string
  modelId: string
  providerId: string
  scope: string
  priority: number
  enabled: boolean
}

interface ConfigStatus {
  hasProvider: boolean
  hasModel: boolean
  hasBinding: boolean
  defaultProvider: string | null
  defaultModel: string | null
  defaultProviderName: string | null
  defaultModelName: string | null
}

/** 默认调用参数 */
interface DefaultCallParams {
  temperature: number
  top_p: number
  max_tokens: number
  stream: boolean
  timeout_ms: number
  retry_count: number
  reasoning_effort: string
  response_format: string
  tool_calling: boolean
}

// ─── 预设服务商 ───

interface PresetProvider {
  id: string
  name: string
  type: string
  apiBaseUrl: string
  icon: string
  providerProtocol?: string
  authMode?: string
  authHeaderName?: string
  chatCompletionsPath?: string
  modelsPath?: string
  supportsStreaming?: boolean
}

const fallbackPresetProviders: PresetProvider[] = [
  { id: 'openai', name: 'OpenAI', type: 'openai', apiBaseUrl: 'https://api.openai.com/v1', icon: '🤖' },
  { id: 'anthropic', name: 'Anthropic', type: 'anthropic', apiBaseUrl: 'https://api.anthropic.com', icon: '🧠' },
  { id: 'deepseek', name: 'DeepSeek', type: 'openai', apiBaseUrl: 'https://api.deepseek.com', icon: '🔍' },
  { id: 'mimo', name: 'MiMo', type: 'openai', apiBaseUrl: 'https://token-plan-cn.xiaomimimo.com/v1', icon: '🌐' },
  { id: 'custom', name: '自定义服务商', type: 'custom', apiBaseUrl: '', icon: '⚙️' },
]

/** 内置推荐模型 */
interface PresetModel {
  modelName: string
  displayName: string
  capabilities: string[]
  contextWindow: number | null
  description: string
}

const PRESET_MODELS: Record<string, PresetModel[]> = {
  openai: [
    { modelName: 'gpt-4o', displayName: 'GPT-4o', capabilities: ['chat', 'streaming', 'tool_call', 'vision', 'structured_output', 'long_context'], contextWindow: 128000, description: '旗舰多模态模型，适合通用任务和复杂推理' },
    { modelName: 'gpt-4o-mini', displayName: 'GPT-4o Mini', capabilities: ['chat', 'streaming', 'tool_call', 'vision', 'structured_output'], contextWindow: 128000, description: '轻量级多模态模型，适合高频简单任务' },
    { modelName: 'gpt-4-turbo', displayName: 'GPT-4 Turbo', capabilities: ['chat', 'streaming', 'tool_call', 'vision'], contextWindow: 128000, description: '高性能推理模型，适合复杂分析和编码' },
    { modelName: 'gpt-3.5-turbo', displayName: 'GPT-3.5 Turbo', capabilities: ['chat', 'streaming', 'tool_call'], contextWindow: 16385, description: '入门级对话模型，响应快速成本低' },
  ],
  anthropic: [
    { modelName: 'claude-sonnet-4-20250514', displayName: 'Claude Sonnet 4', capabilities: ['chat', 'streaming', 'tool_call', 'vision', 'reasoning', 'long_context'], contextWindow: 200000, description: '最新推理模型，平衡性能与速度' },
    { modelName: 'claude-3-5-sonnet-20241022', displayName: 'Claude 3.5 Sonnet', capabilities: ['chat', 'streaming', 'tool_call', 'vision', 'long_context'], contextWindow: 200000, description: '稳定推理模型，擅长代码和长文分析' },
    { modelName: 'claude-3-5-haiku-20241022', displayName: 'Claude 3.5 Haiku', capabilities: ['chat', 'streaming', 'tool_call'], contextWindow: 200000, description: '快速轻量模型，适合实时交互场景' },
  ],
  deepseek: [
    { modelName: 'deepseek-chat', displayName: 'DeepSeek Chat', capabilities: ['chat', 'streaming', 'tool_call', 'long_context'], contextWindow: 65536, description: '通用对话模型，性价比高' },
    { modelName: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner', capabilities: ['reasoning', 'streaming', 'long_context'], contextWindow: 65536, description: '深度推理模型，适合复杂逻辑和数学问题' },
  ],
  mimo: [
    { modelName: 'mimo-v2.5-pro', displayName: 'MiMo V2.5 Pro', capabilities: ['chat', 'streaming', 'tool_call', 'reasoning', 'long_context'], contextWindow: 1000000, description: 'MiMo 高质量推理与 Agent 任务模型' },
    { modelName: 'mimo-v2.5', displayName: 'MiMo V2.5', capabilities: ['chat', 'streaming', 'tool_call', 'reasoning', 'long_context'], contextWindow: 1000000, description: 'MiMo 通用长上下文对话模型' },
  ],
}

interface ProviderPresetDto {
  id: string
  name: string
  icon: string
  providerType: string
  providerProtocol: string
  defaultBaseUrl: string
  authMode?: string
  authHeaderName?: string
  chatCompletionsPath?: string
  modelsPath?: string
  supportsStreaming?: boolean
  recommendedModels: Array<{
    modelName: string
    displayName: string
    capabilities: string[]
    contextWindow: number | null
    supportsReasoning?: boolean
    supportsToolCall?: boolean
  }>
}

const presetProviders = ref<PresetProvider[]>(fallbackPresetProviders)
const presetModelsByProvider = ref<Record<string, PresetModel[]>>(PRESET_MODELS)

// ─── 全局状态 ───

const providers = ref<ProviderInfo[]>([])
const models = ref<ModelInfo[]>([])
const bindings = ref<BindingInfo[]>([])
const configStatus = ref<ConfigStatus | null>(null)
const defaultProviderId = ref<string | null>(null)
const defaultModelId = ref<string | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)

// ─── 模型配置 7 状态枚举（§15 规格） ───

type ModelConfigState =
  | 'no_provider'
  | 'provider_missing_key'
  | 'no_model'
  | 'no_default_model'
  | 'not_tested'
  | 'test_failed'
  | 'ready'

interface ConfigStateInfo {
  state: ModelConfigState
  canStartTask: boolean
  severity: 'blocked' | 'warning' | 'ready'
  message: string
  actionLabel: string
  actionTarget: string
}

const STATE_CONFIG: Record<ModelConfigState, Omit<ConfigStateInfo, 'state'>> = {
  no_provider: {
    canStartTask: false,
    severity: 'blocked',
    message: '尚未连接模型服务商',
    actionLabel: '连接服务商',
    actionTarget: '#providers',
  },
  provider_missing_key: {
    canStartTask: false,
    severity: 'blocked',
    message: '服务商缺少 API Key',
    actionLabel: '补充 API Key',
    actionTarget: '#providers',
  },
  no_model: {
    canStartTask: false,
    severity: 'blocked',
    message: '尚未选择可用模型',
    actionLabel: '选择模型',
    actionTarget: '#models',
  },
  no_default_model: {
    canStartTask: false,
    severity: 'blocked',
    message: '尚未选择默认模型',
    actionLabel: '设置默认模型',
    actionTarget: '#models',
  },
  not_tested: {
    canStartTask: true,
    severity: 'warning',
    message: '模型尚未测试',
    actionLabel: '测试模型',
    actionTarget: '#summary',
  },
  test_failed: {
    canStartTask: false,
    severity: 'warning',
    message: '模型调用测试失败',
    actionLabel: '查看失败原因',
    actionTarget: '#summary',
  },
  ready: {
    canStartTask: true,
    severity: 'ready',
    message: '模型配置可用',
    actionLabel: '配置',
    actionTarget: '',
  },
}

/** 默认服务商的 API Key Secret 是否存在于真实 secret store（§15.2.1） */
const defaultProviderSecretExists = ref<boolean | null>(null)

/** 通过真实 secret store 检查默认服务商 API Key 是否存在（§15.2.1） */
async function checkDefaultProviderSecret() {
  if (!defaultProviderId.value) {
    defaultProviderSecretExists.value = null
    return
  }
  const key = `provider-${defaultProviderId.value}-apiKey`
  try {
    const result = await api.getAppSecretPreview(key)
    // 返回 ok 且 data 非空表示 secret 存在（后端返回 '••••••••' 表示已存储）
    defaultProviderSecretExists.value = !!(result.ok && result.data)
  } catch {
    defaultProviderSecretExists.value = false
  }
}

/** 最近一次模型测试是否成功 */
const lastModelTestOk = computed(() => {
  if (!modelTestResult.value) return null
  const s = modelTestResult.value.status
  return s === 'ok' || s === 'healthy'
})

/** 按 §15.2 判断顺序计算模型配置状态（§15.2.2：仅检查默认服务商） */
const configStateInfo = computed<ConfigStateInfo>(() => {
  const enabledProviders = providers.value.filter(p => p.enabled !== false)

  // 1. 没有启用 provider → no_provider
  if (enabledProviders.length === 0) {
    return { state: 'no_provider', ...STATE_CONFIG.no_provider }
  }

  // 2. 默认服务商 API Key secret 不存在/为空 → provider_missing_key
  //    （§15.2.1：仅通过真实 secret store 判断，不用测试结果推断）
  //    （§15.2.2：只检查默认服务商，不阻塞非默认服务商缺 key）
  if (defaultProviderSecretExists.value === false) {
    return { state: 'provider_missing_key', ...STATE_CONFIG.provider_missing_key }
  }

  // 3. 有启用服务商但没有启用模型
  const enabledModels = models.value.filter(m => {
    const mp = providers.value.find(p => p.id === m.providerId)
    return m.enabled !== false && mp?.enabled !== false
  })
  if (enabledModels.length === 0) {
    return { state: 'no_model', ...STATE_CONFIG.no_model }
  }

  // 4. 没有 defaultModelId，或指向的模型不存在/被禁用
  const defaultModel = defaultModelId.value
    ? models.value.find(m => m.id === defaultModelId.value && m.enabled !== false)
    : undefined
  if (!defaultModel) {
    return { state: 'no_default_model', ...STATE_CONFIG.no_default_model }
  }

  // 5. 最近测试显式失败 → test_failed（仅当用户主动测试过且失败）
  if (lastModelTestOk.value === false) {
    return { state: 'test_failed', ...STATE_CONFIG.test_failed }
  }

  // 6. 一切正常 → ready（无测试记录不算阻塞，canStartTask=true）
  return { state: 'ready', ...STATE_CONFIG.ready }
})

const stateLabel = computed(() => {
  const labels: Record<ModelConfigState, string> = {
    no_provider: '未连接服务商',
    provider_missing_key: '缺少 API Key',
    no_model: '无可用模型',
    no_default_model: '未设默认模型',
    not_tested: '待测试',
    test_failed: '测试失败',
    ready: '已就绪',
  }
  return labels[configStateInfo.value.state]
})

const stateSeverity = computed(() => configStateInfo.value.severity)

/* 简化：是否有有效配置模块可展示 */
const hasConfigContent = computed(() => {
  return configStateInfo.value.state !== 'no_provider'
})

// ─── 向导状态 ───

const showWizard = ref(false)
const wizardStep = ref(1) // 1, 2, 3
const wizardBusy = ref(false)
const wizardError = ref<string | null>(null)

// Step 1: 选择服务商
const selectedPreset = ref<PresetProvider | null>(null)

// Step 2: 配置连接
const wizardApiKey = ref('')
const wizardBaseUrl = ref('')
const wizardProviderId = ref('') // 自动生成或自定义
const wizardProviderName = ref('')

// Step 3: 测试连接
const healthCheckResult = ref<HealthCheckInfo | null>(null)
const healthCheckBusy = ref(false)
const wizardComplete = ref(false) // 向导全部完成

// ─── 高级配置折叠状态 ───

const showAdvanced = ref(false)

// ─── 默认调用参数 ───

const defaultCallParams = ref<DefaultCallParams>({
  temperature: 0.7,
  top_p: 1,
  max_tokens: 4096,
  stream: true,
  timeout_ms: 30000,
  retry_count: 1,
  reasoning_effort: 'auto',
  response_format: 'json_object',
  tool_calling: false,
})

// ─── 每个模型的高级参数独立配置 ───

/** modelId → 自定义参数覆盖。未在此映射中的模型使用全局 defaultCallParams */
const perModelCallParams = ref<Record<string, DefaultCallParams>>({})

/** 当前正在编辑参数的模型 ID，null 表示未展开任何模型的参数面板 */
const editingModelParamsId = ref<string | null>(null)

/** 正在编辑中的参数副本（隔离操作，保存时才同步到 perModelCallParams） */
const editingParams = ref<DefaultCallParams>({ ...defaultCallParams.value })

/** 当前编辑的模型参数模式：'global' = 使用全局默认, 'custom' = 应用级自定义 */
const editingParamsMode = ref<'global' | 'custom'>('global')

// ─── max_tokens 预设下拉 ───

/** max_tokens 预设键：'short' | 'normal' | 'long' | 'max' | 'custom' */
const maxTokensPresetKey = ref<string>('normal')

/** 根据当前编辑模型计算最大可用输出上限（预留 4096 输入 token） */
function getMaxOutputForCurrentModel(): number {
  const model = models.value.find(m => m.id === editingModelParamsId.value)
  if (!model?.contextWindow) return 131072
  return Math.max(1024, Math.floor((model.contextWindow - 4096) * 0.8))
}

/** 初始化 max_tokens 预设键 */
function initMaxTokensPreset() {
  const val = editingParams.value.max_tokens
  const maxOut = getMaxOutputForCurrentModel()
  if (val === 1024) maxTokensPresetKey.value = 'short'
  else if (val === 4096) maxTokensPresetKey.value = 'normal'
  else if (val === 8192) maxTokensPresetKey.value = 'long'
  else if (val >= maxOut) maxTokensPresetKey.value = 'max'
  else maxTokensPresetKey.value = 'custom'
}

/** max_tokens 下拉切换事件 */
function onMaxTokensPresetChange(key: string) {
  maxTokensPresetKey.value = key
  const maxOut = getMaxOutputForCurrentModel()
  switch (key) {
    case 'short': editingParams.value.max_tokens = 1024; break
    case 'normal': editingParams.value.max_tokens = 4096; break
    case 'long': editingParams.value.max_tokens = 8192; break
    case 'max': editingParams.value.max_tokens = maxOut; break
    case 'custom': break
  }
}

/** 打开模型的高级参数编辑面板 */
function openModelParamsEditor(modelId: string) {
  if (editingModelParamsId.value === modelId) {
    // 再次点击同一个模型：关闭
    editingModelParamsId.value = null
    return
  }
  editingModelParamsId.value = modelId
  const existing = perModelCallParams.value[modelId]
  if (existing) {
    editingParamsMode.value = 'custom'
    editingParams.value = { ...existing }
  } else {
    editingParamsMode.value = 'global'
    editingParams.value = { ...defaultCallParams.value }
  }
  initMaxTokensPreset()
}

/** 切换参数模式 */
function switchModelParamsMode(mode: 'global' | 'custom') {
  editingParamsMode.value = mode
  if (mode === 'global') {
    editingParams.value = { ...defaultCallParams.value }
  }
}

/** 保存当前模型的自定义参数 */
function saveModelParams() {
  if (!editingModelParamsId.value) return
  if (editingParamsMode.value === 'custom') {
    perModelCallParams.value = {
      ...perModelCallParams.value,
      [editingModelParamsId.value]: { ...editingParams.value },
    }
  } else {
    // 使用全局默认 → 移除自定义覆盖
    const next = { ...perModelCallParams.value }
    delete next[editingModelParamsId.value]
    perModelCallParams.value = next
  }
  editingModelParamsId.value = null
}

/** 恢复为全局默认参数 */
function resetModelParams() {
  editingParams.value = { ...defaultCallParams.value }
  editingParamsMode.value = 'global'
  initMaxTokensPreset()
}

// ─── ConfirmDialog 状态 ───

interface ConfirmState {
  visible: boolean
  title: string
  message: string
  onConfirm: () => void
}

const confirmDialog = ref<ConfirmState>({
  visible: false,
  title: '',
  message: '',
  onConfirm: () => {},
})

function openConfirm(title: string, message: string, onConfirm: () => void) {
  confirmDialog.value = { visible: true, title, message, onConfirm }
}

// ─── 通知对话框状态 ───

const noticeDialog = ref<{ visible: boolean; title: string; message: string }>({
  visible: false,
  title: '',
  message: '',
})

function openNotice(title: string, message: string) {
  noticeDialog.value = { visible: true, title, message }
}

// ─── 使用场景映射 ───

/** 技术角色 → 使用场景中文名映射（5 个固定场景） */
const ROLE_SCENARIO_MAP: Record<string, { label: string; icon: string; description: string; roleKey: string }> = {
  product_manager: { label: '需求理解', icon: '📋', description: '理解用户输入，判断任务类型', roleKey: 'product_manager' },
  orchestrator: { label: '任务规划', icon: '🎯', description: '拆解任务步骤，决定执行路径', roleKey: 'orchestrator' },
  code: { label: '任务执行', icon: '💻', description: '执行具体操作，生成产出', roleKey: 'code' },
  tech_lead: { label: '结果检查', icon: '🔍', description: '检查结果质量和风险', roleKey: 'tech_lead' },
  project_manager: { label: '总结归档', icon: '📊', description: '总结任务结果，沉淀成果与记忆', roleKey: 'project_manager' },
}

/** 5 个固定使用场景列表（用于添加场景下拉） */
const CANONICAL_SCENARIOS = [
  { roleKey: 'product_manager', label: '需求理解', icon: '📋', description: '理解用户输入，判断任务类型' },
  { roleKey: 'orchestrator', label: '任务规划', icon: '🎯', description: '拆解任务步骤，决定执行路径' },
  { roleKey: 'code', label: '任务执行', icon: '💻', description: '执行具体操作，生成产出' },
  { roleKey: 'tech_lead', label: '结果检查', icon: '🔍', description: '检查结果质量和风险' },
  { roleKey: 'project_manager', label: '总结归档', icon: '📊', description: '总结任务结果，沉淀成果与记忆' },
]

/** 获取场景显示名 */
function getScenarioLabel(role: string): string {
  return ROLE_SCENARIO_MAP[role]?.label ?? role
}

// ─── 模型能力标签 ───

/** 模型能力选项（中文标签） */
const CAPABILITY_OPTIONS: { key: string; label: string }[] = [
  { key: 'chat', label: '普通对话' },
  { key: 'reasoning', label: '强推理' },
  { key: 'streaming', label: '流式输出' },
  { key: 'tool_call', label: '工具调用' },
  { key: 'long_context', label: '长上下文' },
  { key: 'vision', label: '视觉理解' },
  { key: 'structured_output', label: '结构化输出' },
]

/** 获取能力的中文标签 */
function getCapabilityLabel(key: string): string {
  return CAPABILITY_OPTIONS.find(c => c.key === key)?.label ?? key
}

function getScenarioIcon(role: string): string {
  return ROLE_SCENARIO_MAP[role]?.icon ?? '📌'
}

/** 获取绑定使用的模型名称 */
function getBindingModelName(binding: BindingInfo): string {
  const model = models.value.find(m => m.id === binding.modelId)
  return model?.displayName ?? binding.modelId
}

/** 获取绑定使用的服务商名称 */
function getBindingProviderName(binding: BindingInfo): string {
  const provider = providers.value.find(p => p.id === binding.providerId)
  return provider?.name ?? binding.providerId
}

// ─── 导入/导出 & JSON 预览 ───

/** 生成可导出的配置 JSON（不含 API Key） */
const exportableConfig = computed(() => {
  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    defaultProviderId: defaultProviderId.value,
    defaultModelId: defaultModelId.value,
    providers: providers.value.map(p => ({
      id: p.id,
      name: p.name,
      apiBaseUrl: p.apiBaseUrl,
      type: p.type,
      enabled: p.enabled,
    })),
    models: models.value.map(m => ({
      id: m.id,
      providerId: m.providerId,
      modelName: m.modelName,
      displayName: m.displayName,
      capabilities: m.capabilities,
      contextWindow: m.contextWindow,
      enabled: m.enabled,
    })),
    bindings: bindings.value.map(b => ({
      role: b.role,
      modelId: b.modelId,
      providerId: b.providerId,
      priority: b.priority,
      enabled: b.enabled,
    })),
    defaultCallParams: { ...defaultCallParams.value },
    perModelCallParams: { ...perModelCallParams.value },
  }
})

const rawConfigJson = computed(() => {
  return JSON.stringify(exportableConfig.value, null, 2)
})

const showJsonPreview = ref(false)

// ─── 远端模型同步 ───

const syncingProviderId = ref<string | null>(null)
const addingPresetModelKey = ref<string | null>(null)

// ─── 模型调用测试 ───

const modelTestBusy = ref(false)
const modelTestResult = ref<HealthCheckInfo | null>(null)

async function runModelTest() {
  if (!defaultModelId.value || !defaultProviderId.value) {
    openNotice('无法测试', '请先配置默认服务商和默认模型。')
    return
  }
  modelTestBusy.value = true
  modelTestResult.value = null
  try {
    // 使用 healthCheck 测试服务商连通性，加上模型信息
    const result = await api.healthCheckApp(defaultProviderId.value)

    if (result.ok && result.data) {
      const hcData = result.data
      const model = models.value.find(m => m.id === defaultModelId.value)
      modelTestResult.value = {
        ...hcData,
        status: hcData.status ?? (hcData.ok ? 'ok' : 'error'),
        latencyMs: hcData.latencyMs ?? null,
        error: hcData.ok
          ? null
          : (hcData.error || `${model?.displayName ?? defaultModelId.value} 调用失败：请检查模型名、API Key 和网络连接。`),
      }
    } else {
      modelTestResult.value = {
        ok: false,
        status: 'error',
        latencyMs: null,
        error: result?.error?.message ?? '模型调用测试失败，请检查模型名是否有效、API Key 是否正确。',
      }
    }
  } catch (e) {
    modelTestResult.value = {
      ok: false,
      status: 'error',
      latencyMs: null,
      error: `测试异常: ${e instanceof Error ? e.message : String(e)}`,
    }
  } finally {
    modelTestBusy.value = false
  }
}

async function syncRemoteModels(providerId: string) {
  syncingProviderId.value = providerId
  try {
    const result = await api.listModelCandidates?.(providerId)
    if (result?.ok && result.data) {
      const candidates = result.data as unknown[]
      if (candidates.length > 0) {
        openNotice('同步结果', `从远端获取到 ${candidates.length} 个模型，已合并到可用模型列表。`)
        await loadConfig()
      } else {
        openNotice('同步结果', '远端未返回任何模型，请检查 API Key 和接口地址。当前可使用内置推荐模型。')
      }
    } else {
      openNotice('同步失败', result?.error?.message || '无法连接到远端获取模型列表。当前可使用内置推荐模型。')
    }
  } catch (e) {
    openNotice('同步失败', `请求异常: ${e instanceof Error ? e.message : String(e)}。当前可使用内置推荐模型。`)
  } finally {
    syncingProviderId.value = null
  }
}

function handleExportConfig() {
  const json = rawConfigJson.value
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `model-config-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

const importFileInput = ref<HTMLInputElement | null>(null)

function triggerImport() {
  importFileInput.value?.click()
}

async function handleImportConfig(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const imported = JSON.parse(text)

    // 基本校验
    if (!imported.version || !imported.providers || !imported.models) {
      openNotice('导入失败', '配置文件格式不正确，缺少必要字段 (version/providers/models)。')
      return
    }

    // 导入服务商（不含 API Key，用户需手动填入）
    const missingProviders: string[] = []
    for (const p of imported.providers) {
      const existing = providers.value.find(ep => ep.id === p.id)
      if (existing) continue
      missingProviders.push(p.name || p.id)
    }

    let msg = `配置文件包含 ${imported.providers.length} 个服务商、${imported.models.length} 个模型、${imported.bindings?.length ?? 0} 个场景。`
    if (missingProviders.length > 0) {
      msg += `\n\n⚠️ 以下服务商在本机未配置，需手动连接：\n${missingProviders.join('、')}`
    }
    msg += '\n\n注意：API Key 不会随配置导出，导入后需手动填入密钥。'
    msg += '\n\n当前版本仅支持 JSON 校验预览，自动导入功能将在后续版本完善。'

    openNotice('导入预览', msg)
  } catch (e) {
    openNotice('导入失败', `无法解析配置文件：${e instanceof Error ? e.message : String(e)}`)
  } finally {
    // 重置 input 以允许重复选择同一文件
    if (target) target.value = ''
  }
}

// ─── 使用场景编辑状态 ───

const editingScenarioRole = ref<string | null>(null)
const showAddScenario = ref(false)
const scenarioBinding = ref({
  id: '',
  role: '',
  modelId: '',
  providerId: '',
  scope: 'global' as string,
})

// 可选的预定义场景角色（不在已有 binding 中的）
const availableScenarioRoles = computed(() => {
  const usedRoles = new Set(bindings.value.map(b => b.role))
  return CANONICAL_SCENARIOS.filter(s => !usedRoles.has(s.roleKey))
})

const showAddProvider = ref(false)
const editingProviderId = ref<string | null>(null)
const newProvider = ref({
  id: '',
  name: '',
  apiBaseUrl: '',
  type: 'openai' as string,
  apiKey: '',
})

const showAddModel = ref(false)
const editingModelId = ref<string | null>(null)
const newModel = ref({
  id: '',
  providerId: '',
  modelName: '',
  displayName: '',
  description: '',
  capabilities: [] as string[],
  contextWindow: 128000,
})

// ─── 计算属性 ───

/** 当前选中服务商下的模型列表 */
const wizardModels = computed(() => {
  if (!wizardProviderId.value) return []
  return models.value.filter(m => m.providerId === wizardProviderId.value)
})

/** 内置推荐模型（按当前 selectedPreset） */
const wizardPresetModels = computed(() => {
  if (!selectedPreset.value || selectedPreset.value.id === 'custom') return []
  return presetModelsByProvider.value[selectedPreset.value.id] ?? []
})

/** 已经通过内置推荐添加过的模型 modelName 集合 */
const addedPresetModelNames = computed(() => {
  if (!wizardProviderId.value) return new Set<string>()
  return new Set(wizardModels.value.map(m => m.modelName))
})

const stepLabels = ['选择服务商', '配置连接', '选择模型并测试']

function getProviderPresetId(provider: ProviderInfo): string | null {
  if (provider.presetSource && presetModelsByProvider.value[provider.presetSource]) {
    return provider.presetSource
  }

  const normalizedProviderId = provider.id.replace(/^provider-/, '')
  if (presetModelsByProvider.value[normalizedProviderId]) {
    return normalizedProviderId
  }

  const matchedPreset = presetProviders.value.find((preset) => {
    if (preset.id === 'custom') return false
    return preset.type === provider.type && preset.apiBaseUrl === provider.apiBaseUrl
  })

  return matchedPreset?.id ?? null
}

function getProviderModels(providerId: string): ModelInfo[] {
  return models.value.filter(model => model.providerId === providerId)
}

function getProviderPresetModels(provider: ProviderInfo): PresetModel[] {
  const presetId = getProviderPresetId(provider)
  return presetId ? (presetModelsByProvider.value[presetId] ?? []) : []
}

function getMissingProviderPresetModels(provider: ProviderInfo): PresetModel[] {
  const configuredModelNames = new Set(getProviderModels(provider.id).map(model => model.modelName))
  return getProviderPresetModels(provider).filter(model => !configuredModelNames.has(model.modelName))
}

function toSafeIdPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function buildModelId(providerId: string, modelName: string): string {
  const safeProvider = toSafeIdPart(providerId) || 'provider'
  const safeModel = toSafeIdPart(modelName) || `model-${Date.now()}`
  return `model-${safeProvider}-${safeModel}`
}

function formatApiError(prefix: string, apiError?: { message?: string } | null): string {
  return `${prefix}: ${apiError?.message || '未知错误，请检查配置后重试'}`
}

function resetProviderForm() {
  editingProviderId.value = null
  showAddProvider.value = false
  newProvider.value = { id: '', name: '', apiBaseUrl: '', type: 'openai', apiKey: '' }
}

function startAddProvider() {
  editingProviderId.value = null
  newProvider.value = { id: '', name: '', apiBaseUrl: '', type: 'openai', apiKey: '' }
  showAddProvider.value = true
}

function startEditProvider(provider: ProviderInfo) {
  editingProviderId.value = provider.id
  newProvider.value = {
    id: provider.id,
    name: provider.name,
    apiBaseUrl: provider.apiBaseUrl,
    type: provider.type,
    apiKey: '',
  }
  showAddProvider.value = true
  showAdvanced.value = true
  error.value = null
}

function resetModelForm() {
  editingModelId.value = null
  showAddModel.value = false
  newModel.value = { id: '', providerId: '', modelName: '', displayName: '', description: '', capabilities: ['chat'], contextWindow: 128000 }
}

function syncNewModelId() {
  if (editingModelId.value) return
  if (!newModel.value.providerId || !newModel.value.modelName) return
  newModel.value.id = buildModelId(newModel.value.providerId, newModel.value.modelName)
  if (!newModel.value.displayName) {
    newModel.value.displayName = newModel.value.modelName
  }
}

function startAddModel() {
  editingModelId.value = null
  newModel.value = { id: '', providerId: '', modelName: '', displayName: '', description: '', capabilities: ['chat'], contextWindow: 128000 }
  showAddModel.value = true
  showAdvanced.value = true
}

function startEditModel(model: ModelInfo) {
  editingModelId.value = model.id
  newModel.value = {
    id: model.id,
    providerId: model.providerId,
    modelName: model.modelName,
    displayName: model.displayName,
    description: model.description ?? '',
    capabilities: [...model.capabilities],
    contextWindow: model.contextWindow ?? 128000,
  }
  showAddModel.value = true
  showAdvanced.value = true
  error.value = null
}

// ─── 数据加载 ───

function mapPresetModel(model: ProviderPresetDto['recommendedModels'][number]): PresetModel {
  const capabilities = new Set(model.capabilities)
  capabilities.add('streaming')
  if (model.supportsToolCall) capabilities.add('tool_call')
  if (model.supportsReasoning) capabilities.add('reasoning')
  if ((model.contextWindow ?? 0) >= 128000) capabilities.add('long_context')

  return {
    modelName: model.modelName,
    displayName: model.displayName,
    capabilities: [...capabilities],
    contextWindow: model.contextWindow,
    description: model.supportsReasoning
      ? '内置推荐推理模型'
      : '内置推荐模型',
  }
}

async function loadPresets() {
  try {
    const result = await api.listPresets?.()
    if (!result?.ok || !result.data) return

    const presets = result.data as ProviderPresetDto[]
    const customPreset = fallbackPresetProviders.find(p => p.id === 'custom')
    presetProviders.value = [
      ...presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        type: preset.providerType,
        apiBaseUrl: preset.defaultBaseUrl,
        icon: preset.icon,
        providerProtocol: preset.providerProtocol,
        authMode: preset.authMode,
        authHeaderName: preset.authHeaderName,
        chatCompletionsPath: preset.chatCompletionsPath,
        modelsPath: preset.modelsPath,
        supportsStreaming: preset.supportsStreaming,
      })),
      ...(customPreset ? [customPreset] : []),
    ]

    presetModelsByProvider.value = Object.fromEntries(
      presets.map((preset) => [
        preset.id,
        preset.recommendedModels.map(mapPresetModel),
      ]),
    )
  } catch (e) {
    console.warn('Failed to load provider presets, using fallback presets', e)
  }
}

async function loadConfig() {
  loading.value = true
  error.value = null
  try {
    const [configResult, statusResult] = await Promise.all([
      api.readAppModelConfig(),
      api.getAppModelConfigStatus(),
    ])

    if (configResult.ok && configResult.data) {
      const data = configResult.data as { providers: ProviderInfo[]; models: ModelInfo[]; bindings: BindingInfo[]; defaultProviderId?: string; defaultModelId?: string }
      providers.value = data.providers ?? []
      models.value = data.models ?? []
      bindings.value = data.bindings ?? []
      // 从应用级配置中获取默认设置
      defaultProviderId.value = data.defaultProviderId ?? null
      defaultModelId.value = data.defaultModelId ?? null
    }

    if (statusResult.ok && statusResult.data) {
      configStatus.value = statusResult.data as ConfigStatus
      // 优先使用配置文件中的默认设置，回退到状态接口
      if (!defaultProviderId.value) {
        defaultProviderId.value = configStatus.value.defaultProvider
      }
      if (!defaultModelId.value) {
        defaultModelId.value = configStatus.value.defaultModel
      }
    }

    // §15.2.1: 通过真实 secret store 检查默认服务商 API Key
    await checkDefaultProviderSecret()
  } catch (e) {
    error.value = `加载配置失败: ${e}`
  } finally {
    loading.value = false
  }
}

// ─── 向导操作 ───

function startWizard() {
  wizardStep.value = 1
  selectedPreset.value = null
  wizardApiKey.value = ''
  wizardBaseUrl.value = ''
  wizardProviderId.value = ''
  wizardProviderName.value = ''
  healthCheckResult.value = null
  healthCheckBusy.value = false
  wizardComplete.value = false
  wizardError.value = null
  showWizard.value = true
}

function selectPreset(preset: PresetProvider) {
  selectedPreset.value = preset
  wizardBaseUrl.value = preset.apiBaseUrl
  wizardProviderName.value = preset.name
  if (preset.id !== 'custom') {
    wizardProviderId.value = `provider-${preset.id}`
  } else {
    wizardProviderId.value = ''
  }
  wizardStep.value = 2
}

function goBackToStep(step: number) {
  wizardStep.value = step
  wizardError.value = null
  if (step === 1) {
    selectedPreset.value = null
    wizardApiKey.value = ''
    wizardBaseUrl.value = ''
  }
  if (step <= 2) {
    healthCheckResult.value = null
    wizardComplete.value = false
  }
}

/** Step 2: 保存服务商 + API Key */
async function saveConnection() {
  wizardBusy.value = true
  wizardError.value = null
  try {
    const preset = selectedPreset.value!
    const providerId = wizardProviderId.value || `provider-custom-${Date.now()}`
    const providerName = wizardProviderName.value || '自定义服务商'
    const baseUrl = wizardBaseUrl.value || ''

    if (!wizardApiKey.value.trim()) {
      wizardError.value = '请输入 API Key'
      return
    }

    // 检查是否已有同名 provider
    const existing = providers.value.find(p => p.id === providerId)
    if (existing) {
      const secretResult = await api.setAppSecret(`provider-${providerId}-apiKey`, wizardApiKey.value)
      if (!secretResult.ok) {
        wizardError.value = formatApiError('保存 API Key 失败', secretResult.error)
        return
      }
      if (baseUrl) {
        const updateResult = await api.updateAppProvider(providerId, { apiBaseUrl: baseUrl })
        if (!updateResult.ok) {
          wizardError.value = formatApiError('更新服务商失败', updateResult.error)
          return
        }
      }
    } else {
      const addResult = await api.addAppProvider({
        id: providerId,
        name: providerName,
        apiBaseUrl: baseUrl,
        type: preset.type,
        providerProtocol: preset.providerProtocol,
        authMode: preset.authMode,
        authHeaderName: preset.authHeaderName,
        chatCompletionsPath: preset.chatCompletionsPath,
        modelsPath: preset.modelsPath,
        supportsStreaming: preset.supportsStreaming,
        presetSource: preset.id === 'custom' ? 'custom' : preset.id,
        apiKeyRef: { type: 'secretRef', store: 'secrets', key: `provider-${providerId}-apiKey` },
        enabled: true,
      })

      if (!addResult.ok) {
        wizardError.value = formatApiError('添加服务商失败', addResult.error)
        return
      }

      const secretResult = await api.setAppSecret(`provider-${providerId}-apiKey`, wizardApiKey.value)
      if (!secretResult.ok) {
        wizardError.value = formatApiError('保存 API Key 失败', secretResult.error)
        return
      }
    }

    const setDefaultResult = await api.setAppDefaultProvider(providerId)
    if (!setDefaultResult.ok) {
      wizardError.value = formatApiError('设置默认服务商失败', setDefaultResult.error)
      return
    }

    defaultProviderId.value = providerId
    wizardProviderId.value = providerId

    await loadConfig()
    wizardStep.value = 3
  } catch (e) {
    wizardError.value = `保存失败: ${e instanceof Error ? e.message : String(e)}`
  } finally {
    wizardBusy.value = false
  }
}

/** Step 3: 设为默认模型 */
async function setWizardDefaultModel(modelId: string) {
  wizardBusy.value = true
  wizardError.value = null
  try {
    const result = await api.setAppDefaultModel(modelId)
    if (result.ok) {
      defaultModelId.value = modelId
      await loadConfig()
    } else {
      wizardError.value = `设置默认模型失败: ${result.error?.message}`
    }
  } catch (e) {
    wizardError.value = `设置失败: ${e}`
  } finally {
    wizardBusy.value = false
  }
}

async function addRecommendedModelToProvider(providerId: string, presetModel: PresetModel, mode: 'wizard' | 'provider' = 'provider') {
  const busyKey = `${providerId}:${presetModel.modelName}`
  if (addingPresetModelKey.value) return

  addingPresetModelKey.value = busyKey
  if (mode === 'wizard') {
    wizardBusy.value = true
    wizardError.value = null
  } else {
    error.value = null
  }

  try {
    const modelId = buildModelId(providerId, presetModel.modelName)
    const result = await api.addAppModel({
      id: modelId,
      providerId,
      modelName: presetModel.modelName,
      displayName: presetModel.displayName,
      description: presetModel.description,
      capabilities: [...presetModel.capabilities],
      contextWindow: presetModel.contextWindow,
      enabled: true,
    })
    if (result.ok) {
      await loadConfig()
      const updatedModels = models.value.filter(m => m.providerId === providerId)
      if (updatedModels.length === 1) {
        await api.setAppDefaultModel(modelId)
        defaultModelId.value = modelId
        await loadConfig()
      }
    } else {
      const message = formatApiError('添加推荐模型失败', result.error)
      if (mode === 'wizard') wizardError.value = message
      else error.value = message
    }
  } catch (e) {
    const message = `添加失败: ${e}`
    if (mode === 'wizard') wizardError.value = message
    else error.value = message
  } finally {
    addingPresetModelKey.value = null
    if (mode === 'wizard') {
      wizardBusy.value = false
    }
  }
}

/** Step 3: 一键添加内置推荐模型 */
async function addPresetModel(presetModel: PresetModel) {
  await addRecommendedModelToProvider(wizardProviderId.value, presetModel, 'wizard')
}

/** Step 3: 测试连接 */
async function runWizardHealthCheck() {
  healthCheckBusy.value = true
  healthCheckResult.value = null
  try {
    const providerId = wizardProviderId.value || defaultProviderId.value
    if (!providerId) return
    const result = await api.healthCheckApp(providerId)
    if (result.ok && result.data) {
      const hcData = result.data
      healthCheckResult.value = {
        ...hcData,
        status: hcData.status ?? (hcData.ok ? 'ok' : 'error'),
        latencyMs: hcData.latencyMs ?? null,
        error: hcData.ok ? null : (hcData.error || '连接失败，请检查 API Key、接口地址和认证方式。'),
      }
      if (hcData.ok) {
        wizardComplete.value = true
      }
    } else {
      healthCheckResult.value = { ok: false, status: 'error', latencyMs: null, error: result.error?.message ?? '未知错误' }
    }
  } catch (e) {
    healthCheckResult.value = { ok: false, status: 'error', latencyMs: null, error: String(e) }
  } finally {
    healthCheckBusy.value = false
  }
}

function finishWizard() {
  showWizard.value = false
  loadConfig()
}

// ─── 高级配置：Provider 操作 ───

async function addProviderSubmit() {
  const p = newProvider.value
  const providerInput = {
    id: p.id,
    name: p.name,
    apiBaseUrl: p.apiBaseUrl,
    type: p.type,
    apiKeyRef: { type: 'secretRef', store: 'secrets', key: `provider-${p.id}-apiKey` },
    enabled: true,
  }
  const result = editingProviderId.value
    ? await api.updateAppProvider(editingProviderId.value, {
      name: p.name,
      apiBaseUrl: p.apiBaseUrl,
      type: p.type,
      apiKeyRef: providerInput.apiKeyRef,
    })
    : await api.addAppProvider(providerInput)

  if (result.ok) {
    if (p.apiKey) {
      const secretResult = await api.setAppSecret(`provider-${p.id}-apiKey`, p.apiKey)
      if (!secretResult.ok) {
        error.value = formatApiError('API Key 保存失败', secretResult.error)
        return
      }
    }
    resetProviderForm()
    await loadConfig()
  } else {
    error.value = formatApiError(editingProviderId.value ? '更新服务商失败' : '添加服务商失败', result.error)
  }
}

async function toggleProvider(providerId: string, enabled: boolean) {
  await api.updateAppProvider(providerId, { enabled })
  await loadConfig()
}

async function removeProvider(providerId: string) {
  openConfirm(
    '删除服务商',
    `确认删除服务商「${providerId}」？此操作不可撤销。`,
    async () => {
      await api.deleteAppProvider(providerId)
      if (defaultProviderId.value === providerId) {
        defaultProviderId.value = null
      }
      await loadConfig()
    },
  )
}

async function setAsDefaultProvider(providerId: string) {
  const result = await api.setAppDefaultProvider(providerId)
  if (result.ok) {
    defaultProviderId.value = providerId
    await loadConfig()
  } else {
    error.value = `设置默认服务商失败: ${result.error?.message}`
  }
}

// ─── 高级配置：Model 操作 ───

async function addModelSubmit() {
  const m = newModel.value
  const modelId = editingModelId.value || m.id || buildModelId(m.providerId, m.modelName)
  const modelInput = {
    id: modelId,
    providerId: m.providerId,
    modelName: m.modelName,
    displayName: m.displayName || m.modelName,
    description: m.description || undefined,
    capabilities: [...m.capabilities],
    contextWindow: m.contextWindow || null,
    enabled: true,
  }
  const result = editingModelId.value
    ? await api.updateAppModel(editingModelId.value, {
      providerId: m.providerId,
      modelName: m.modelName,
      displayName: m.displayName,
      description: modelInput.description,
      capabilities: modelInput.capabilities,
      contextWindow: modelInput.contextWindow,
    })
    : await api.addAppModel(modelInput)

  if (result.ok) {
    resetModelForm()
    await loadConfig()
  } else {
    error.value = formatApiError(editingModelId.value ? '更新模型失败' : '添加模型失败', result.error)
  }
}

async function removeModel(modelId: string) {
  openConfirm(
    '删除模型',
    `确认删除模型「${modelId}」？此操作不可撤销。`,
    async () => {
      await api.deleteAppModel(modelId)
      if (defaultModelId.value === modelId) {
        defaultModelId.value = null
      }
      await loadConfig()
    },
  )
}

async function setAsDefaultModel(modelId: string) {
  const result = await api.setAppDefaultModel(modelId)
  if (result.ok) {
    defaultModelId.value = modelId
    await loadConfig()
  } else {
    error.value = `设置默认模型失败: ${result.error?.message}`
  }
}

// ─── 使用场景模型配置操作 ───

function startEditScenario(binding: BindingInfo) {
  editingScenarioRole.value = binding.role
  scenarioBinding.value = {
    id: binding.id,
    role: binding.role,
    modelId: binding.modelId,
    providerId: binding.providerId,
    scope: binding.scope,
  }
}

function startAddScenario() {
  editingScenarioRole.value = null
  scenarioBinding.value = {
    id: '',
    role: '',
    modelId: '',
    providerId: '',
    scope: 'global',
  }
  showAddScenario.value = true
}

function cancelScenarioEdit() {
  editingScenarioRole.value = null
  showAddScenario.value = false
  scenarioBinding.value = { id: '', role: '', modelId: '', providerId: '', scope: 'global' }
}

/** 当选择模型时自动填充对应的 providerId */
function onScenarioModelSelect() {
  const model = models.value.find(m => m.id === scenarioBinding.value.modelId)
  if (model) {
    scenarioBinding.value.providerId = model.providerId
  }
}

async function saveScenarioBinding() {
  const b = scenarioBinding.value
  if (!b.role || !b.modelId || !b.providerId) {
    error.value = '请填写完整的场景信息：角色、模型和服务商'
    return
  }

  const isEdit = !!editingScenarioRole.value
  if (isEdit) {
    // 更新已有 binding
    const existing = bindings.value.find(bind => bind.role === editingScenarioRole.value)
    if (existing) {
      const result = await api.updateAppBinding(existing.id, {
        modelId: b.modelId,
        providerId: b.providerId,
      })
      if (!result.ok) {
        error.value = formatApiError('更新场景配置失败', result.error)
        return
      }
    }
  } else {
    // 新增 binding
    const result = await api.addAppBinding({
      id: `binding-${b.role}-${Date.now()}`,
      role: b.role,
      modelId: b.modelId,
      providerId: b.providerId,
      scope: b.scope,
      priority: 0,
      enabled: true,
    })
    if (!result.ok) {
      error.value = formatApiError('添加场景配置失败', result.error)
      return
    }
  }

  cancelScenarioEdit()
  await loadConfig()
}

async function removeScenarioBinding(binding: BindingInfo) {
  const label = getScenarioLabel(binding.role)
  openConfirm(
    '移除场景配置',
    `确认移除「${label}」场景的模型配置？`,
    async () => {
      await api.deleteAppBinding(binding.id)
      await loadConfig()
    },
  )
}

// ─── 高级配置：Health Check ───

async function runHealthCheck(providerId: string) {
  const result = await api.healthCheckApp(providerId)
  if (result.ok && result.data) {
    const hcData = result.data
    const msg = [
      `状态: ${hcData.ok ? '正常' : '失败'}`,
      hcData.latencyMs ? `耗时: ${hcData.latencyMs}ms` : null,
      hcData.checkedUrl ? `检查地址: ${hcData.checkedUrl}` : null,
      !hcData.ok ? `错误: ${hcData.error || '连接失败，请检查 API Key、接口地址和认证方式。'}` : null,
    ].filter(Boolean).join('\n')
    openNotice('连接测试结果', msg)
  } else {
    openNotice('连接测试失败', result.error?.message ?? '未知错误')
  }
}

// ─── 初始化 ───

onMounted(async () => {
  await loadPresets()
  await loadConfig()
})
</script>

<template>
  <ConfirmDialog
    v-model:visible="confirmDialog.visible"
    :title="confirmDialog.title"
    :message="confirmDialog.message"
    confirm-text="确认删除"
    :danger="true"
    @confirm="confirmDialog.onConfirm()"
  />

  <ConfirmDialog
    v-model:visible="noticeDialog.visible"
    :title="noticeDialog.title"
    :message="noticeDialog.message"
    confirm-text="知道了"
    cancel-text="关闭"
    :danger="false"
  />

  <div class="model-config-page">
    <!-- ═══════════════════════════════════════════════ -->
    <!-- 向导模式 -->
    <!-- ═══════════════════════════════════════════════ -->
    <template v-if="showWizard">
      <header class="page-header glass-panel">
        <div>
          <p class="eyebrow">模型配置向导</p>
          <h1>快速配置模型</h1>
          <p>3 步完成最小配置，开始使用 AI 助手</p>
        </div>
      </header>

      <!-- 进度指示器 -->
      <div class="wizard-progress glass-panel">
        <div
          v-for="(label, idx) in stepLabels"
          :key="idx"
          class="progress-step"
          :class="{
            'is-active': wizardStep === idx + 1,
            'is-done': wizardStep > idx + 1,
          }"
        >
          <span class="step-number">{{ idx + 1 }}</span>
          <span class="step-label">{{ label }}</span>
        </div>
      </div>

      <!-- 错误提示 -->
      <div v-if="wizardError" class="error-banner">
        <p>{{ wizardError }}</p>
        <button type="button" @click="wizardError = null">✕</button>
      </div>

      <!-- ── Step 1: 选择服务商 ── -->
      <section v-if="wizardStep === 1" class="wizard-step glass-panel">
        <h2>选择 AI 服务商</h2>
        <p class="step-desc">选择你使用的 AI 服务提供商，选择后将配置连接信息。</p>
        <div class="provider-grid">
          <button
            v-for="preset in presetProviders"
            :key="preset.id"
            class="provider-card select-card"
            :class="{ 'is-active': selectedPreset?.id === preset.id }"
            @click="selectPreset(preset)"
          >
            <span class="provider-icon">{{ preset.icon }}</span>
            <strong>{{ preset.name }}</strong>
            <p v-if="preset.apiBaseUrl" class="provider-url">{{ preset.apiBaseUrl }}</p>
          </button>
        </div>
      </section>

      <!-- ── Step 2: 配置连接 ── -->
      <section v-if="wizardStep === 2" class="wizard-step glass-panel">
        <div class="step-header">
          <button class="back-btn" type="button" @click="goBackToStep(1)">← 返回</button>
          <h2>配置连接信息</h2>
        </div>
        <p class="step-desc">为「{{ selectedPreset?.name }}」填写 API 密钥和接口地址。</p>

        <div class="wizard-form">
          <div class="form-row">
            <label>API Key <span class="required">*</span></label>
            <input v-model="wizardApiKey" type="password" placeholder="sk-..." />
            <p class="form-hint">密钥将安全存储，不会明文出现在配置文件中。</p>
          </div>
          <div class="form-row">
            <label>接口地址 (Base URL)</label>
            <input v-model="wizardBaseUrl" :placeholder="selectedPreset?.apiBaseUrl || 'https://api.example.com/v1'" />
            <p class="form-hint">{{ selectedPreset?.id !== 'custom' ? '已填入默认地址，通常无需修改。' : '请输入服务商的 API 接口地址。' }}</p>
          </div>
          <div v-if="selectedPreset?.id === 'custom'" class="form-row">
            <label>服务商名称</label>
            <input v-model="wizardProviderName" placeholder="我的服务商" />
          </div>
          <div v-if="selectedPreset?.id === 'custom'" class="form-row">
            <label>服务商 ID</label>
            <input v-model="wizardProviderId" placeholder="my-provider" />
          </div>
          <div class="wizard-actions">
            <button
              class="primary-button"
              type="button"
              :disabled="wizardBusy || !wizardApiKey.trim()"
              @click="saveConnection"
            >
              {{ wizardBusy ? '保存中...' : '保存并继续' }}
            </button>
          </div>
        </div>
      </section>

      <!-- ── Step 3: 选择模型并测试 ── -->
      <section v-if="wizardStep === 3" class="wizard-step glass-panel">
        <div class="step-header">
          <button class="back-btn" type="button" @click="goBackToStep(2)">← 返回</button>
          <h2>选择模型并测试</h2>
        </div>
        <p class="step-desc">选择默认使用的模型，并测试与服务商的连接。</p>

        <!-- 内置推荐模型区域（预设服务商） -->
        <div v-if="wizardPresetModels.length > 0" class="preset-models-section">
          <p class="subsection-hint">📦 推荐模型 — 点击即可添加到当前服务商</p>
          <div class="preset-model-list">
            <div
              v-for="pm in wizardPresetModels"
              :key="pm.modelName"
              class="preset-model-card"
              :class="{ 'is-added': addedPresetModelNames.has(pm.modelName) }"
            >
              <div class="preset-model-head">
                <strong>{{ pm.displayName }}</strong>
                <span v-if="pm.modelName" class="preset-model-api-name">{{ pm.modelName }}</span>
              </div>
              <p class="preset-model-desc">{{ pm.description }}</p>
              <div class="preset-model-caps">
                <span v-for="cap in pm.capabilities" :key="cap" class="cap-tag">{{ getCapabilityLabel(cap) }}</span>
              </div>
              <div class="preset-model-foot">
                <span class="preset-ctx">上下文 {{ pm.contextWindow ? `${(pm.contextWindow / 1000).toFixed(0)}K` : '未知' }}</span>
                <button
                  v-if="!addedPresetModelNames.has(pm.modelName)"
                  class="secondary-button preset-add-btn"
                  type="button"
                  :disabled="wizardBusy"
                  @click="addPresetModel(pm)"
                >
                  {{ wizardBusy ? '添加中...' : '+ 添加此模型' }}
                </button>
                <span v-else class="badge badge-success">已添加</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 已添加的模型列表 -->
        <div v-if="wizardModels.length > 0" class="model-list-section">
          <p class="subsection-hint">{{ wizardPresetModels.length > 0 ? '✅ 已配置的模型' : '当前服务商的模型' }}</p>
          <div class="model-list">
            <div
              v-for="model in wizardModels"
              :key="model.id"
              class="model-card select-card"
              :class="{ 'is-active': model.id === defaultModelId }"
            >
              <div class="model-card-head">
                <strong>{{ model.displayName }}</strong>
                <span v-if="model.id === defaultModelId" class="badge badge-success">默认</span>
              </div>
              <p class="model-meta">
                {{ model.modelName }}
                <template v-if="model.capabilities.length">
                  · <span v-for="(cap, i) in model.capabilities" :key="cap" class="cap-tag">{{ getCapabilityLabel(cap) }}<template v-if="i < model.capabilities.length - 1"> </template></span>
                </template>
              </p>
              <div class="model-card-actions">
                <button
                  v-if="model.id !== defaultModelId"
                  class="action-btn action-advance"
                  type="button"
                  :disabled="wizardBusy"
                  @click="setWizardDefaultModel(model.id)"
                >
                  设为默认
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 无推荐模型 + 无已有模型：自定义服务商提示 -->
        <div v-if="wizardPresetModels.length === 0 && wizardModels.length === 0" class="no-models-hint">
          <p>当前服务商暂无推荐模型。</p>
          <p class="text-secondary">你可以在完成向导后，进入「高级设置」→「自定义模型」手动添加。</p>
        </div>

        <!-- 测试连接 -->
        <div v-if="wizardModels.length > 0" class="test-section">
          <button
            class="secondary-button"
            type="button"
            :disabled="healthCheckBusy"
            @click="runWizardHealthCheck"
          >
            {{ healthCheckBusy ? '测试中...' : '🔍 测试连接' }}
          </button>

          <div v-if="healthCheckResult" class="health-result" :class="healthCheckResult.status === 'ok' || healthCheckResult.status === 'healthy' ? 'health-ok' : 'health-fail'">
            <span class="health-icon">{{ (healthCheckResult.status === 'ok' || healthCheckResult.status === 'healthy') ? '✅' : '❌' }}</span>
            <span>
              {{ (healthCheckResult.status === 'ok' || healthCheckResult.status === 'healthy') ? '连接成功' : '连接失败' }}
              <template v-if="healthCheckResult.latencyMs">（{{ healthCheckResult.latencyMs }}ms）</template>
            </span>
            <p v-if="healthCheckResult.checkedUrl" class="health-url">检查地址：{{ healthCheckResult.checkedUrl }}</p>
            <p v-if="healthCheckResult.error" class="health-error">{{ healthCheckResult.error }}</p>
            <button
              v-if="!(healthCheckResult.status === 'ok' || healthCheckResult.status === 'healthy')"
              class="secondary-button"
              type="button"
              @click="goBackToStep(2)"
            >
              返回修改连接信息
            </button>
          </div>
        </div>

        <!-- 完成提示 -->
        <div v-if="wizardComplete" class="wizard-done">
          <div class="done-icon">🎉</div>
          <h3>配置完成！</h3>
          <p>模型已配置就绪，可以开始使用了。</p>
          <div class="done-actions">
            <button class="primary-button" type="button" @click="finishWizard">完成</button>
            <button class="secondary-button" type="button" @click="router.push('/workbench')">返回工作台</button>
          </div>
        </div>
      </section>
    </template>

    <!-- ═══════════════════════════════════════════════ -->
    <!-- 已配置视图（非向导模式） -->
    <!-- ═══════════════════════════════════════════════ -->
    <template v-else>
      <header class="page-header glass-panel">
        <div>
          <p class="eyebrow">模型配置</p>
          <h1>模型连接与路由配置</h1>
          <p>按服务商连接 → 可用模型 → 使用场景的层级流程管理 AI 模型路由。</p>
        </div>
        <div class="header-right">
          <div class="state-badge" :class="`badge-${stateSeverity}`">
            {{ stateLabel }}
          </div>
        </div>
      </header>

      <div v-if="configStateInfo.severity !== 'ready' && configStateInfo.message" class="blocked-banner">
        <div class="blocked-banner-content">
          <span class="blocked-icon">{{ configStateInfo.severity === 'blocked' ? '🚫' : '⚠️' }}</span>
          <div>
            <strong>{{ configStateInfo.message }}</strong>
            <p v-if="configStateInfo.state === 'no_provider'">请先连接 DeepSeek、MiMo、OpenAI 或自定义服务商。</p>
            <p v-else-if="configStateInfo.state === 'provider_missing_key'">已创建服务商，但还不能发起请求。</p>
            <p v-else-if="configStateInfo.state === 'no_model'">服务商已连接，请选择或同步一个模型。</p>
            <p v-else-if="configStateInfo.state === 'no_default_model'">已有模型，但系统不知道默认使用哪一个。</p>
            <p v-else-if="configStateInfo.state === 'not_tested'">配置已完成，建议先测试模型调用。</p>
            <p v-else-if="configStateInfo.state === 'test_failed'">请查看失败原因并修正 API Key、Base URL、模型名或参数。</p>
          </div>
          <button
            v-if="configStateInfo.actionTarget"
            class="primary-button"
            type="button"
            @click="startWizard"
          >
            {{ configStateInfo.actionLabel }}
          </button>
        </div>
      </div>

      <div v-if="error" class="error-banner">
        <p>{{ error }}</p>
        <button type="button" @click="error = null">✕</button>
      </div>

      <!-- 配置摘要 -->
      <section v-if="hasConfigContent" class="config-summary glass-panel">
        <div class="summary-row">
          <div class="summary-item">
            <span class="summary-label">服务商</span>
            <strong>{{ configStatus?.defaultProviderName || configStatus?.defaultProvider || '—' }}</strong>
          </div>
          <div class="summary-item">
            <span class="summary-label">默认模型</span>
            <strong>{{ configStatus?.defaultModelName || configStatus?.defaultModel || '—' }}</strong>
          </div>
          <div class="summary-item">
            <span class="summary-label">连接状态</span>
            <span class="badge" :class="stateSeverity === 'ready' ? 'badge-success' : 'badge-warning'">
              {{ stateSeverity === 'ready' ? '正常' : '待验证' }}
            </span>
          </div>
          <div class="summary-item">
            <span class="summary-label">流式输出</span>
            <span v-if="defaultModelId && models.find(m => m.id === defaultModelId)?.capabilities.includes('streaming')" class="badge badge-success">已支持</span>
            <span v-else class="badge badge-neutral">未检测</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">调用参数</span>
            <span class="param-compact">
              T={{ defaultCallParams.temperature }} · top_p={{ defaultCallParams.top_p }} · max={{ defaultCallParams.max_tokens }}
            </span>
          </div>
          <div class="summary-actions">
            <button class="secondary-button" type="button" @click="startWizard">重新配置</button>
            <button
              class="secondary-button"
              type="button"
              :disabled="!defaultProviderId"
              @click="runHealthCheck(defaultProviderId!)"
            >
              🔌 服务商连通性测试
            </button>
            <button
              class="secondary-button"
              type="button"
              :disabled="!defaultModelId || modelTestBusy"
              @click="runModelTest"
            >
              {{ modelTestBusy ? '测试中...' : '🧪 模型调用测试' }}
            </button>
            <button class="secondary-button" type="button" @click="router.push('/model-lab')">
              输出实验
            </button>
          </div>
        </div>

        <!-- 模型测试结果 -->
        <div v-if="modelTestResult" class="test-result-row" :class="(modelTestResult.status === 'ok' || modelTestResult.status === 'healthy') ? 'test-ok' : 'test-fail'">
          <span>
            {{ (modelTestResult.status === 'ok' || modelTestResult.status === 'healthy') ? '✅' : '❌' }}
            模型调用测试：{{ (modelTestResult.status === 'ok' || modelTestResult.status === 'healthy') ? '通过' : '失败' }}
            <template v-if="modelTestResult.latencyMs">（{{ modelTestResult.latencyMs }}ms）</template>
          </span>
          <span v-if="modelTestResult.checkedUrl" class="test-url">检查地址：{{ modelTestResult.checkedUrl }}</span>
          <span v-if="modelTestResult.error" class="test-error">{{ modelTestResult.error }}</span>
        </div>
      </section>

      <!-- 未配置提示 -->
      <section v-else class="config-empty glass-panel">
        <div class="empty-inner">
          <div class="empty-icon">🚀</div>
          <h3>尚未配置模型</h3>
          <p>完成 3 步快速配置，即可开始使用 AI 助手。</p>
          <button class="primary-button" type="button" @click="startWizard">开始配置</button>
        </div>
      </section>

      <!-- ═══════════ 1. 服务商连接 ═══════════ -->
      <section class="section-group config-section glass-panel">
        <div class="section-group-header">
          <span class="section-group-icon">🔌</span>
          <div>
            <h2 class="section-group-title">服务商连接</h2>
            <span class="section-group-desc">配置 API 密钥与连接信息，此阶段只关心能否连通</span>
          </div>
        </div>

        <!-- Providers -->
        <div class="section-heading">
          <div>
            <p class="eyebrow">已接入服务商</p>
            <h3>{{ providers.length }} 个服务商</h3>
          </div>
          <button class="primary-button" type="button" @click="startAddProvider">添加服务商</button>
        </div>

        <div v-if="showAddProvider" class="form-card">
          <div class="form-row">
            <label>名称</label>
            <input v-model="newProvider.name" placeholder="OpenAI" />
          </div>
          <div class="form-row">
            <label>接口地址</label>
            <input v-model="newProvider.apiBaseUrl" placeholder="https://api.openai.com/v1" />
          </div>
          <div class="form-row">
            <label>API Key</label>
            <input v-model="newProvider.apiKey" type="password" placeholder="sk-..." />
            <p v-if="editingProviderId" class="form-hint">留空表示不修改已保存的 API Key。</p>
          </div>
          <div v-if="showAdvanced" class="form-row form-row-advanced">
            <label>ID <span class="advanced-field-tag">高级</span></label>
            <input v-model="newProvider.id" placeholder="provider-openai" :disabled="!!editingProviderId" />
          </div>
          <div v-if="showAdvanced" class="form-row form-row-advanced">
            <label>类型 <span class="advanced-field-tag">高级</span></label>
            <select v-model="newProvider.type">
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
              <option value="custom">自定义</option>
            </select>
          </div>
          <div class="form-actions">
            <button class="primary-button" type="button" @click="addProviderSubmit">
              {{ editingProviderId ? '保存修改' : '保存' }}
            </button>
            <button type="button" @click="resetProviderForm">取消</button>
          </div>
        </div>

        <div v-if="providers.length === 0" class="empty-state">
          <p>尚未配置任何服务商。</p>
        </div>

        <div v-for="provider in providers" :key="provider.id" class="item-card" :class="{ 'is-default': provider.id === defaultProviderId }">
          <div class="item-head">
            <div class="item-head-left">
              <strong>{{ provider.name }}</strong>
              <span v-if="provider.id === defaultProviderId" class="default-star" title="默认服务商">★</span>
            </div>
            <span class="badge" :class="provider.enabled ? 'badge-success' : 'badge-neutral'">
              {{ provider.enabled ? '已启用' : '已禁用' }}
            </span>
          </div>
          <p class="item-meta">{{ provider.type }} · {{ provider.apiBaseUrl }}</p>
          <div class="item-actions">
            <button type="button" :class="provider.id === defaultProviderId ? 'default-active' : 'default-btn'" @click="setAsDefaultProvider(provider.id)">
              {{ provider.id === defaultProviderId ? '当前默认' : '设为默认' }}
            </button>
            <button type="button" @click="toggleProvider(provider.id, !provider.enabled)">
              {{ provider.enabled ? '禁用' : '启用' }}
            </button>
            <button type="button" @click="runHealthCheck(provider.id)">连通性测试</button>
            <button type="button" @click="startEditProvider(provider)">编辑</button>
            <button type="button" class="danger" @click="removeProvider(provider.id)">删除</button>
          </div>

          <div class="provider-model-panel">
            <div class="provider-model-column">
              <p class="provider-model-title">已配置模型</p>
              <div v-if="getProviderModels(provider.id).length > 0" class="provider-model-chip-list">
                <button
                  v-for="model in getProviderModels(provider.id)"
                  :key="model.id"
                  type="button"
                  class="provider-model-chip"
                  :class="{ 'is-default': model.id === defaultModelId }"
                  @click="setAsDefaultModel(model.id)"
                >
                  <span>{{ model.displayName }}</span>
                  <small>{{ model.modelName }}</small>
                </button>
              </div>
              <p v-else class="provider-model-empty">尚未添加模型。</p>
            </div>

            <div v-if="getProviderPresetModels(provider).length > 0" class="provider-model-column">
              <p class="provider-model-title">可添加推荐模型</p>
              <div v-if="getMissingProviderPresetModels(provider).length > 0" class="provider-recommended-list">
                <div
                  v-for="pm in getMissingProviderPresetModels(provider)"
                  :key="pm.modelName"
                  class="provider-recommended-model"
                >
                  <div>
                    <strong>{{ pm.displayName }}</strong>
                    <span>{{ pm.modelName }}</span>
                  </div>
                  <button
                    class="secondary-button preset-add-btn"
                    type="button"
                    :disabled="addingPresetModelKey === `${provider.id}:${pm.modelName}`"
                    @click="addRecommendedModelToProvider(provider.id, pm)"
                  >
                    {{ addingPresetModelKey === `${provider.id}:${pm.modelName}` ? '添加中...' : '添加' }}
                  </button>
                </div>
              </div>
              <p v-else class="provider-model-empty">推荐模型已全部添加。</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══════════ 2. 可用模型 ═══════════ -->
      <section class="section-group config-section glass-panel">
        <div class="section-group-header">
          <span class="section-group-icon">🧩</span>
          <div>
            <h2 class="section-group-title">可用模型</h2>
            <span class="section-group-desc">选择模型能力与默认模型，此阶段只关心模型能做什么</span>
          </div>
        </div>

        <!-- Models -->
        <div class="section-heading">
          <div>
            <p class="eyebrow">可用模型</p>
            <h3>{{ models.length }} 个模型</h3>
          </div>
          <div class="section-heading-actions">
            <button
              v-if="defaultProviderId"
              class="secondary-button"
              type="button"
              :disabled="syncingProviderId === defaultProviderId"
              @click="syncRemoteModels(defaultProviderId!)"
            >
              {{ syncingProviderId === defaultProviderId ? '同步中...' : '🔄 同步远端模型列表' }}
            </button>
          </div>
        </div>

        <div v-if="models.length === 0" class="empty-state">
          <p>尚未配置任何模型。请先在下方「高级设置」中添加自定义模型。</p>
        </div>

        <div v-for="model in models" :key="model.id" class="item-card" :class="{ 'is-default': model.id === defaultModelId }">
          <div class="item-head">
            <div class="item-head-left">
              <strong>{{ model.displayName }}</strong>
              <span v-if="model.id === defaultModelId" class="default-star" title="默认模型">★</span>
              <span v-if="perModelCallParams[model.id]" class="model-params-badge" title="已配置独立参数">⚙</span>
            </div>
            <span class="badge" :class="model.enabled ? 'badge-success' : 'badge-neutral'">
              {{ model.enabled ? '已启用' : '已禁用' }}
            </span>
          </div>
          <p class="item-meta">{{ model.modelName }}
            <template v-if="model.capabilities.length">
              · <span v-for="(cap, i) in model.capabilities" :key="cap" class="cap-tag">{{ getCapabilityLabel(cap) }}<template v-if="i < model.capabilities.length - 1"> </template></span>
            </template>
          </p>
          <p v-if="model.description" class="model-description">{{ model.description }}</p>
          <div class="item-actions">
            <button type="button" :class="model.id === defaultModelId ? 'default-active' : 'default-btn'" @click="setAsDefaultModel(model.id)">
              {{ model.id === defaultModelId ? '当前默认' : '设为默认' }}
            </button>
            <button type="button" @click="startEditModel(model)">编辑</button>
            <button type="button"
              :class="editingModelParamsId === model.id ? 'params-editing-btn' : 'params-btn'"
              @click="openModelParamsEditor(model.id)">
              ⚙️ 高级参数
            </button>
            <button type="button" class="danger" @click="removeModel(model.id)">删除</button>
          </div>

          <!-- 展开：模型参数编辑面板 -->
          <div v-if="editingModelParamsId === model.id" class="model-params-editor">
            <div class="params-editor-header">
              <span class="params-editor-title">「{{ model.displayName }}」的高级参数</span>
              <div class="params-mode-selector">
                <label class="params-mode-option" :class="{ active: editingParamsMode === 'global' }">
                  <input type="radio" value="global" :checked="editingParamsMode === 'global'" @change="switchModelParamsMode('global')" />
                  <span>使用全局默认</span>
                </label>
                <label class="params-mode-option" :class="{ active: editingParamsMode === 'custom' }">
                  <input type="radio" value="custom" :checked="editingParamsMode === 'custom'" @change="switchModelParamsMode('custom')" />
                  <span>应用级自定义</span>
                </label>
              </div>
            </div>

            <div v-if="editingParamsMode === 'global'" class="params-readonly-hint">
              📋 当前使用全局默认调用参数，以下为全局参数预览（只读）。切换为「应用级自定义」后可独立配置。
            </div>

            <div class="params-grid" :class="{ 'params-readonly': editingParamsMode === 'global' }">
              <!-- Row 1: temperature + top_p -->
              <div class="param-row">
                <div class="param-field">
                  <label class="param-label">
                    temperature
                    <span class="param-value">{{ editingParams.temperature.toFixed(2) }}</span>
                  </label>
                  <input type="range" min="0" max="2" step="0.05" v-model.number="editingParams.temperature" class="param-slider" :disabled="editingParamsMode === 'global'" />
                  <span class="param-hint">越低越稳定，越高越有创造性</span>
                </div>
                <div class="param-field">
                  <label class="param-label">
                    top_p
                    <span class="param-value">{{ editingParams.top_p.toFixed(2) }}</span>
                  </label>
                  <input type="range" min="0" max="1" step="0.05" v-model.number="editingParams.top_p" class="param-slider" :disabled="editingParamsMode === 'global'" />
                  <span class="param-hint">核采样范围控制</span>
                </div>
              </div>

              <!-- Row 2: max_tokens + timeout_ms + retry_count -->
              <div class="param-row">
                <div class="param-field param-field-narrow">
                  <label class="param-label">max_tokens</label>
                  <select
                    :value="maxTokensPresetKey"
                    class="param-input"
                    :disabled="editingParamsMode === 'global'"
                    @change="onMaxTokensPresetChange(($event.target as HTMLSelectElement).value)"
                  >
                    <option value="short">短输出（1024）</option>
                    <option value="normal">常规输出（4096）</option>
                    <option value="long">长输出（8192）</option>
                    <option value="max">最大可用（{{ getMaxOutputForCurrentModel() }}）</option>
                    <option value="custom">自定义...</option>
                  </select>
                  <span class="param-hint">推荐预设值，自定义可输入任意值</span>
                </div>
                <div v-if="maxTokensPresetKey === 'custom'" class="param-field param-field-narrow">
                  <label class="param-label">自定义值</label>
                  <input type="number" v-model.number="editingParams.max_tokens" min="1" max="200000" class="param-input" :disabled="editingParamsMode === 'global'" />
                  <span class="param-hint">手动输入最大输出 token 数</span>
                </div>
                <div class="param-field param-field-narrow">
                  <label class="param-label">timeout_ms</label>
                  <input type="number" v-model.number="editingParams.timeout_ms" min="1000" max="300000" step="1000" class="param-input" :disabled="editingParamsMode === 'global'" />
                  <span class="param-hint">超时（毫秒）</span>
                </div>
                <div class="param-field param-field-narrow">
                  <label class="param-label">retry_count</label>
                  <input type="number" v-model.number="editingParams.retry_count" min="0" max="10" class="param-input" :disabled="editingParamsMode === 'global'" />
                  <span class="param-hint">失败重试次数</span>
                </div>
              </div>

              <!-- Row 3: stream + tool_calling -->
              <div class="param-row">
                <div class="param-field param-field-toggle">
                  <label class="param-label-toggle">
                    <input type="checkbox" v-model="editingParams.stream" class="param-toggle" :disabled="editingParamsMode === 'global'" />
                    <span>流式输出（stream）</span>
                  </label>
                  <span class="param-hint">启用后输出将逐词返回</span>
                </div>
                <div class="param-field param-field-toggle">
                  <label class="param-label-toggle">
                    <input type="checkbox" v-model="editingParams.tool_calling" class="param-toggle" :disabled="editingParamsMode === 'global'" />
                    <span>工具调用（tool_calling）</span>
                  </label>
                  <span class="param-hint">允许模型调用外部工具</span>
                </div>
              </div>

              <!-- Row 4: reasoning_effort + response_format -->
              <div class="param-row">
                <div class="param-field">
                  <label class="param-label">reasoning_effort</label>
                  <select v-model="editingParams.reasoning_effort" class="param-input" :disabled="editingParamsMode === 'global'">
                    <option value="auto">auto（自动）</option>
                    <option value="low">low（低）</option>
                    <option value="medium">medium（中）</option>
                    <option value="high">high（高）</option>
                  </select>
                  <span class="param-hint">推理强度，仅部分模型支持</span>
                </div>
                <div class="param-field">
                  <label class="param-label">response_format</label>
                  <select v-model="editingParams.response_format" class="param-input" :disabled="editingParamsMode === 'global'">
                    <option value="json_object">json_object（JSON）</option>
                  </select>
                  <span class="param-hint">Agent 输出必须是可解析 JSON</span>
                </div>
              </div>
            </div>

            <div class="params-editor-actions">
              <button class="primary-button" type="button" @click="saveModelParams">
                {{ editingParamsMode === 'custom' ? '💾 保存自定义参数' : '确认' }}
              </button>
              <button v-if="editingParamsMode === 'custom'" class="secondary-button" type="button" @click="resetModelParams">
                🔄 恢复默认参数
              </button>
              <button class="secondary-button" type="button" @click="editingModelParamsId = null">关闭</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══════════ 3. 使用场景 ═══════════ -->
      <section class="section-group config-section glass-panel">
        <div class="section-group-header">
          <span class="section-group-icon">🎯</span>
          <div>
            <h2 class="section-group-title">使用场景</h2>
            <span class="section-group-desc">按使用场景分配模型，不同 AI 角色使用不同的模型</span>
          </div>
        </div>

        <div class="section-heading">
          <div>
            <p class="eyebrow">使用场景</p>
            <h3>{{ bindings.length }} 个场景已配置</h3>
          </div>
          <button
            v-if="availableScenarioRoles.length > 0"
            class="primary-button"
            type="button"
            @click="startAddScenario"
          >添加场景</button>
        </div>

        <!-- 添加/编辑场景表单 -->
        <div v-if="showAddScenario || editingScenarioRole" class="form-card">
          <p class="form-card-title">
            {{ editingScenarioRole ? `编辑「${getScenarioLabel(editingScenarioRole)}」场景` : '添加使用场景' }}
          </p>
          <div class="form-row">
            <label>使用场景</label>
            <select v-model="scenarioBinding.role" :disabled="!!editingScenarioRole">
              <option value="">选择场景</option>
              <option v-if="editingScenarioRole" :value="editingScenarioRole">
                {{ getScenarioLabel(editingScenarioRole) }}
              </option>
              <option v-for="s in availableScenarioRoles" :key="s.roleKey" :value="s.roleKey">
                {{ s.label }}
              </option>
            </select>
          </div>
          <div class="form-row">
            <label>使用模型</label>
            <select v-model="scenarioBinding.modelId" @change="onScenarioModelSelect">
              <option value="">选择模型</option>
              <option v-for="m in models" :key="m.id" :value="m.id">
                {{ m.displayName }}（{{ m.modelName }}）
              </option>
            </select>
          </div>
          <div v-if="showAdvanced" class="form-row form-row-advanced">
            <label>Scope <span class="advanced-field-tag">高级</span></label>
            <select v-model="scenarioBinding.scope">
              <option value="global">全局</option>
              <option value="workspace">工作区</option>
            </select>
          </div>
          <div class="form-actions">
            <button class="primary-button" type="button" @click="saveScenarioBinding">
              {{ editingScenarioRole ? '保存修改' : '添加场景' }}
            </button>
            <button type="button" @click="cancelScenarioEdit">取消</button>
          </div>
        </div>

        <!-- 无场景 -->
        <div v-if="bindings.length === 0 && !showAddScenario && !editingScenarioRole" class="empty-state">
          <p>尚未配置任何使用场景。添加场景可为不同的 AI 角色指定专用模型。</p>
        </div>

        <!-- 继承提示 -->
        <p v-if="bindings.length > 0 && !showAddScenario && !editingScenarioRole" class="inherit-hint">
          💡 未配置的使用场景将自动使用<span class="highlight-text">默认模型</span>与<span class="highlight-text">默认调用参数</span>。
        </p>

        <!-- 场景表格 -->
        <div v-if="bindings.length > 0 && !showAddScenario && !editingScenarioRole" class="scenario-table">
          <div class="scenario-table-header">
            <span class="col-scenario">使用场景</span>
            <span class="col-model">当前模型</span>
            <span class="col-params">参数策略</span>
            <span class="col-actions">操作</span>
          </div>
          <div
            v-for="binding in bindings"
            :key="binding.id"
            class="scenario-row"
          >
            <div class="col-scenario">
              <span class="scenario-icon-sm">{{ getScenarioIcon(binding.role) }}</span>
              <span class="scenario-name">{{ getScenarioLabel(binding.role) }}</span>
            </div>
            <div class="col-model">
              <span class="model-ref">{{ getBindingModelName(binding) }}</span>
              <span class="model-provider-tag">{{ getBindingProviderName(binding) }}</span>
            </div>
            <div class="col-params">
              <span class="param-strategy-tag strategy-default">使用默认参数</span>
            </div>
            <div class="col-actions">
              <button class="table-action-btn" type="button" @click="startEditScenario(binding)">更换模型</button>
              <button class="table-action-btn danger" type="button" @click="removeScenarioBinding(binding)">移除</button>
            </div>
          </div>
        </div>
      </section>

      <!-- ═══════════ 4. 高级设置 ═══════════ -->
      <section class="advanced-section">
        <button class="advanced-toggle" type="button" @click="showAdvanced = !showAdvanced">
          <span class="toggle-icon">{{ showAdvanced ? '▼' : '▶' }}</span>
          <span>🔧 高级设置</span>
          <span class="toggle-hint">ID、Headers、Paths、Scope、Priority、密钥、导入/导出</span>
        </button>

        <div v-if="showAdvanced" class="advanced-content">
          <!-- 自定义模型 -->
          <section class="config-section glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">自定义模型</p>
                <h3>{{ models.length }} 个模型</h3>
              </div>
              <button class="primary-button" type="button" @click="startAddModel">添加自定义模型</button>
            </div>

            <div v-if="showAddModel" class="form-card">
              <div class="form-row">
                <label>服务商</label>
                <select v-model="newModel.providerId" @change="syncNewModelId">
                  <option value="">选择服务商</option>
                  <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div class="form-row">
                <label>显示名称</label>
                <input v-model="newModel.displayName" placeholder="GPT-4o" />
              </div>
              <div class="form-row">
                <label>模型名称</label>
                <input v-model="newModel.modelName" placeholder="gpt-4o" @input="syncNewModelId" />
              </div>
              <div class="form-row">
                <label>用途说明</label>
                <input v-model="newModel.description" placeholder="适合通用任务和复杂推理" />
                <p class="form-hint">简短描述模型适合的使用场景，帮助区分不同模型。</p>
              </div>
              <div class="form-row form-row-advanced">
                <label>ID</label>
                <input v-model="newModel.id" placeholder="gpt-4o" :disabled="!!editingModelId" />
                <p class="form-hint">系统根据服务商+模型名自动生成，通常无需手动填写</p>
              </div>
              <div class="form-row form-row-advanced">
                <label>模型能力</label>
                <div class="capability-checkboxes">
                  <label v-for="cap in CAPABILITY_OPTIONS" :key="cap.key" class="cap-checkbox">
                    <input
                      type="checkbox"
                      :value="cap.key"
                      :checked="newModel.capabilities.includes(cap.key)"
                      @change="(e: Event) => {
                        const cb = e.target as HTMLInputElement
                        if (cb.checked) newModel.capabilities = [...newModel.capabilities, cap.key]
                        else newModel.capabilities = newModel.capabilities.filter(k => k !== cap.key)
                      }"
                    />
                    <span>{{ cap.label }}</span>
                  </label>
                </div>
              </div>
              <div class="form-row form-row-advanced">
                <label>上下文窗口</label>
                <input v-model.number="newModel.contextWindow" type="number" placeholder="128000" />
              </div>
              <div class="form-actions">
                <button class="primary-button" type="button" @click="addModelSubmit">
                  {{ editingModelId ? '保存修改' : '保存' }}
                </button>
                <button type="button" @click="resetModelForm">取消</button>
              </div>
            </div>
          </section>

          <!-- Secrets -->
          <section class="config-section glass-panel">
            <div class="section-heading">
              <p class="eyebrow">密钥管理</p>
            </div>
            <p class="placeholder-text">密钥独立存储于 secrets.json，不会明文出现在普通配置文件中。通过添加服务商时设置的 API Key 管理。</p>
          </section>

          <!-- 导入/导出 -->
          <section class="config-section glass-panel">
            <div class="section-heading">
              <p class="eyebrow">导入 / 导出</p>
            </div>
            <p class="placeholder-text" style="margin-bottom:10px;">
              导出配置包含服务商、模型、场景和默认调用参数。<strong>不包含 API Key</strong>。
              导入后可预览配置内容，手动完成密钥填入和模型映射。
            </p>
            <div class="import-export-actions">
              <button class="secondary-button" type="button" @click="handleExportConfig">
                📥 导出配置
              </button>
              <button class="secondary-button" type="button" @click="triggerImport">
                📤 导入配置
              </button>
              <button class="secondary-button" type="button" @click="showJsonPreview = !showJsonPreview">
                {{ showJsonPreview ? '🔼 收起' : '🔽 展开' }} JSON 预览
              </button>
            </div>
            <input
              ref="importFileInput"
              type="file"
              accept=".json"
              style="display:none"
              @change="handleImportConfig"
            />
          </section>

          <!-- 原始 JSON 预览 -->
          <section v-if="showJsonPreview" class="config-section glass-panel">
            <div class="section-heading">
              <p class="eyebrow">原始 JSON 预览</p>
            </div>
            <pre class="json-preview">{{ rawConfigJson }}</pre>
          </section>
        </div>
      </section>
    </template>

    <footer class="page-footer">
      <router-link to="/workbench" class="nav-link">← 返回工作台</router-link>
    </footer>
  </div>
</template>

<style scoped>
.model-config-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  max-width: 900px;
  margin: 0 auto;
}

.page-header {
  padding: 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.state-badge {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
}

/* badge severity classes matching §15 状态定义 */
.badge-blocked,
:deep(.badge-blocked) {
  background: rgba(244, 67, 54, 0.1);
  color: #d32f2f;
  border: 1px solid rgba(244, 67, 54, 0.2);
}

.badge-ready,
:deep(.badge-ready) {
  background: rgba(76, 175, 80, 0.1);
  color: #2e7d32;
  border: 1px solid rgba(76, 175, 80, 0.2);
}

.blocked-banner {
  padding: 16px 20px;
  background: rgba(255, 152, 0, 0.08);
  border: 1px solid rgba(255, 152, 0, 0.25);
  border-radius: 10px;
  font-size: 0.875rem;
  margin-bottom: 16px;
}

.blocked-banner-content {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.blocked-icon {
  font-size: 1.3rem;
  line-height: 1.4;
  flex-shrink: 0;
}

.blocked-banner-content strong {
  display: block;
  font-size: 0.9rem;
  margin-bottom: 4px;
  color: var(--color-text, #333);
}

.blocked-banner-content p {
  margin: 0;
  color: var(--color-text-secondary, #666);
  font-size: 0.8rem;
}

.blocked-banner-content .primary-button {
  margin-left: auto;
  flex-shrink: 0;
  align-self: center;
}

.error-banner {
  padding: 12px 16px;
  background: rgba(244, 67, 54, 0.1);
  border: 1px solid rgba(244, 67, 54, 0.3);
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
}

/* ─── 向导进度指示器 ─── */

.wizard-progress {
  display: flex;
  gap: 0;
  padding: 0;
  border-radius: var(--radius-md, 16px);
  overflow: hidden;
}

.progress-step {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 16px;
  background: var(--surface-muted, rgba(244, 247, 251, 0.85));
  font-size: 0.875rem;
  color: var(--text-tertiary, #7f8da2);
  transition: background 0.2s, color 0.2s;
  border-right: 1px solid var(--border-soft, rgba(157, 176, 201, 0.28));
}

.progress-step:last-child {
  border-right: none;
}

.progress-step.is-active {
  background: var(--surface-active, rgba(231, 242, 255, 0.92));
  color: var(--accent-blue, #2f6fed);
  font-weight: 600;
}

.progress-step.is-done {
  background: rgba(31, 157, 102, 0.08);
  color: var(--accent-green, #1f9d66);
}

.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(157, 176, 201, 0.2);
  font-size: 0.75rem;
  font-weight: 700;
}

.progress-step.is-active .step-number {
  background: rgba(47, 111, 237, 0.2);
  color: var(--accent-blue, #2f6fed);
}

.progress-step.is-done .step-number {
  background: rgba(31, 157, 102, 0.2);
  color: var(--accent-green, #1f9d66);
}

.step-label {
  font-size: 0.8125rem;
}

/* ─── 向导步骤 ─── */

.wizard-step {
  padding: 28px;
  animation: fade-up 400ms ease-out;
}

.wizard-step h2 {
  margin: 0;
  font-size: 1.4rem;
  letter-spacing: -0.03em;
}

.step-desc {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.step-header h2 {
  margin: 0;
}

.back-btn {
  padding: 6px 12px;
  border-radius: 8px;
  background: var(--surface-muted, rgba(244, 247, 251, 0.85));
  border: 1px solid var(--border-soft, rgba(157, 176, 201, 0.28));
  font-size: 0.8125rem;
  color: var(--text-secondary);
  transition: background 0.15s;
}

.back-btn:hover {
  background: var(--surface-active, rgba(231, 242, 255, 0.92));
}

/* ─── Step 1: 服务商卡片 ─── */

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
  margin-top: 20px;
}

.provider-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
  padding: 20px 16px;
  cursor: pointer;
}

.provider-card .provider-icon {
  font-size: 2rem;
  line-height: 1;
}

.provider-card strong {
  font-size: 0.95rem;
}

.provider-url {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  word-break: break-all;
  margin: 4px 0 0;
}

/* ─── Step 2: 向导表单 ─── */

.wizard-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 20px;
  max-width: 480px;
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-row label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-row input,
.form-row select {
  padding: 10px 14px;
  border: 1px solid var(--border-strong, rgba(126, 152, 184, 0.45));
  border-radius: 10px;
  font-size: 0.9rem;
  background: white;
  transition: border-color 0.15s;
}

.form-row input:focus,
.form-row select:focus {
  outline: none;
  border-color: var(--accent-blue, #2f6fed);
  box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.12);
}

.required {
  color: var(--accent-red, #c55349);
}

.form-hint {
  margin: 2px 0 0;
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

.wizard-actions {
  margin-top: 8px;
}

/* ─── Step 3: 模型选择 ─── */

.model-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}

.model-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  text-align: left;
  cursor: default;
}

.model-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.model-meta {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0;
}

.model-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

/* ─── 预设模型卡片 ─── */

.subsection-hint {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin: 16px 0 10px;
}

.model-list-section {
  margin-top: 8px;
}

.preset-models-section {
  margin-top: 16px;
}

.preset-model-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
}

.preset-model-card {
  padding: 14px 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.15s, background 0.15s;
}

.preset-model-card:hover {
  border-color: var(--accent-blue, #2f6fed);
  background: rgba(47, 111, 237, 0.02);
}

.preset-model-card.is-added {
  border-color: rgba(31, 157, 102, 0.3);
  background: rgba(31, 157, 102, 0.04);
}

.preset-model-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-model-head strong {
  font-size: 0.92rem;
  font-weight: 600;
}

.preset-model-api-name {
  font-size: 0.72rem;
  font-family: monospace;
  color: var(--text-tertiary);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 3px;
}

.preset-model-desc {
  font-size: 0.78rem;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.4;
}

.preset-model-caps {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.preset-model-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 2px;
}

.preset-ctx {
  font-size: 0.72rem;
  color: var(--text-tertiary);
}

.preset-add-btn {
  font-size: 0.75rem !important;
  padding: 4px 12px !important;
}

.provider-model-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 14px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-soft, rgba(157, 176, 201, 0.28));
}

.provider-model-column {
  min-width: 0;
}

.provider-model-title {
  margin: 0 0 8px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-secondary);
}

.provider-model-chip-list,
.provider-recommended-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.provider-model-chip {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 220px;
  min-height: 44px;
  padding: 7px 10px;
  border: 1px solid rgba(157, 176, 201, 0.36);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.82);
  color: var(--text-primary);
  cursor: pointer;
}

.provider-model-chip:hover,
.provider-model-chip.is-default {
  border-color: var(--accent-blue, #2f6fed);
  background: rgba(47, 111, 237, 0.06);
}

.provider-model-chip span,
.provider-recommended-model strong {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-size: 0.82rem;
}

.provider-model-chip small,
.provider-recommended-model span {
  max-width: 100%;
  overflow-wrap: anywhere;
  font-family: monospace;
  font-size: 0.68rem;
  color: var(--text-tertiary);
}

.provider-recommended-model {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  min-height: 46px;
  padding: 8px 10px;
  border: 1px solid rgba(157, 176, 201, 0.3);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.62);
}

.provider-recommended-model > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.provider-model-empty {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-tertiary);
}

@media (max-width: 780px) {
  .provider-model-panel {
    grid-template-columns: 1fr;
  }

  .provider-recommended-model {
    align-items: flex-start;
    flex-direction: column;
  }
}

.text-secondary {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.no-models-hint {
  padding: 20px;
  text-align: center;
  color: var(--text-secondary);
  margin-top: 16px;
}

.inline-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 400px;
  margin: 16px auto 0;
  text-align: left;
}

/* ─── Step 3: 测试连接 ─── */

.test-section {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-soft, rgba(157, 176, 201, 0.28));
}

.health-result {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 560px;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 500;
}

.health-ok {
  background: rgba(31, 157, 102, 0.1);
  color: var(--accent-green, #1f9d66);
}

.health-fail {
  background: rgba(197, 83, 73, 0.1);
  color: var(--accent-red, #c55349);
}

.health-icon {
  font-size: 1rem;
}

.health-error {
  margin: 4px 0 0;
  font-size: 0.8rem;
  font-weight: 400;
  word-break: break-word;
}

.health-url {
  margin: 4px 0 0;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--text-secondary);
  word-break: break-all;
}

/* ─── 测试结果行 ─── */

.test-result-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  margin-top: 10px;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
}

.test-result-row.test-ok {
  background: rgba(31, 157, 102, 0.08);
  color: var(--accent-green, #1f9d66);
}

.test-result-row.test-fail {
  background: rgba(197, 83, 73, 0.08);
  color: var(--accent-red, #c55349);
}

.test-url {
  font-size: 0.72rem;
  color: var(--text-tertiary);
  font-weight: 400;
}

.test-error {
  font-size: 0.78rem;
  font-weight: 400;
  line-height: 1.4;
}

/* ─── 向导完成 ─── */

.wizard-done {
  text-align: center;
  padding: 32px 20px;
  margin-top: 24px;
  border-radius: var(--radius-lg, 22px);
  background: linear-gradient(135deg, rgba(237, 248, 242, 0.92), rgba(242, 252, 246, 0.88));
  border: 1px solid rgba(31, 157, 102, 0.2);
}

.done-icon {
  font-size: 2.5rem;
  margin-bottom: 8px;
}

.wizard-done h3 {
  margin: 0;
  font-size: 1.3rem;
  color: var(--accent-green, #1f9d66);
}

.wizard-done p {
  margin: 8px 0 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.done-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 20px;
}

/* ─── 配置摘要（已配置视图） ─── */

.config-summary {
  padding: 20px 24px;
}

.summary-row {
  display: flex;
  align-items: center;
  gap: 24px;
  flex-wrap: wrap;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.summary-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-tertiary);
}

.summary-item strong {
  font-size: 0.95rem;
}

.summary-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.param-compact {
  font-size: 0.78rem;
  color: var(--text-secondary);
  font-family: monospace;
  letter-spacing: -0.02em;
}

/* ─── 未配置提示 ─── */

.config-empty {
  padding: 40px 32px;
}

.empty-inner {
  text-align: center;
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 8px;
}

.config-empty h3 {
  margin: 0;
  font-size: 1.2rem;
}

.config-empty p {
  margin: 8px 0 20px;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

/* ─── 树形层级：section-group ─── */

.section-group {
  animation: fade-up 400ms ease-out;
}

.section-group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 0 8px 0;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--border-soft, rgba(157, 176, 201, 0.28));
}

.section-group-icon {
  font-size: 1.35rem;
  flex-shrink: 0;
}

.section-group-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary, #11233f);
  margin: 0;
  letter-spacing: -0.02em;
}

.section-group-desc {
  display: block;
  font-size: 0.78rem;
  color: var(--text-tertiary, #7f8da2);
  margin-top: 1px;
}

/* ─── 高级设置字段标记 ─── */

.form-row-advanced {
  padding-left: 8px;
  border-left: 3px solid rgba(107, 125, 148, 0.25);
  background: rgba(107, 125, 148, 0.03);
  border-radius: 0 6px 6px 0;
}

.advanced-field-tag {
  display: inline-block;
  padding: 0 4px;
  margin-left: 4px;
  font-size: 0.65rem;
  font-weight: 500;
  color: var(--accent-slate, #6b7d94);
  background: rgba(107, 125, 148, 0.1);
  border-radius: 3px;
  vertical-align: middle;
  letter-spacing: 0.03em;
}

/* ─── 高级设置折叠区 ─── */

.advanced-section {
  margin-top: 8px;
}

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 12px 16px;
  border-radius: var(--radius-md, 16px);
  background: var(--surface-muted, rgba(244, 247, 251, 0.85));
  border: 1px solid var(--border-soft, rgba(157, 176, 201, 0.28));
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  transition: background 0.15s;
  text-align: left;
}

.advanced-toggle:hover {
  background: var(--surface-active, rgba(231, 242, 255, 0.92));
}

.toggle-icon {
  font-size: 0.7rem;
  width: 16px;
  text-align: center;
}

.toggle-hint {
  font-weight: 400;
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin-left: 4px;
}

.advanced-content {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  animation: fade-up 300ms ease-out;
}

/* ─── 高级设置内部样式 ─── */

.config-section {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-heading-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.form-card {
  padding: 16px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.form-card-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
}

/* ─── 使用场景表格 ─── */

.inherit-hint {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin: 0 0 8px 0;
  padding: 6px 10px;
  background: rgba(47, 111, 237, 0.04);
  border-radius: 6px;
  border-left: 3px solid var(--accent-blue, #2f6fed);
}

.highlight-text {
  font-weight: 600;
  color: var(--accent-blue, #2f6fed);
}

.scenario-table {
  display: flex;
  flex-direction: column;
  gap: 1px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  overflow: hidden;
}

.scenario-table-header {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: rgba(0, 0, 0, 0.03);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.scenario-row {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: white;
  transition: background 0.12s;
}

.scenario-row:hover {
  background: rgba(47, 111, 237, 0.02);
}

.scenario-row + .scenario-row {
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}

.col-scenario {
  flex: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.scenario-icon-sm {
  font-size: 1.1rem;
  flex-shrink: 0;
  line-height: 1;
}

.scenario-name {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.col-model {
  flex: 2;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.model-ref {
  font-size: 0.82rem;
  font-weight: 500;
}

.model-provider-tag {
  font-size: 0.68rem;
  color: var(--text-tertiary);
  background: rgba(0, 0, 0, 0.04);
  padding: 1px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.col-params {
  flex: 1.5;
}

.param-strategy-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.72rem;
  font-weight: 500;
  white-space: nowrap;
}

.strategy-default {
  background: rgba(31, 157, 102, 0.08);
  color: var(--accent-green, #1f9d66);
}

.strategy-custom {
  background: rgba(47, 111, 237, 0.08);
  color: var(--accent-blue, #2f6fed);
}

.col-actions {
  flex: 1.5;
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

.table-action-btn {
  padding: 3px 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 5px;
  font-size: 0.72rem;
  cursor: pointer;
  background: white;
  transition: all 0.15s;
  white-space: nowrap;
}

.table-action-btn:hover {
  background: var(--surface-muted);
}

.table-action-btn.danger {
  color: #d32f2f;
  border-color: rgba(211, 47, 47, 0.25);
}

.table-action-btn.danger:hover {
  background: rgba(211, 47, 47, 0.05);
}

.item-card {
  padding: 12px 16px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.item-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.item-head-left {
  display: flex;
  align-items: center;
  gap: 6px;
}

.default-star {
  color: #c88b17;
  font-size: 1rem;
  line-height: 1;
}

.is-default {
  border-color: rgba(200, 139, 23, 0.3);
  background: rgba(255, 248, 237, 0.6);
}

.default-btn {
  color: var(--accent-blue, #2f6fed);
  border-color: rgba(47, 111, 237, 0.3) !important;
}

.default-active {
  color: #c88b17;
  border-color: rgba(200, 139, 23, 0.3) !important;
  font-weight: 600;
}

.item-meta {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0;
}

.model-description {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin: 0;
  line-height: 1.4;
}

.item-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.item-actions button {
  padding: 4px 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  background: white;
}

.item-actions button.danger {
  color: #d32f2f;
  border-color: rgba(211, 47, 47, 0.3);
}

/* ─── 模型参数 badge ─── */

.model-params-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  font-size: 0.65rem;
  color: var(--accent-blue, #2f6fed);
  background: rgba(47, 111, 237, 0.1);
  border-radius: 50%;
  flex-shrink: 0;
}

/* ─── 模型参数按钮 ─── */

.params-btn {
  color: var(--accent-blue, #2f6fed);
  border-color: rgba(47, 111, 237, 0.3) !important;
}

.params-editing-btn {
  color: white !important;
  background: var(--accent-blue, #2f6fed) !important;
  border-color: var(--accent-blue, #2f6fed) !important;
}

/* ─── 模型参数编辑面板 ─── */

.model-params-editor {
  margin-top: 10px;
  padding: 16px;
  border: 1px solid var(--accent-blue, rgba(47, 111, 237, 0.25));
  border-radius: 10px;
  background: rgba(47, 111, 237, 0.02);
  animation: fade-up 250ms ease-out;
}

.params-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.params-editor-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--text-primary);
}

.params-mode-selector {
  display: flex;
  gap: 2px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  padding: 2px;
}

.params-mode-option {
  display: flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
  user-select: none;
}

.params-mode-option input[type="radio"] {
  display: none;
}

.params-mode-option:hover {
  background: rgba(0, 0, 0, 0.04);
}

.params-mode-option.active {
  background: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  font-weight: 600;
  color: var(--accent-blue, #2f6fed);
}

.params-readonly-hint {
  font-size: 0.78rem;
  color: var(--text-tertiary);
  margin-bottom: 12px;
  padding: 8px 12px;
  background: rgba(255, 152, 0, 0.06);
  border-left: 3px solid rgba(255, 152, 0, 0.4);
  border-radius: 0 6px 6px 0;
  line-height: 1.4;
}

.params-readonly {
  opacity: 0.65;
  pointer-events: none;
}

.params-editor-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
}

.placeholder-text {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

/* ─── 导入/导出 ─── */

.import-export-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* ─── JSON 预览 ─── */

.json-preview {
  padding: 14px;
  background: #1e1e2e;
  color: #cdd6f4;
  border-radius: 8px;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.75rem;
  line-height: 1.5;
  overflow-x: auto;
  max-height: 400px;
  overflow-y: auto;
  margin: 0;
  white-space: pre;
}

.page-footer {
  padding: 16px 0;
}

.nav-link {
  color: var(--accent-blue, #2f6fed);
  text-decoration: none;
  font-size: 0.875rem;
}

.nav-link:hover {
  text-decoration: underline;
}

/* ─── 能力复选框 ─── */

.capability-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cap-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 6px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
  background: white;
  user-select: none;
}

.cap-checkbox:hover {
  border-color: var(--accent-blue, #2f6fed);
  background: rgba(47, 111, 237, 0.04);
}

.cap-checkbox input[type="checkbox"] {
  accent-color: var(--accent-blue, #2f6fed);
  width: 14px;
  height: 14px;
  margin: 0;
}

/* ─── 模型卡片能力标签 ─── */

.cap-tag {
  display: inline-block;
  padding: 1px 6px;
  margin-right: 4px;
  border-radius: 4px;
  background: rgba(47, 111, 237, 0.08);
  color: var(--accent-blue, #2f6fed);
  font-size: 0.72rem;
  font-weight: 500;
  white-space: nowrap;
}

/* ─── 默认调用参数控制 ─── */

.params-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.param-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.param-row > .param-field {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.param-field-narrow {
  max-width: 180px;
  flex: 0 0 auto !important;
}

.param-field-toggle {
  flex: 1;
  min-width: 240px;
}

.param-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.param-label-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.param-label-toggle input[type="checkbox"].param-toggle {
  accent-color: var(--accent-blue, #2f6fed);
  width: 16px;
  height: 16px;
  margin: 0;
}

.param-value {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(47, 111, 237, 0.1);
  color: var(--accent-blue, #2f6fed);
  font-size: 0.7rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  min-width: 36px;
  text-align: center;
}

.param-slider {
  width: 100%;
  accent-color: var(--accent-blue, #2f6fed);
  height: 4px;
  margin: 4px 0;
}

.param-input {
  padding: 8px 12px;
  border: 1px solid var(--border-strong, rgba(126, 152, 184, 0.45));
  border-radius: 8px;
  font-size: 0.85rem;
  background: white;
  width: 100%;
  transition: border-color 0.15s;
}

.param-input:focus {
  outline: none;
  border-color: var(--accent-blue, #2f6fed);
  box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.12);
}

.param-hint {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  line-height: 1.3;
}

@keyframes fade-up {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
