// src/composables/useWorkbenchData.ts
// 工作台数据 composable：从后端 IPC 获取真实数据

import { ref, computed, onMounted } from 'vue'
import { useActiveWorkspace } from './useActiveWorkspace'

// ─── 任务草案类型 ───

export interface TaskDraft {
  title: string
  taskType: string
  taskDomain: string
  workflowId: string
  rawInput: string
}

// ─── 公共类型 ───

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

// ─── 类型（与 contracts/types.ts 对齐） ───

export interface WorkspaceInfo {
  id: string
  name: string
  rootPath: string
  status: string
  activeRunId: string | null
}

export interface ConversationInfo {
  id: string
  title: string
  taskType: string
  status: string
  currentTaskId: string | null
  currentWorkflowId: string | null
  currentNodeName: string | null
  taskDomain: string | null
}

export interface TaskInfo {
  id: string
  title: string
  owner: string
  status: string
  currentNodeName: string
  workflowId: string | null
  domainName: string | null
  blockedReason: string | null
  artifactIds: string[]
}

export interface ArtifactInfo {
  id: string
  title: string
  type: string
  node: string
  producedByNodeId?: string | null
  taskId: string
  status: string
  path: string
  summary?: string
  previewText?: string
  createdAt: string
  updatedAt: string
}

export interface TraceEvent {
  id: string
  eventType: string
  dataName: string
  dataId: string | null
  summary: string
  actorRole: string | null
  timestamp: string
}

export interface WorkflowInfo {
  id: string
  name: string
  taskDomain: string
  status: string
  nodes: Array<{
    id: string
    name: string
    role: string
    status: string
    summary: string
    outputs: string[]
  }>
}

// ─── 新增类型（与 src/data/workbench.ts 对齐） ───

export interface MetricCard {
  label: string
  value: string
  tone: StatusTone
  helper: string
}

export interface StageSummary {
  id: string
  name: string
  state: 'done' | 'current' | 'upcoming'
}

export interface WorkflowNodeSummary {
  id: string
  name: string
  role: string
  status: 'done' | 'running' | 'blocked' | 'queued'
  summary: string
  reason: string
  outputs: string[]
  confirmations: string[]
  tools: string[]
}

export interface TimelineEvent {
  id: string
  time: string
  title: string
  detail: string
  tone: StatusTone
}

export interface MemorySummary {
  id: string
  title: string
  detail: string
  source: string
}

export interface RiskSummary {
  id: string
  title: string
  detail: string
  level: 'low' | 'medium' | 'high'
}

// ─── 模型配置状态摘要 ───

/** 7 态模型配置状态（与 contracts.ts 对齐） */
export type ModelConfigStateWorkbench =
  | 'no_provider'
  | 'provider_missing_key'
  | 'no_model'
  | 'no_default_model'
  | 'not_tested'
  | 'test_failed'
  | 'ready'

/** 模型配置状态信息（前端增强版） */
export interface ModelConfigStatusInfo {
  state: ModelConfigStateWorkbench
  blockedReason: string | null
  hasProvider: boolean
  hasModel: boolean
  hasBinding: boolean
  defaultProvider: string | null
  defaultModel: string | null
  defaultProviderName: string | null
  defaultModelName: string | null
}

// ─── 工作流上下文原始结构（IPC 返回） ───

interface RawWorkflowNode {
  id?: string
  name?: string
  role?: string
  status?: string
  summary?: string
  reason?: string
  outputs?: string[]
  confirmations?: string[]
  tools?: string[]
  blocked?: boolean
  blockedReason?: string
}

interface RawNodeState {
  nodeId: string
  nodeName: string
  state: string
  role: string
}

interface WorkflowContext {
  taskId?: string
  workflowId?: string
  currentNodeName?: string
  workflow?: { nodes?: RawWorkflowNode[] }
  nodeStates?: RawNodeState[]
  nodes?: RawWorkflowNode[]
}

// ─── 记忆系统原始结构（IPC 返回） ───

interface RawMemoryStateEntry {
  category: string
  items: Array<{ text: string; rememberedAt: string }>
}

interface RawMemoryQueryResult {
  shared: RawMemoryStateEntry[]
  roleLocal: RawMemoryStateEntry[]
}

// ─── Composable ───

export function useWorkbenchData() {
  const api = window.agentAPI
  const { setActiveWorkspace: setGlobalWorkspace } = useActiveWorkspace()

  // ─── 基础状态 ───
  const workspaces = ref<WorkspaceInfo[]>([])
  const activeWorkspace = ref<WorkspaceInfo | null>(null)
  const conversations = ref<ConversationInfo[]>([])
  const activeConversation = ref<ConversationInfo | null>(null)
  const activeTask = ref<TaskInfo | null>(null)
  const artifacts = ref<ArtifactInfo[]>([])
  const traceEvents = ref<TraceEvent[]>([])
  const workflows = ref<WorkflowInfo[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // ─── 新增状态 ───
  const metrics = ref<MetricCard[]>([])
  const stages = ref<StageSummary[]>([])
  const workflowNodes = ref<WorkflowNodeSummary[]>([])
  const memories = ref<MemorySummary[]>([])
  const risks = ref<RiskSummary[]>([])
  const modelConfigStatus = ref<ModelConfigStatusInfo | null>(null)

  // ─── 任务草案状态 ───
  const taskDraft = ref<TaskDraft | null>(null)

  // ─── Timeline computed（格式转换 traceEvents → TimelineEvent） ───

  const timeline = computed<TimelineEvent[]>(() => {
    return traceEvents.value.map((ev) => {
      const tone = resolveTraceTone(ev.eventType)
      const timeStr = ev.timestamp
        ? new Date(ev.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : ''
      return {
        id: ev.id,
        time: timeStr,
        title: ev.dataName || ev.eventType,
        detail: ev.summary,
        tone,
      }
    })
  })

  function resolveTraceTone(eventType: string): StatusTone {
    const t = (eventType ?? '').toLowerCase()
    if (t.includes('error') || t.includes('fail') || t.includes('blocked')) return 'danger'
    if (t.includes('warn') || t.includes('block')) return 'warning'
    if (t.includes('complete') || t.includes('success') || t.includes('done')) return 'success'
    if (t.includes('start') || t.includes('begin') || t.includes('create')) return 'info'
    return 'neutral'
  }

  // ─── 工作区 ───

  async function loadWorkspaces() {
    loading.value = true
    error.value = null
    try {
      const result = await api.listWorkspaces()
      if (result.ok && result.data) {
        const index = result.data as { workspaces: Array<{ id: string; name: string; rootPath: string }> }
        workspaces.value = (index.workspaces ?? []).map(w => ({
          id: w.id,
          name: w.name,
          rootPath: w.rootPath,
          status: 'active',
          activeRunId: null,
        }))
        if (workspaces.value.length > 0 && !activeWorkspace.value) {
          await selectWorkspace(workspaces.value[0])
        }
      }
    } catch (e) {
      error.value = `Failed to load workspaces: ${e}`
    } finally {
      loading.value = false
    }
  }

  async function selectWorkspace(workspace: WorkspaceInfo) {
    activeWorkspace.value = workspace
    // 同步到全局共享状态
    setGlobalWorkspace(workspace.rootPath, workspace.id, workspace.name)
    await loadConversations(workspace.rootPath)
    await loadWorkflows(workspace.rootPath)
    // 模型配置状态从应用级 API 获取，无需 rootPath
    await loadModelConfigStatus()
  }

  async function createWorkspace(rootPath: string, name?: string) {
    const result = await api.createWorkspace(rootPath, name)
    if (result.ok && result.data) {
      await loadWorkspaces()
    }
    return result
  }

  // ─── 会话 ───

  async function loadConversations(rootPath: string) {
    conversations.value = []

    try {
      // 通过 IPC 获取会话 ID 列表
      const listResult = await api.listConversations(rootPath)
      if (listResult.ok && listResult.data) {
        const ids: string[] = listResult.data

        if (ids.length > 0) {
          // 逐个加载会话详情
          const results = await Promise.allSettled(
            ids.map((cid) => api.getConversation(rootPath, cid))
          )
          const loaded: ConversationInfo[] = []
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value.ok && r.value.data) {
              const conv = r.value.data as ConversationInfo
              loaded.push({
                id: conv.id,
                title: conv.title ?? '',
                taskType: conv.taskType ?? '',
                status: conv.status ?? 'active',
                currentTaskId: conv.currentTaskId ?? null,
                currentWorkflowId: conv.currentWorkflowId ?? null,
                currentNodeName: conv.currentNodeName ?? null,
                taskDomain: conv.taskDomain ?? null,
              })
            }
          }
          conversations.value = loaded.filter((conv) => conv.status !== 'closed')

          // 自动选中第一条会话
          if (conversations.value.length > 0 && !activeConversation.value) {
            activeConversation.value = conversations.value[0]
            const taskId = conversations.value[0].currentTaskId
            if (taskId) {
              await loadTask(rootPath, taskId)
              await loadArtifacts(rootPath, taskId)
              await loadWorkflowContext(taskId)
            }
            await loadTraceSummary(rootPath, loaded[0].id)
            await loadMemories(rootPath, loaded[0].id)
          }
        }
      }
    } catch (e) {
      // 无法加载会话列表时静默失败，等待用户手动创建
      console.warn('[useWorkbenchData] loadConversations failed:', e)
    }
  }

  async function createConversation(rootPath: string, title: string, taskType: string, taskDomain?: string) {
    const result = await api.createConversation(rootPath, title, taskType, taskDomain)
    if (result.ok && result.data) {
      const conv = result.data as ConversationInfo
      conversations.value.push(conv)
      activeConversation.value = conv
    }
    return result
  }

  async function closeConversation(rootPath: string, conversationId: string) {
    const result = await api.closeConversation(rootPath, conversationId)
    if (result.ok) {
      conversations.value = conversations.value.filter((conv) => conv.id !== conversationId)
      if (activeConversation.value?.id === conversationId) {
        activeConversation.value = conversations.value[0] ?? null
        activeTask.value = null
        artifacts.value = []
        traceEvents.value = []
        workflowNodes.value = []
        stages.value = []
        memories.value = []
        risks.value = []
        if (activeConversation.value?.currentTaskId) {
          await loadTask(rootPath, activeConversation.value.currentTaskId)
          await loadArtifacts(rootPath, activeConversation.value.currentTaskId)
          await loadWorkflowContext(activeConversation.value.currentTaskId)
          await loadTraceSummary(rootPath, activeConversation.value.id)
          await loadMemories(rootPath, activeConversation.value.id)
        }
      }
      computeMetrics()
    }
    return result
  }

  // ─── 任务 ───

  async function loadTask(rootPath: string, taskId: string) {
    const result = await api.getTaskRuntime(rootPath, taskId)
    if (result.ok && result.data) {
      activeTask.value = result.data as TaskInfo
      // 任务加载后重新计算指标和风险
      computeMetrics()
      loadRisks()
    }
    return result
  }

  // ─── 产物 ───

  async function loadArtifacts(rootPath: string, taskId: string) {
    const result = await api.listArtifactsByTask(rootPath, taskId)
    if (result.ok && result.data) {
      artifacts.value = result.data as ArtifactInfo[]
      computeMetrics()
    }
    return result
  }

  // ─── Trace ───

  async function loadTraceSummary(rootPath: string, conversationId: string) {
    const result = await api.readTraceSummary(rootPath, conversationId)
    if (result.ok && result.data) {
      traceEvents.value = result.data as TraceEvent[]
      computeMetrics()
    }
    return result
  }

  // ─── Workflow ───

  async function loadWorkflows(rootPath: string) {
    const result = await api.listAllWorkflows(rootPath)
    if (result.ok && result.data) {
      workflows.value = result.data as WorkflowInfo[]
    }
    return result
  }

  // ─── 工作流上下文（阶段 + 节点） ───

  async function loadWorkflowContext(taskId: string) {
    const result = await api.getWorkflowContext(taskId)
    if (result.ok && result.data) {
      const ctx = result.data as WorkflowContext
      const rawNodes: RawWorkflowNode[] = ctx.nodes ?? ctx.workflow?.nodes ?? []
      const nodeStateById = new Map((ctx.nodeStates ?? []).map((state) => [state.nodeId, state]))

      // 构建 workflowNodes
      workflowNodes.value = rawNodes.map((n, idx) => ({
        id: n.id ?? `node_${idx}`,
        name: n.name ?? '',
        role: n.role ?? '',
        status: normalizeNodeStatus(n, nodeStateById.get(n.id ?? '')),
        summary: n.summary ?? '',
        reason: n.reason ?? n.blockedReason ?? '',
        outputs: n.outputs ?? [],
        confirmations: n.confirmations ?? [],
        tools: n.tools ?? [],
      }))

      // 从合并后的节点状态派生 stages，避免后端 nodeStates 已变化但页面仍显示旧模板状态。
      stages.value = deriveStages(workflowNodes.value, ctx.currentNodeName)

      computeMetrics()
    }
    return result
  }

  // ─── 恢复/继续入口 ───

  /**
   * 判断当前选中会话是否可恢复
   * 条件：有活跃会话 && 有工作流上下文（有节点且状态非 done/全部 completed）
   */
  const canResume = computed(() => {
    const conv = activeConversation.value
    if (!conv) return false
    // 有 currentTaskId 且任务状态不是 done
    const task = activeTask.value
    if (!task) return false
    if (task.status === 'done') return false
    // 有工作流上下文（至少一个节点存在且状态可恢复）
    if (workflowNodes.value.length === 0) return false
    // 有 blocked 或 running 节点
    const hasResumable = workflowNodes.value.some(n => n.status === 'running' || n.status === 'blocked')
    return hasResumable
  })

  /**
   * 恢复/继续指定会话的工作流
   * 成功后刷新工作流上下文和节点状态
   */
  async function resumeTask() {
    const rootPath = activeWorkspace.value?.rootPath
    const conversationId = activeConversation.value?.id
    if (!rootPath || !conversationId) return

    const result = await api.resumeTask(rootPath, conversationId)
    if (result.ok && result.data) {
      const taskId = activeTask.value?.id
      if (taskId) {
        await loadWorkflowContext(taskId)
        await loadTask(rootPath, taskId)
      }
    }
    return result
  }

  function normalizeNodeStatus(n: RawWorkflowNode, nodeState?: RawNodeState): WorkflowNodeSummary['status'] {
    const s = nodeState?.state?.toLowerCase() ?? (n.status ?? '').toLowerCase()
    if (s === 'done' || s === 'completed') return 'done'
    if (s === 'running' || s === 'active' || s === 'in_progress') return 'running'
    if (s === 'blocked' || n.blocked) return 'blocked'
    return 'queued'
  }

  function deriveStages(nodes: WorkflowNodeSummary[], currentNodeName?: string): StageSummary[] {
    let passedCurrent = false
    return nodes.map((n, idx) => {
      const name = n.name || `Stage ${idx + 1}`
      const status = n.status
      let state: StageSummary['state']

      if (status === 'done') {
        state = 'done'
      } else if (
        status === 'running' ||
        status === 'blocked' ||
        name === currentNodeName
      ) {
        state = 'current'
        passedCurrent = true
      } else {
        state = passedCurrent ? 'upcoming' : 'done'
      }

      return { id: n.id || `stage_${idx}`, name, state }
    })
  }

  // ─── 指标 ───

  function computeMetrics() {
    const task = activeTask.value
    const metricList: MetricCard[] = []

    // 运行状态
    if (task) {
      const statusMap: Record<string, { tone: StatusTone; label: string }> = {
        running: { tone: 'success', label: '运行中' },
        blocked: { tone: 'danger', label: '已阻塞' },
        done: { tone: 'neutral', label: '已完成' },
        pending: { tone: 'info', label: '等待中' },
      }
      const s = statusMap[task.status] ?? { tone: 'neutral' as StatusTone, label: task.status }
      metricList.push({
        label: '运行状态',
        value: s.label,
        tone: s.tone,
        helper: task.blockedReason
          ? `阻塞原因：${task.blockedReason}`
          : '任务正在执行中。',
      })

      // 当前节点
      metricList.push({
        label: '当前步骤',
        value: task.currentNodeName || '—',
        tone: 'info',
        helper: task.workflowId ? `工作流：${task.workflowId}` : '未绑定工作流。',
      })
    } else {
      metricList.push({
        label: '运行状态',
        value: '空闲',
        tone: 'neutral',
        helper: '暂无活跃任务。',
      })
    }

    // 产出物数量
    metricList.push({
      label: '产出物',
      value: String(artifacts.value.length),
      tone: 'neutral',
      helper:
        artifacts.value.length > 0
          ? `${artifacts.value.filter((a) => a.status === 'updated').length} 个本次更新。`
          : '暂无产出物。',
    })

    // 风险/阻塞标志
    const riskCount = risks.value.length
    const highRisks = risks.value.filter((r) => r.level === 'high').length
    metricList.push({
      label: '风险标记',
      value: String(riskCount),
      tone: highRisks > 0 ? 'danger' : riskCount > 0 ? 'warning' : 'neutral',
      helper:
        highRisks > 0
          ? `${highRisks} 个高优先级问题需要关注。`
          : riskCount > 0
          ? '检测到一些风险，建议审查。'
          : '暂无活跃风险。',
    })

    metrics.value = metricList
  }

  // ─── 记忆 ───

  async function loadMemories(rootPath: string, conversationId: string) {
    try {
      const result = await api.listMemories(rootPath, conversationId)
      if (result.ok && result.data) {
        const raw = result.data as RawMemoryQueryResult
        const entries: MemorySummary[] = []

        // 处理 shared 记忆
        for (const entry of raw.shared ?? []) {
          for (const item of entry.items) {
            entries.push({
              id: `shared_${entry.category}_${item.rememberedAt}`,
              title: entry.category,
              detail: item.text,
              source: 'shared',
            })
          }
        }

        // 处理 roleLocal 记忆
        for (const entry of raw.roleLocal ?? []) {
          for (const item of entry.items) {
            entries.push({
              id: `role_${entry.category}_${item.rememberedAt}`,
              title: entry.category,
              detail: item.text,
              source: 'role_local',
            })
          }
        }

        memories.value = entries
      }
    } catch (e) {
      console.warn('[useWorkbenchData] loadMemories failed:', e)
    }
  }

  // ─── 会话轮次结束处理 ───

  async function processTurnEnd(workspaceRootPath: string, conversationId: string, turnData: { userInput: string; agentOutput: string; context?: unknown }) {
    const result = await api.processTurnEnd(workspaceRootPath, conversationId, turnData)
    if (result.ok && result.data?.memorized) {
      // 记忆已写入，刷新记忆列表
      await loadMemories(workspaceRootPath, conversationId)
    }
    return result
  }

  // ─── 风险 ───

  function loadRisks() {
    const riskList: RiskSummary[] = []
    let idx = 0

    // 从 activeTask.blockedReason 派生
    const task = activeTask.value
    if (task?.blockedReason) {
      riskList.push({
        id: `risk_blocked_${idx++}`,
        title: '任务已阻塞',
        detail: task.blockedReason,
        level: 'high',
      })
    }

    // 从 workflowNodes 的 blocked 状态派生
    for (const node of workflowNodes.value) {
      if (node.status === 'blocked') {
        riskList.push({
          id: `risk_node_${node.id}`,
          title: `节点阻塞：${node.name}`,
          detail: node.reason || '节点执行已阻塞。',
          level: 'medium',
        })
      }
      // 有待确认项
      if (node.confirmations && node.confirmations.length > 0) {
        riskList.push({
          id: `risk_confirm_${node.id}`,
          title: `需要确认：${node.name}`,
          detail: node.confirmations[0],
          level: 'low',
        })
      }
    }

    risks.value = riskList
    // 风险更新后重新计算指标
    computeMetrics()
  }

  // ─── 模型配置状态 ───

  async function loadModelConfigStatus() {
    try {
      const [statusResult, stateResult] = await Promise.all([
        api.getAppModelConfigStatus(),
        api.getAppModelConfigState(),
      ])

      if (statusResult.ok && statusResult.data) {
        const statusData = statusResult.data as Omit<ModelConfigStatusInfo, 'state' | 'blockedReason'>
        modelConfigStatus.value = {
          ...statusData,
          state: 'no_provider',
          blockedReason: null,
        }
      }

      // 从 state API 获取细粒度状态（§15.2）
      if (stateResult.ok && stateResult.data) {
        const stateData = stateResult.data as { state: string; blockedReason: string | null }
        if (modelConfigStatus.value) {
          modelConfigStatus.value = {
            ...modelConfigStatus.value,
            state: (stateData.state as ModelConfigStateWorkbench) || modelConfigStatus.value.state,
            blockedReason: stateData.blockedReason ?? null,
          }
        }
      }
    } catch (e) {
      console.warn('[useWorkbenchData] loadModelConfigStatus failed:', e)
    }
  }

  // ─── 输入理解（仅理解，不启动任务） ───

  async function understandInput(rawInput: string) {
    const result = await api.understandInput(rawInput)
    if (result.ok && result.data) {
      taskDraft.value = {
        title: result.data.title,
        taskType: result.data.taskType,
        taskDomain: result.data.taskDomain,
        workflowId: result.data.workflowId,
        rawInput,
      }
    }
    return result
  }

  // ─── 确认草案并启动任务 ───

  async function confirmAndStart() {
    if (!activeWorkspace.value || !taskDraft.value) return
    const rootPath = activeWorkspace.value.rootPath
    const rawInput = taskDraft.value.rawInput
    const result = await api.understandAndStart(rootPath, rawInput)
    if (result.ok && result.data) {
      // 清除草案
      taskDraft.value = null
      // 刷新会话列表
      await loadConversations(rootPath)
      // 选中新创建的会话
      if (conversations.value.length > 0) {
        const newConv = conversations.value[conversations.value.length - 1]
        activeConversation.value = newConv
        const taskId = result.data.taskId
        if (taskId) {
          await loadTask(rootPath, taskId)
          await loadArtifacts(rootPath, taskId)
          await loadWorkflowContext(taskId)
        }
        await loadTraceSummary(rootPath, newConv.id)
        await loadMemories(rootPath, newConv.id)
      }
    }
    return result
  }

  // ─── 取消草案 ───

  function cancelDraft() {
    taskDraft.value = null
  }

  // ─── 输入理解 + 启动完整链路（保留原方法供直接调用） ───

  async function submitInput(rawInput: string) {
    if (!activeWorkspace.value) return
    const rootPath = activeWorkspace.value.rootPath
    const result = await api.understandAndStart(rootPath, rawInput)
    if (result.ok && result.data) {
      const started = result.data
      // 刷新会话列表
      await loadConversations(rootPath)
      // 按后端返回的 conversationId 精准选中新创建的会话
      const newConv = conversations.value.find((conv) => conv.id === started.conversationId)
      if (newConv) {
        activeConversation.value = newConv
        const taskId = started.taskId
        if (taskId) {
          await loadTask(rootPath, taskId)
          await loadArtifacts(rootPath, taskId)
          await loadWorkflowContext(taskId)
        }
        await loadTraceSummary(rootPath, newConv.id)
        await loadMemories(rootPath, newConv.id)
      }
    }
    return result
  }

  // ─── Workflow Runner ───

  async function startTaskWorkflow(input: {
    workspaceRootPath: string
    workspaceId: string
    conversationId: string
    taskDomain: string
    title: string
    operatorRole: string
  }) {
    return api.startTaskWorkflow(input)
  }

  async function advanceTaskWorkflow(workspaceRootPath: string, taskId: string) {
    return api.advanceTaskWorkflow({ workspaceRootPath, taskId })
  }

  async function completeTaskWorkflowNode(input: {
    workspaceRootPath: string
    taskId: string
    artifact?: {
      artifactType: string
      title: string
      format: 'markdown' | 'json' | 'jsonl'
      content: string
    }
    summary?: string
  }) {
    return api.completeTaskWorkflowNode(input)
  }

  async function blockTaskWorkflowNode(input: {
    workspaceRootPath: string
    taskId: string
    reason: string
    waitingFor?: string
  }) {
    return api.blockTaskWorkflowNode(input)
  }

  // ─── 初始化 ───

  onMounted(() => {
    loadWorkspaces()
  })

  return {
    // 基础状态
    workspaces,
    activeWorkspace,
    conversations,
    activeConversation,
    activeTask,
    artifacts,
    traceEvents,
    workflows,
    loading,
    error,
    // 新增状态
    metrics,
    stages,
    workflowNodes,
    memories,
    risks,
    modelConfigStatus,
    // computed
    timeline,
    // 基础方法
    loadWorkspaces,
    selectWorkspace,
    createWorkspace,
    loadConversations,
    createConversation,
    closeConversation,
    loadTask,
    loadArtifacts,
    loadTraceSummary,
    loadWorkflows,
    // 新增方法
    loadWorkflowContext,
    computeMetrics,
    loadMemories,
    loadRisks,
    loadModelConfigStatus,
    // Workflow Runner
    startTaskWorkflow,
    advanceTaskWorkflow,
    completeTaskWorkflowNode,
    blockTaskWorkflowNode,
    // 输入理解 + 启动
    submitInput,
    // 任务草案
    taskDraft,
    understandInput,
    confirmAndStart,
    cancelDraft,
    // 会话轮次结束 - 记忆系统
    processTurnEnd,
    // 恢复/继续入口
    canResume,
    resumeTask,
  }
}
