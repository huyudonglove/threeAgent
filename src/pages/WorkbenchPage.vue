<script setup lang="ts">
// WorkbenchPage.vue - 用户任务推进台
// 真实 IPC 数据模式（通过 useWorkbenchData composable）

import { computed, ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useWorkbenchData } from '../composables/useWorkbenchData'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import FormDialog from '../components/FormDialog.vue'
import type { FormField } from '../components/FormDialog.vue'

const router = useRouter()
const route = useRoute()

const {
  workspaces,
  activeWorkspace,
  conversations,
  activeConversation,
  activeTask,
  artifacts,
  // traceEvents is consumed by timeline computed inside composable
  // traceEvents,
  // workflows,
  loading,
  error,
  metrics,
  stages,
  workflowNodes,
  memories,
  risks,
  modelConfigStatus,
  timeline,
  // loadWorkspaces is called inside composable onMounted automatically
  // loadWorkspaces,
  selectWorkspace,
  loadTask,
  loadArtifacts,
  loadTraceSummary,
  loadWorkflowContext,
  loadMemories,
  loadConversations,
  // loadRisks is called internally by loadTask/loadWorkflowContext
  // loadRisks,
  processTurnEnd,
  advanceTaskWorkflow,
  completeTaskWorkflowNode,
  blockTaskWorkflowNode,
  createConversation,
  closeConversation,
  submitInput,
  // 任务草案
  taskDraft,
  confirmAndStart,
  cancelDraft,
  // 恢复/继续入口
  canResume,
  resumeTask,
} = useWorkbenchData()

// ─── 处理从工作区首页跳转过来的 rootPath 参数 ───
onMounted(async () => {
  const rootPath = route.query.rootPath as string | undefined
  if (rootPath) {
    // 尝试读取工作区 manifest 并选中
    const wsResult = await window.agentAPI.getWorkspace(rootPath)
    if (wsResult.ok && wsResult.data) {
      const manifest = wsResult.data as { id?: string; name?: string; rootPath?: string; status?: string }
      await selectWorkspace({
        id: manifest.id ?? '',
        name: manifest.name ?? '',
        rootPath: manifest.rootPath ?? rootPath,
        status: manifest.status ?? 'active',
        activeRunId: null,
      })
      // 保存到最近列表
      await window.agentAPI.saveRecentWorkspace(rootPath)
    }
    // 如果有 focusInput 参数，聚焦输入框
    const shouldFocus = route.query.focusInput as string | undefined
    if (shouldFocus === 'true') {
      // 延迟聚焦，等 DOM 渲染
      setTimeout(() => {
        const input = document.querySelector('.quick-input') as HTMLInputElement
        input?.focus()
      }, 300)
    }
    // 清除 query 参数，避免刷新时重复触发
    router.replace({ path: '/workbench' })
    return
  }

  const continueFrom = route.query.continueFrom as string | undefined
  const continueTaskId = route.query.continueTaskId as string | undefined
  const continueTitle = route.query.continueTitle as string | undefined
  
  if (continueFrom && continueTaskId) {
    await handleContinueFromResultDraft(continueFrom, continueTaskId, continueTitle)
    router.replace({ path: '/workbench' })
    return
  }

  if (continueTaskId) {
    await restoreContinuedTask(continueTaskId)
    router.replace({ path: '/workbench' })
  }
})

// ─── 模型配置状态 computed（§15 规格） ───

/** 配置是否可用于启动任务（ready / not_tested 均可启动） */
const isModelReady = computed(() => {
  const s = modelConfigStatus.value
  if (!s) return false
  return s.state === 'ready' || s.state === 'not_tested'
})

/** 配置状态对应的用户提示（§15.4 文案） */
const modelStateAlert = computed(() => {
  const s = modelConfigStatus.value
  if (!s) return null
  const alerts: Record<string, { icon: string; title: string; desc: string; btn: string }> = {
    no_provider: {
      icon: '🚫',
      title: '尚未连接模型服务商',
      desc: '请先连接 DeepSeek、MiMo、OpenAI 或自定义服务商。',
      btn: '连接服务商',
    },
    provider_missing_key: {
      icon: '🔑',
      title: '服务商缺少 API Key',
      desc: '已创建服务商，但还不能发起请求。',
      btn: '补充 API Key',
    },
    no_model: {
      icon: '📦',
      title: '尚未选择可用模型',
      desc: '服务商已连接，请选择或同步一个模型。',
      btn: '选择模型',
    },
    no_default_model: {
      icon: '⭐',
      title: '尚未选择默认模型',
      desc: '已有模型，但系统不知道默认使用哪一个。',
      btn: '设置默认模型',
    },
    not_tested: {
      icon: '⚠️',
      title: '模型尚未测试',
      desc: '配置已完成，建议先测试模型调用。',
      btn: '测试模型',
    },
    test_failed: {
      icon: '❌',
      title: '模型调用测试失败',
      desc: '请查看失败原因并修正 API Key、Base URL、模型名或参数。',
      btn: '查看失败原因',
    },
  }
  return alerts[s.state] ?? null
})

const modelConfigSummary = computed(() => {
  const s = modelConfigStatus.value
  if (!s) return ''
  const parts: string[] = []
  if (s.defaultProviderName) parts.push(s.defaultProviderName)
  else if (s.hasProvider) parts.push('Provider 已配置')
  if (s.defaultModelName) parts.push(s.defaultModelName)
  else if (s.hasModel) parts.push('Model 已配置')
  return parts.join(' / ') || '未配置'
})

// ─── 继续任务（恢复现场） ───

const resuming = ref(false)

async function handleResumeTask() {
  if (resuming.value || !canResume.value) return
  resuming.value = true
  try {
    await resumeTask()
  } finally {
    resuming.value = false
  }
}

// ─── 打开工作区 ───

async function handleOpenWorkspace() {
  const result = await window.agentAPI.selectWorkspace()
  if (result.ok && result.data) {
    // 选中目录后尝试作为工作区打开
    const rootPath = result.data
    const wsResult = await window.agentAPI.getWorkspace(rootPath)
    if (wsResult.ok && wsResult.data) {
      // 工作区已存在，加载它
      const manifest = wsResult.data as { id?: string; name?: string; rootPath?: string; status?: string }
      await selectWorkspace({
        id: manifest.id ?? '',
        name: manifest.name ?? '',
        rootPath: manifest.rootPath ?? rootPath,
        status: manifest.status ?? 'active',
        activeRunId: null,
      })
    } else {
      // 工作区不存在，提示创建
      const createResult = await window.agentAPI.createWorkspace(rootPath)
      if (createResult.ok && createResult.data) {
        // 重新加载工作区列表
        const listResult = await window.agentAPI.listWorkspaces()
        if (listResult.ok && listResult.data) {
          const index = listResult.data as { workspaces: Array<{ id: string; name: string; rootPath: string }> }
          const newWs = index.workspaces?.find(w => w.rootPath === rootPath)
          if (newWs) {
            await selectWorkspace({
              id: newWs.id,
              name: newWs.name,
              rootPath: newWs.rootPath,
              status: 'active',
              activeRunId: null,
            })
          }
        }
      }
    }
  }
}

// ─── 任务状态摘要 computed ───

const taskStatusSummary = computed(() => {
  const task = activeTask.value
  if (!task) return null
  const node = workflowNodes.value.find(n => n.status === 'running' || n.status === 'blocked')
  return {
    taskStatus: task.status,
    currentNodeName: task.currentNodeName,
    blockedReason: task.blockedReason,
    nodeStatus: node?.status ?? '',
    nodeName: node?.name ?? '',
  }
})

type DetailTab = 'node' | 'artifacts' | 'runtime' | 'memory' | 'risk'

// ─── 对话框状态：标记完成 ───
const showCompleteConfirm = ref(false)
const conversationToClose = ref<typeof conversations.value[0] | null>(null)

// ─── 对话框状态：需要处理 ───
const showBlockDialog = ref(false)
const blockFields: FormField[] = [
  { key: 'reason', label: '阻塞原因', type: 'text', required: true },
  { key: 'waitingFor', label: '等待内容（可选）', type: 'text' },
]

// ─── 对话框状态：重新处理上一步 ───
const showReturnDialog = ref(false)
const returnFields = computed<FormField[]>(() => [
  {
    key: 'toNodeId',
    label: '目标节点',
    type: 'select',
    required: true,
    options: workflowNodes.value.map((n) => n.id),
  },
  { key: 'reason', label: '回流原因', type: 'text', required: true },
])

// ─── 对话框状态：新建会话 ───
const showNewConvDialog = ref(false)
const newConvFields: FormField[] = [
  { key: 'title', label: '会话标题', type: 'text', required: true },
  { key: 'taskType', label: '任务类型', type: 'select', required: true, options: ['development', 'research', 'review', 'design'] },
  { key: 'taskDomain', label: '任务领域（可选）', type: 'select', options: ['code-dev', 'doc-writing', 'research', 'general'] },
]

const activeNodeId = ref('')
const activeTab = ref<DetailTab>('node')

const activeNode = computed(
  () => workflowNodes.value.find((n) => n.id === activeNodeId.value) ?? workflowNodes.value[0],
)

// ─── 状态标签中文映射 ───
const statusLabelMap: Record<string, string> = {
  active: '活跃',
  paused: '已暂停',
  review: '待审核',
  running: '执行中',
  blocked: '已阻塞',
  done: '已完成',
  queued: '等待中',
  draft: '草稿',
  ready: '就绪',
  updated: '已更新',
}

// ─── 工作流 ID → 中文名映射 ───
const WORKFLOW_LABELS: Record<string, string> = {
  'research-prestudy': '调研分析',
  'existing-repo-iteration': '代码开发',
  'document-generation': '文档撰写',
  'ai-development': 'AI 辅助开发',
}

// ─── 任务类型 → 中文名映射 ───
const TASK_TYPE_LABELS: Record<string, string> = {
  research: '调研',
  development: '开发',
  design: '设计',
  general: '通用',
}

function selectNode(nodeId: string) {
  activeNodeId.value = nodeId
  activeTab.value = 'node'
}

async function handleSelectWorkspace(workspace: typeof workspaces.value[0]) {
  await selectWorkspace(workspace)
  // 重置节点选中状态
  activeNodeId.value = ''
}

async function restoreContinuedTask(taskId: string) {
  const rootPath = activeWorkspace.value?.rootPath ?? ''
  if (!rootPath || !taskId) return

  const matchedConversation = conversations.value.find((conversation) => conversation.currentTaskId === taskId)
  if (matchedConversation) {
    await handleSelectConversation(matchedConversation)
    return
  }

  await loadTask(rootPath, taskId)
  await loadArtifacts(rootPath, taskId)
  await loadWorkflowContext(taskId)
}

// ─── 工作流操作处理 ───

async function handleAdvance() {
  const rootPath = activeWorkspace.value?.rootPath ?? ''
  const taskId = activeTask.value?.id ?? ''
  if (!rootPath || !taskId) return
  actionFeedback.value = null
  const result = await advanceTaskWorkflow(rootPath, taskId)
  if (!result?.ok) {
    actionFeedback.value = {
      type: 'error',
      message: result?.error?.message ?? '推进失败，请检查当前任务状态。',
    }
    return
  }
  await loadWorkflowContext(taskId)
  const convRootPath = rootPath
  const tid = activeTask.value?.id ?? ''
  if (tid) await loadTask(convRootPath, tid)
  if (activeConversation.value?.id) {
    await loadTraceSummary(rootPath, activeConversation.value.id)
  }
  actionFeedback.value = { type: 'success', message: '已推进到下一步。' }
}

async function handleCompleteNode() {
  const rootPath = activeWorkspace.value?.rootPath ?? ''
  const taskId = activeTask.value?.id ?? ''
  if (!rootPath || !taskId) return
  await completeTaskWorkflowNode({ workspaceRootPath: rootPath, taskId })
  showCompleteConfirm.value = false
  await loadWorkflowContext(taskId)
  await loadTask(rootPath, taskId)
}

async function handleBlockNode(payload: Record<string, string>) {
  const rootPath = activeWorkspace.value?.rootPath ?? ''
  const taskId = activeTask.value?.id ?? ''
  if (!rootPath || !taskId) return
  await blockTaskWorkflowNode({
    workspaceRootPath: rootPath,
    taskId,
    reason: payload.reason ?? '',
    waitingFor: payload.waitingFor || undefined,
  })
  await loadWorkflowContext(taskId)
  await loadTask(rootPath, taskId)
}

async function handleReturnToNode(payload: Record<string, string>) {
  const rootPath = activeWorkspace.value?.rootPath ?? ''
  const taskId = activeTask.value?.id ?? ''
  if (!rootPath || !taskId) return
  const api = window.agentAPI
  await api.returnTaskWorkflow({
    workspaceRootPath: rootPath,
    taskId,
    toNodeId: payload.toNodeId,
    reason: payload.reason ?? '',
  })
  await loadWorkflowContext(taskId)
  await loadTask(rootPath, taskId)
}

// ─── 新建会话处理 ───

async function handleCreateConversation(payload: Record<string, string>) {
  const rootPath = activeWorkspace.value?.rootPath ?? ''
  if (!rootPath || !payload.title || !payload.taskType) return
  const result = await createConversation(
    rootPath,
    payload.title,
    payload.taskType,
    payload.taskDomain || undefined,
  )
  if (result.ok && result.data) {
    // 刷新会话列表并自动选中新会话
    await loadConversations(rootPath)
  }
}

// ─── Quick Input 提交 ───

const inputText = ref('')
const submitting = ref(false)
const submitFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null)
const actionFeedback = ref<{ type: 'success' | 'error'; message: string } | null>(null)

async function handleSubmitInput() {
  const raw = inputText.value.trim()
  if (!raw || submitting.value) return

  if (!activeWorkspace.value) {
    await handleOpenWorkspace()
    if (!activeWorkspace.value) return
  }

  submitting.value = true
  submitFeedback.value = null
  try {
    const result = await submitInput(raw)
    if (result?.ok && result.data && activeWorkspace.value && activeConversation.value) {
      await processTurnEnd(
        activeWorkspace.value.rootPath,
        activeConversation.value.id,
        { userInput: raw, agentOutput: '' },
      )
    }
    if (result?.ok) {
      inputText.value = ''
      submitFeedback.value = { type: 'success', message: '任务已启动，工作台已切换到新任务。' }
    } else {
      const message = result?.error?.message ?? '任务启动失败，请稍后重试。'
      submitFeedback.value = { type: 'error', message }
    }
  } catch (e) {
    submitFeedback.value = { type: 'error', message: `任务启动失败：${e}` }
  } finally {
    submitting.value = false
  }
}

async function handleCloseConversation() {
  const conversation = conversationToClose.value
  const rootPath = activeWorkspace.value?.rootPath ?? ''
  if (!conversation || !rootPath) return
  const result = await closeConversation(rootPath, conversation.id)
  if (result.ok) {
    conversationToClose.value = null
  }
}

async function handleConfirmAndStart() {
  if (submitting.value || !taskDraft.value) return
  submitting.value = true
  const raw = taskDraft.value.rawInput
  try {
    const result = await confirmAndStart()
    // 提交成功后自动处理轮次结束，触发记忆系统
    if (result?.ok && result.data && activeWorkspace.value && activeConversation.value) {
      await processTurnEnd(
        activeWorkspace.value.rootPath,
        activeConversation.value.id,
        { userInput: raw, agentOutput: '' },
      )
    }
    inputText.value = ''
  } finally {
    submitting.value = false
  }
}

function handleCancelDraft() {
  cancelDraft()
}

/**
 * P2-MAIN-01: 从结果页继续 - 调用后端生成结构化任务草案
 */
async function handleContinueFromResultDraft(resultId: string, _taskId: string, fallbackTitle?: string) {
  const rootPath = activeWorkspace.value?.rootPath
  if (!rootPath || !resultId) return

  try {
    const api = window.agentAPI
    const draftResult = await api.generateContinueDraft(rootPath, resultId)
    if (draftResult.ok && draftResult.data) {
      const draft = draftResult.data as {
        title: string
        taskType: string
        taskDomain: string
        workflowId: string
        rawInput: string
      }
      // 直接设置任务草案，复用已有的草案面板
      taskDraft.value = {
        title: draft.title,
        taskType: draft.taskType,
        taskDomain: draft.taskDomain,
        workflowId: draft.workflowId,
        rawInput: draft.rawInput,
      }
      return
    }
  } catch (e) {
    console.warn('[WorkbenchPage] generateContinueDraft failed, fallback to prefill:', e)
  }

  // 后端调用失败时，回退到预填输入框
  if (fallbackTitle) {
    inputText.value = fallbackTitle
  } else {
    inputText.value = '基于结果继续'
  }
  setTimeout(() => {
    const input = document.querySelector('.quick-input') as HTMLInputElement
    input?.focus()
  }, 300)
}

function handleEditDraft() {
  if (taskDraft.value) {
    inputText.value = taskDraft.value.rawInput
    cancelDraft()
    // 聚焦输入框
    setTimeout(() => {
      const input = document.querySelector('.quick-input') as HTMLInputElement
      input?.focus()
    }, 100)
  }
}

async function handleSelectConversation(conversation: typeof conversations.value[0]) {
  activeConversation.value = conversation
  const rootPath = activeWorkspace.value?.rootPath ?? ''
  const taskId = conversation.currentTaskId
  if (taskId && rootPath) {
    await loadTask(rootPath, taskId)
    await loadArtifacts(rootPath, taskId)
    await loadWorkflowContext(taskId)
  }
  if (rootPath) {
    await loadTraceSummary(rootPath, conversation.id)
    await loadMemories(rootPath, conversation.id)
  }
  activeNodeId.value = ''
}

// ─── 技术详情折叠状态 ───
const techDetailExpanded = ref(false)
</script>

<template>
  <div class="workbench">
    <div class="ambient ambient-left"></div>
    <div class="ambient ambient-right"></div>

    <header class="topbar glass-panel">
      <div>
        <p class="eyebrow">任务推进台</p>
        <h1>持续推进复杂任务，而不是重新开始聊天</h1>
        <p class="topbar-copy">
          关注任务进度、产出和可继续性，让每一步都有据可查。
        </p>
      </div>
      <p
        v-if="submitFeedback"
        class="submit-feedback"
        :class="`feedback-${submitFeedback.type}`"
      >{{ submitFeedback.message }}</p>

      <div class="topbar-actions">
        <div class="search-shell">
          <input
            v-model="inputText"
            class="quick-input"
            type="text"
            placeholder="描述你的任务需求..."
            :disabled="submitting"
            @keyup.enter="handleSubmitInput"
          />
        </div>
        <button
          class="primary-button"
          type="button"
          :disabled="submitting || !inputText.trim()"
          @click="handleSubmitInput"
        >{{ submitting ? '启动中...' : activeWorkspace ? '启动任务' : '选择工作区' }}</button>
        <button
          v-if="canResume"
          class="secondary-button"
          type="button"
          :disabled="resuming"
          @click="handleResumeTask"
        >{{ resuming ? '恢复中...' : '恢复任务' }}</button>
      </div>
    </header>

    <main class="shell">
      <!-- Loading / Error overlay -->
      <div v-if="loading" class="status-overlay">
        <span class="eyebrow">加载中…</span>
      </div>
      <div v-else-if="error" class="status-overlay status-error">
        <span class="eyebrow">{{ error }}</span>
      </div>
      <aside class="left-rail glass-panel">
        <section class="rail-section">
          <div class="section-heading">
            <p class="eyebrow">工作区</p>
            <span class="badge badge-neutral">{{ workspaces.length }} 个</span>
          </div>

          <!-- 打开工作区入口 -->
          <button
            v-if="!activeWorkspace"
            class="select-card open-workspace-card"
            type="button"
            @click="handleOpenWorkspace"
          >
            <div class="select-card-head">
              <strong>打开工作区</strong>
              <span>选择或创建</span>
            </div>
            <p>选择一个目录作为工作区，或创建新的工作区</p>
          </button>

          <button
            v-for="workspace in workspaces"
            :key="workspace.id"
            class="select-card"
            :class="{ 'is-active': workspace.id === activeWorkspace?.id }"
            type="button"
            @click="handleSelectWorkspace(workspace)"
          >
            <div class="select-card-head">
              <strong>{{ workspace.name }}</strong>
              <span>{{ statusLabelMap[workspace.status] ?? workspace.status }}</span>
            </div>
            <p>{{ workspace.rootPath }}</p>
          </button>
        </section>

        <section class="rail-section">
          <div class="section-heading">
            <p class="eyebrow">会话</p>
            <div class="heading-actions">
              <button
                class="icon-button"
                type="button"
                title="新建会话"
                @click="showNewConvDialog = true"
              >+</button>
            </div>
          </div>

          <button
            v-for="conversation in conversations"
            :key="conversation.id"
            class="select-card compact"
            :class="{ 'is-active': conversation.id === activeConversation?.id }"
            type="button"
            @click="handleSelectConversation(conversation)"
          >
            <div class="select-card-head">
              <strong>{{ conversation.title }}</strong>
              <span class="conversation-domain">{{ conversation.taskDomain ?? '' }}</span>
            </div>
            <p>{{ conversation.taskType }}</p>
            <div class="conversation-card-footer">
              <span class="badge" :class="`badge-${conversation.status}`">
                {{ statusLabelMap[conversation.status] }}
              </span>
              <button
                class="icon-button danger-icon-button"
                type="button"
                title="关闭会话"
                @click.stop="conversationToClose = conversation"
              >×</button>
            </div>
          </button>
        </section>

        <section class="rail-section">
          <div class="section-heading">
            <p class="eyebrow">任务</p>
          </div>

          <article v-if="activeTask" class="info-card">
            <div class="select-card-head">
              <strong>{{ activeTask.title }}</strong>
              <span>{{ activeTask.owner }}</span>
            </div>
            <p>{{ activeTask.currentNodeName }}</p>
            <span class="badge" :class="`badge-${activeTask.status}`">
              {{ statusLabelMap[activeTask.status] ?? activeTask.status }}
            </span>
          </article>
          <p v-else class="meta-inline">暂无活跃任务</p>
        </section>
      </aside>

      <section class="center-stage">
        <!-- 任务草案确认面板 -->
        <article v-if="taskDraft" class="draft-panel glass-panel">
          <div class="draft-header">
            <p class="eyebrow">📋 任务草案</p>
          </div>
          <div class="draft-body">
            <div class="draft-row">
              <span class="draft-label">任务标题</span>
              <strong class="draft-value">{{ taskDraft.title }}</strong>
            </div>
            <div class="draft-row">
              <span class="draft-label">任务类型</span>
              <span class="draft-value">{{ TASK_TYPE_LABELS[taskDraft.taskType] ?? taskDraft.taskType }}</span>
            </div>
            <div class="draft-row">
              <span class="draft-label">推荐流程</span>
              <span class="draft-value">{{ WORKFLOW_LABELS[taskDraft.workflowId] ?? taskDraft.workflowId }}</span>
            </div>
          </div>
          <div class="draft-actions">
            <button
              class="primary-button"
              type="button"
              :disabled="submitting"
              @click="handleConfirmAndStart"
            >{{ submitting ? '启动中...' : '开始执行' }}</button>
            <button
              class="secondary-button"
              type="button"
              :disabled="submitting"
              @click="handleEditDraft"
            >修改描述</button>
            <button
              class="ghost-button"
              type="button"
              :disabled="submitting"
              @click="handleCancelDraft"
            >取消</button>
          </div>
        </article>

        <!-- 模型配置状态提示（§15.4 规格，替换通用兜底文案） -->
        <article v-if="modelStateAlert && !loading" class="model-config-alert glass-panel">
          <div class="alert-content">
            <div class="alert-icon">{{ modelStateAlert.icon }}</div>
            <div class="alert-text">
              <strong>{{ modelStateAlert.title }}</strong>
              <p>{{ modelStateAlert.desc }}</p>
            </div>
            <button class="primary-button alert-action" type="button" @click="router.push('/model-config')">
              {{ modelStateAlert.btn }}
            </button>
          </div>
        </article>

        <!-- 模型配置已就绪摘要 -->
        <article v-else-if="isModelReady && modelConfigStatus && modelConfigSummary" class="model-config-summary glass-panel">
          <div class="summary-content">
            <span class="summary-icon">✓</span>
            <span class="summary-label">当前模型：</span>
            <strong>{{ modelConfigSummary }}</strong>
            <button class="summary-link" type="button" @click="router.push('/model-config')">配置</button>
          </div>
        </article>

        <!-- 📋 任务 -->
        <div class="section-group">
          <div class="section-group-header">
            <span class="section-group-icon">📋</span>
            <h2 class="section-group-title">任务</h2>
            <span class="section-group-desc">当前任务概览与运行指标</span>
          </div>

          <article class="hero-panel glass-panel">
            <div class="hero-copy">
              <p class="eyebrow">任务概览</p>
              <h2>{{ activeWorkspace?.name }}</h2>
              <p>
                {{ activeConversation?.title ?? '暂无活跃会话' }}
              </p>
            </div>

            <div class="hero-runtime">
              <div class="runtime-chip">
                <span>会话</span>
                <strong>{{ activeConversation?.id ?? '—' }}</strong>
              </div>
              <div class="runtime-chip">
                <span>任务</span>
                <strong>{{ activeTask?.id ?? '—' }}</strong>
              </div>
              <div class="runtime-chip">
                <span>当前步骤</span>
                <strong>{{ activeNode?.name ?? '—' }}</strong>
              </div>
            </div>

            <!-- 任务状态摘要 -->
            <div v-if="taskStatusSummary" class="task-status-summary">
              <div class="status-chip" :class="`chip-${taskStatusSummary.taskStatus}`">
                <span>当前任务</span>
                <strong>{{ taskStatusSummary.currentNodeName }}</strong>
                <span class="badge" :class="`badge-${taskStatusSummary.taskStatus}`">
                  {{ statusLabelMap[taskStatusSummary.taskStatus] ?? taskStatusSummary.taskStatus }}
                </span>
              </div>
              <p v-if="taskStatusSummary.blockedReason" class="block-reason-text">
                阻塞原因：{{ taskStatusSummary.blockedReason }}
              </p>
            </div>
          </article>

          <section class="metrics-grid">
            <article
              v-for="metric in metrics"
              :key="metric.label"
              class="metric-card glass-panel"
              :class="`tone-${metric.tone}`"
            >
              <span>{{ metric.label }}</span>
              <strong>{{ metric.value }}</strong>
              <p>{{ metric.helper }}</p>
            </article>
          </section>
        </div>

        <!-- 📊 进展 -->
        <div class="section-group">
          <div class="section-group-header">
            <span class="section-group-icon">📊</span>
            <h2 class="section-group-title">进展</h2>
            <span class="section-group-desc">主线进度与最近事件</span>
          </div>

          <article class="progress-panel glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">任务步骤</p>
                <h3>从启动到完成的主线进度</h3>
              </div>
            </div>

            <div class="stage-row">
              <div
                v-for="stage in stages"
                :key="stage.id"
                class="stage-pill"
                :class="`stage-${stage.state}`"
              >
                <span>{{ stage.name }}</span>
              </div>
            </div>
          </article>

          <article class="timeline-panel glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">最近进展</p>
                <h3>时间线</h3>
              </div>
            </div>

            <div class="timeline-list">
              <article v-for="event in timeline" :key="event.id" class="timeline-item">
                <span class="timeline-time">{{ event.time }}</span>
                <div class="timeline-content">
                  <div class="timeline-title-row">
                    <strong>{{ event.title }}</strong>
                    <span class="signal" :class="`signal-${event.tone}`"></span>
                  </div>
                  <p>{{ event.detail }}</p>
                </div>
              </article>
            </div>
          </article>
        </div>

        <!-- ▶️ 下一步 -->
        <div class="section-group">
          <div class="section-group-header">
            <span class="section-group-icon">▶️</span>
            <h2 class="section-group-title">下一步</h2>
            <span class="section-group-desc">工作流节点与操作</span>
          </div>

          <article class="workflow-panel glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">步骤详情</p>
                <h3>点击步骤查看详情</h3>
              </div>
              <!-- 工作流操作按钮区 -->
              <div v-if="activeTask" class="action-btn-row">
                <button class="action-btn action-advance" type="button" @click="handleAdvance">推进下一步</button>
                <button class="action-btn action-complete" type="button" @click="showCompleteConfirm = true">标记完成</button>
                <button class="action-btn action-block" type="button" @click="showBlockDialog = true">需要处理</button>
                <button class="action-btn action-return" type="button" @click="showReturnDialog = true">重新处理上一步</button>
              </div>
            </div>

            <p
              v-if="actionFeedback"
              class="action-feedback"
              :class="`feedback-${actionFeedback.type}`"
            >{{ actionFeedback.message }}</p>

            <div class="workflow-list">
              <button
                v-for="node in workflowNodes"
                :key="node.id"
                class="node-card"
                :class="[
                  `node-${node.status}`,
                  { 'is-active': node.id === activeNodeId },
                ]"
                type="button"
                @click="selectNode(node.id)"
              >
                <div class="node-card-top">
                  <span class="node-role">{{ node.role }}</span>
                  <span class="badge" :class="`badge-${node.status}`">
                    {{ statusLabelMap[node.status] }}
                  </span>
                </div>
                <strong>{{ node.name }}</strong>
                <p>{{ node.summary }}</p>
              </button>
            </div>
          </article>
        </div>

        <!-- 📦 产出 -->
        <div class="section-group">
          <div class="section-group-header">
            <span class="section-group-icon">📦</span>
            <h2 class="section-group-title">产出</h2>
            <span class="section-group-desc">{{ artifacts.length }} 个成果文件</span>
          </div>

          <article class="artifacts-panel glass-panel">
            <div class="artifact-panel-head">
              <div>
                <p class="eyebrow">成果清单</p>
                <h3>任务过程中沉淀的文件和结果</h3>
              </div>
              <span class="artifact-count">{{ artifacts.length }}</span>
            </div>

            <div class="artifact-list">
              <article v-if="artifacts.length === 0" class="artifact-empty">
                <strong>还没有可查看的产出</strong>
                <p>当你推进或完成工作流节点后，系统会在这里列出生成的报告、计划、总结或验收结果。</p>
              </article>

              <article v-for="artifact in artifacts" :key="artifact.id" class="artifact-item">
                <div class="artifact-main">
                  <span class="artifact-type">{{ artifact.type }}</span>
                  <strong>{{ artifact.title }}</strong>
                  <p>{{ artifact.summary || artifact.previewText || artifact.path || '内容已写入工作区产物库' }}</p>
                </div>

                <div class="artifact-meta-grid">
                  <div>
                    <span>来源步骤</span>
                    <strong>{{ artifact.node || '未标注' }}</strong>
                  </div>
                  <div>
                    <span>更新时间</span>
                    <strong>{{ artifact.updatedAt }}</strong>
                  </div>
                  <div>
                    <span>状态</span>
                  <span class="badge" :class="`badge-${artifact.status}`">
                    {{ statusLabelMap[artifact.status] }}
                  </span>
                  </div>
                </div>
              </article>
            </div>
          </article>
        </div>

        <!-- 🔧 技术详情（折叠区） -->
        <article class="tech-detail-panel glass-panel">
          <button
            class="tech-detail-toggle"
            type="button"
            @click="techDetailExpanded = !techDetailExpanded"
          >
            <span class="eyebrow" style="margin-bottom:0">🔧 技术详情</span>
            <span class="toggle-icon">{{ techDetailExpanded ? '▲ 收起' : '▼ 展开' }}</span>
          </button>

          <div v-if="techDetailExpanded" class="tech-detail-content">
            <!-- 当前节点详情 -->
            <section class="detail-stack">
              <article class="detail-card emphasis">
                <div class="detail-title-row">
                  <strong>{{ activeNode?.name }}</strong>
                  <span class="badge" :class="`badge-${activeNode?.status}`">
                    {{ activeNode ? statusLabelMap[activeNode.status] : '' }}
                  </span>
                </div>
                <p>{{ activeNode?.summary }}</p>
              </article>

              <article class="detail-card">
                <span class="detail-label">进入原因</span>
                <p>{{ activeNode?.reason }}</p>
              </article>

              <article class="detail-card">
                <span class="detail-label">输出</span>
                <ul class="detail-list">
                  <li v-for="output in activeNode?.outputs" :key="output">{{ output }}</li>
                </ul>
              </article>

              <article class="detail-card">
                <span class="detail-label">工具链</span>
                <ul class="detail-list">
                  <li v-for="tool in activeNode?.tools" :key="tool">{{ tool }}</li>
                </ul>
              </article>

              <article v-if="activeNode?.confirmations.length" class="detail-card alert-card">
                <span class="detail-label">待确认</span>
                <ul class="detail-list">
                  <li v-for="confirmation in activeNode.confirmations" :key="confirmation">
                    {{ confirmation }}
                  </li>
                </ul>
              </article>
            </section>

            <!-- TaskRuntime 信息 -->
            <section class="detail-stack">
              <article class="detail-card">
                <span class="detail-label">工作流</span>
                <p>{{ activeTask?.workflowId ?? '未绑定工作流' }}</p>
              </article>
              <article class="detail-card">
                <span class="detail-label">当前状态</span>
                <p>
                  {{ activeTask ? `任务${statusLabelMap[activeTask.status] ?? activeTask.status} — 当前步骤: ${activeTask.currentNodeName}` : '暂无活跃任务。' }}
                  <span v-if="activeTask?.blockedReason"> (阻塞原因: {{ activeTask.blockedReason }})</span>
                </p>
              </article>
              <article class="detail-card">
                <span class="detail-label">关联上下文</span>
                <ul class="detail-list">
                  <li>workspaceId: {{ activeWorkspace?.id ?? '—' }}</li>
                  <li>conversationId: {{ activeConversation?.id ?? '—' }}</li>
                  <li>taskId: {{ activeTask?.id ?? '—' }}</li>
                  <li>activeRole: {{ activeNode?.role ?? '—' }}</li>
                </ul>
              </article>
            </section>

            <!-- 过程记录 (Trace) -->
            <section v-if="timeline.length > 0" class="detail-stack">
              <article class="detail-card">
                <span class="detail-label">过程记录</span>
                <ul class="detail-list">
                  <li v-for="event in timeline" :key="event.id">
                    [{{ event.time }}] {{ event.title }} — {{ event.detail }}
                  </li>
                </ul>
              </article>
            </section>

            <!-- Memory manifest -->
            <section class="detail-stack">
              <template v-if="memories.length > 0">
                <article v-for="memory in memories" :key="memory.id" class="detail-card">
                  <div class="detail-title-row">
                    <strong>{{ memory.title }}</strong>
                    <span class="badge" :class="memory.source === 'shared' ? 'badge-info' : 'badge-neutral'">
                      {{ memory.source === 'shared' ? '共享' : '角色' }}
                    </span>
                  </div>
                  <p>{{ memory.detail }}</p>
                </article>
              </template>
              <article v-else class="detail-card">
                <span class="detail-label">记忆</span>
                <p>当前会话暂无关联记忆。会话轮次结束时系统会自动识别有价值的信息并存入记忆。</p>
              </article>
            </section>

            <!-- Risk 评估 -->
            <section class="detail-stack">
              <article
                v-for="risk in risks"
                :key="risk.id"
                class="detail-card"
                :class="{ 'alert-card': risk.level === 'high' }"
              >
                <div class="detail-title-row">
                  <strong>{{ risk.title }}</strong>
                  <span class="badge" :class="`badge-${risk.level}`">{{ risk.level }}</span>
                </div>
                <p>{{ risk.detail }}</p>
              </article>
            </section>
          </div>
        </article>
      </section>
    </main>

    <!-- 标记完成 确认对话框 -->
    <ConfirmDialog
      v-model:visible="showCompleteConfirm"
      title="标记完成"
      message="确认将当前节点标记为已完成？"
      confirm-text="确认完成"
      @confirm="handleCompleteNode"
    />

    <!-- 关闭会话确认对话框 -->
    <ConfirmDialog
      :visible="!!conversationToClose"
      title="关闭会话"
      :message="`确认关闭会话「${conversationToClose?.title ?? ''}」？任务、产物和记忆会保留，只从当前会话列表隐藏。`"
      confirm-text="关闭会话"
      danger
      @confirm="handleCloseConversation"
      @cancel="conversationToClose = null"
      @update:visible="(value) => { if (!value) conversationToClose = null }"
    />

    <!-- 需要处理 表单对话框 -->
    <FormDialog
      v-model:visible="showBlockDialog"
      title="需要处理"
      :fields="blockFields"
      submit-text="提交阻塞"
      @submit="handleBlockNode"
    />

    <!-- 重新处理上一步 表单对话框 -->
    <FormDialog
      v-model:visible="showReturnDialog"
      title="重新处理上一步"
      :fields="returnFields"
      submit-text="确认回流"
      @submit="handleReturnToNode"
    />

    <!-- 新建会话 表单对话框 -->
    <FormDialog
      v-model:visible="showNewConvDialog"
      title="新建会话"
      :fields="newConvFields"
      submit-text="创建会话"
      @submit="handleCreateConversation"
    />
  </div>
</template>
