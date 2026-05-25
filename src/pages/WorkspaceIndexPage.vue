<script setup lang="ts">
// WorkspaceIndexPage.vue - 续作首页：回来后继续任务、处理阻塞、开始新任务
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'

interface RecentWorkspace {
  path: string
  name: string
  lastOpened: string
}

interface WorkspaceStat {
  conversationCount: number
  taskCount: number
  lastActivityAt: string | null
}

interface RecentTask {
  taskId: string
  title: string
  status: string
  lastUpdated: string
  currentNodeLabel: string
  conversationId: string
  workspaceRootPath: string
}

interface BlockedTask {
  taskId: string
  title: string
  blockReason: string
  blockedSince: string
  conversationId: string
  workspaceRootPath: string
}

const router = useRouter()

const recentWorkspaces = ref<RecentWorkspace[]>([])
const workspaceStats = ref<Record<string, WorkspaceStat>>({})
const recentTasks = ref<RecentTask[]>([])
const blockedTasks = ref<BlockedTask[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const hasWorkspaces = computed(() => recentWorkspaces.value.length > 0)
const hasRecentTasks = computed(() => recentTasks.value.length > 0)
const hasBlockedTasks = computed(() => blockedTasks.value.length > 0)

/** 状态标签：面向用户，不使用内部术语 */
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    running: '进行中',
    blocked: '已阻塞',
    queued: '排队中',
    done: '已完成',
    cancelled: '已取消',
  }
  return map[status] ?? status
}

/** 状态对应的样式类 */
function statusClass(status: string): string {
  const map: Record<string, string> = {
    running: 'status-running',
    blocked: 'status-blocked',
    queued: 'status-queued',
    done: 'status-done',
    cancelled: 'status-cancelled',
  }
  return map[status] ?? ''
}

function formatTime(iso?: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return '刚刚'
    if (diffMin < 60) return `${diffMin} 分钟前`
    const diffHour = Math.floor(diffMin / 60)
    if (diffHour < 24) return `${diffHour} 小时前`
    const diffDay = Math.floor(diffHour / 24)
    if (diffDay < 30) return `${diffDay} 天前`
    return d.toLocaleDateString('zh-CN')
  } catch {
    return '—'
  }
}

async function loadAllData() {
  loading.value = true
  error.value = null
  try {
    // 1. 加载最近工作区列表
    const result = await window.agentAPI.listRecentWorkspaces()
    if (result.ok && result.data) {
      recentWorkspaces.value = result.data
      // 并行加载每个工作区的统计信息和任务数据
      await Promise.all([
        loadAllStats(result.data),
        loadAllRecentTasks(result.data),
        loadAllBlockedTasks(result.data),
      ])
    } else if (!result.ok) {
      error.value = result.error?.message ?? '加载工作区列表失败'
    }
  } catch (e) {
    error.value = `加载失败: ${e}`
  } finally {
    loading.value = false
  }
}

async function loadAllStats(workspaces: RecentWorkspace[]) {
  const statsMap: Record<string, WorkspaceStat> = {}
  const results = await Promise.allSettled(
    workspaces.map(async (ws) => {
      const result = await window.agentAPI.getWorkspaceStats(ws.path)
      if (result.ok && result.data) {
        statsMap[ws.path] = result.data
      }
    }),
  )
  void results
  workspaceStats.value = statsMap
}

async function loadAllRecentTasks(workspaces: RecentWorkspace[]) {
  const allTasks: RecentTask[] = []
  const results = await Promise.allSettled(
    workspaces.map(async (ws) => {
      const result = await window.agentAPI.getRecentTasks(ws.path)
      if (result.ok && result.data) {
        allTasks.push(...result.data)
      }
    }),
  )
  void results
  // 按时间降序排列，取前 5 个
  recentTasks.value = allTasks
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 5)
}

async function loadAllBlockedTasks(workspaces: RecentWorkspace[]) {
  const allBlocked: BlockedTask[] = []
  const results = await Promise.allSettled(
    workspaces.map(async (ws) => {
      const result = await window.agentAPI.getBlockedTasks(ws.path)
      if (result.ok && result.data) {
        allBlocked.push(...result.data)
      }
    }),
  )
  void results
  blockedTasks.value = allBlocked
    .sort((a, b) => new Date(b.blockedSince).getTime() - new Date(a.blockedSince).getTime())
}

async function handleOpenWorkspace(ws: RecentWorkspace) {
  await window.agentAPI.saveRecentWorkspace(ws.path)
  router.push({ path: '/workbench', query: { rootPath: ws.path } })
}

async function handleOpenNewWorkspace() {
  const result = await window.agentAPI.selectWorkspace()
  if (result.ok && result.data) {
    const rootPath = result.data
    await window.agentAPI.saveRecentWorkspace(rootPath)
    router.push({ path: '/workbench', query: { rootPath } })
  }
}

/** 继续任务：跳转工作台并选中对应工作区和会话 */
function handleContinueTask(task: RecentTask) {
  router.push({
    path: '/workbench',
    query: { rootPath: task.workspaceRootPath, continueTaskId: task.taskId },
  })
}

/** 处理阻塞：跳转工作台 */
function handleUnblockTask(task: BlockedTask) {
  router.push({
    path: '/workbench',
    query: { rootPath: task.workspaceRootPath, continueTaskId: task.taskId },
  })
}

/** 开始新任务：跳转工作台聚焦输入框 */
async function handleStartNewTask() {
  // 如果有最近活跃的工作区，直接使用它
  const lastWs = recentWorkspaces.value[0]
  if (lastWs) {
    await window.agentAPI.saveRecentWorkspace(lastWs.path)
    router.push({ path: '/workbench', query: { rootPath: lastWs.path, focusInput: 'true' } })
  } else {
    // 没有工作区，先选择一个
    await handleOpenNewWorkspace()
  }
}

/** 获取工作区名称 */
function getWorkspaceName(rootPath: string): string {
  const ws = recentWorkspaces.value.find(w => w.path === rootPath)
  return ws?.name ?? rootPath.split(/[/\\]/).pop() ?? '未知工作区'
}

onMounted(() => {
  loadAllData()
})
</script>

<template>
  <div class="workspace-index">
    <header class="page-header">
      <div class="header-content">
        <h1>我的工作台</h1>
        <p class="subtitle">继续你的任务，或开始新的工作</p>
      </div>
      <button class="primary-button" type="button" @click="handleStartNewTask">
        开始新任务
      </button>
    </header>

    <div v-if="loading" class="status-overlay">
      <span class="eyebrow">加载中...</span>
    </div>

    <div v-else-if="error" class="status-overlay status-error">
      <span class="eyebrow">{{ error }}</span>
      <button class="secondary-button" type="button" @click="loadAllData">重试</button>
    </div>

    <template v-else>
      <!-- ── 继续上次任务 ── -->
      <section class="section-block">
        <div class="section-heading">
          <span class="section-icon">📋</span>
          <h2>继续上次任务</h2>
        </div>
        <div v-if="hasRecentTasks" class="task-list">
          <button
            v-for="task in recentTasks"
            :key="task.taskId"
            class="task-card glass-panel"
            type="button"
            @click="handleContinueTask(task)"
          >
            <div class="task-card-main">
              <strong class="task-title">{{ task.title }}</strong>
              <div class="task-meta">
                <span class="task-status" :class="statusClass(task.status)">
                  {{ statusLabel(task.status) }}
                </span>
                <span class="task-workspace">{{ getWorkspaceName(task.workspaceRootPath) }}</span>
                <span class="task-step">当前步骤：{{ task.currentNodeLabel }}</span>
              </div>
            </div>
            <div class="task-card-action">
              <span class="task-time">{{ formatTime(task.lastUpdated) }}</span>
              <span class="action-hint">继续 →</span>
            </div>
          </button>
        </div>
        <div v-else class="empty-section">
          <p>暂无进行中的任务</p>
          <button class="text-button" type="button" @click="handleStartNewTask">开始新任务</button>
        </div>
      </section>

      <!-- ── 需要处理 ── -->
      <section v-if="hasBlockedTasks" class="section-block section-block-warning">
        <div class="section-heading">
          <span class="section-icon">⚠️</span>
          <h2>需要处理</h2>
          <span class="badge badge-warning">{{ blockedTasks.length }}</span>
        </div>
        <div class="task-list">
          <button
            v-for="task in blockedTasks"
            :key="task.taskId"
            class="task-card task-card-blocked glass-panel"
            type="button"
            @click="handleUnblockTask(task)"
          >
            <div class="task-card-main">
              <strong class="task-title">{{ task.title }}</strong>
              <div class="task-meta">
                <span class="task-status status-blocked">已阻塞</span>
                <span class="task-workspace">{{ getWorkspaceName(task.workspaceRootPath) }}</span>
              </div>
              <p class="task-reason">阻塞原因：{{ task.blockReason }}</p>
            </div>
            <div class="task-card-action">
              <span class="task-time">{{ formatTime(task.blockedSince) }}</span>
              <span class="action-hint">处理 →</span>
            </div>
          </button>
        </div>
      </section>

      <!-- ── 开始新任务 ── -->
      <section class="section-block section-block-start">
        <button class="start-task-button glass-panel" type="button" @click="handleStartNewTask">
          <span class="start-icon">➕</span>
          <div class="start-text">
            <strong>开始新任务</strong>
            <p>描述你的需求，系统会帮你安排执行步骤</p>
          </div>
        </button>
      </section>

      <!-- ── 我的工作区 ── -->
      <section class="section-block">
        <div class="section-heading">
          <span class="section-icon">📁</span>
          <h2>我的工作区</h2>
        </div>
        <div v-if="hasWorkspaces" class="workspace-grid">
          <button
            v-for="ws in recentWorkspaces"
            :key="ws.path"
            class="workspace-card glass-panel"
            type="button"
            @click="handleOpenWorkspace(ws)"
          >
            <div class="card-header">
              <strong class="card-name">{{ ws.name }}</strong>
              <span class="card-time">{{ formatTime(ws.lastOpened) }}</span>
            </div>
            <p class="card-path">{{ ws.path }}</p>
            <div class="card-stats">
              <span v-if="workspaceStats[ws.path]" class="stat-item">
                {{ workspaceStats[ws.path].conversationCount }} 个会话
              </span>
              <span v-if="workspaceStats[ws.path]" class="stat-item">
                {{ workspaceStats[ws.path].taskCount }} 个任务
              </span>
              <span v-if="workspaceStats[ws.path]?.lastActivityAt" class="stat-item">
                最近活动: {{ formatTime(workspaceStats[ws.path].lastActivityAt) }}
              </span>
            </div>
          </button>

          <button class="workspace-card workspace-card-new" type="button" @click="handleOpenNewWorkspace">
            <div class="new-icon">+</div>
            <strong>打开新工作区</strong>
            <p>选择或创建工作区</p>
          </button>
        </div>
        <div v-else class="empty-section">
          <p>尚无工作区，选择一个目录开始工作</p>
          <button class="text-button" type="button" @click="handleOpenNewWorkspace">打开新工作区</button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.workspace-index {
  padding: 32px;
  max-width: 960px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
}

.header-content h1 {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 4px 0 0;
}

.primary-button {
  padding: 8px 20px;
  border-radius: 8px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #fff;
  background: var(--color-primary, #4f46e5);
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.primary-button:hover {
  opacity: 0.9;
}

.secondary-button {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.06);
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}

.secondary-button:hover {
  background: rgba(0, 0, 0, 0.1);
}

.text-button {
  background: none;
  border: none;
  color: var(--color-primary, #4f46e5);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
}

.text-button:hover {
  text-decoration: underline;
}

.status-overlay {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px;
  gap: 12px;
}

.status-error {
  color: var(--color-danger, #dc2626);
}

/* ── 通用 section block ── */

.section-block {
  margin-bottom: 28px;
}

.section-block-warning {
  background: rgba(245, 158, 11, 0.06);
  border-radius: 12px;
  padding: 16px;
  border: 1px solid rgba(245, 158, 11, 0.15);
}

.section-block-start {
  margin-bottom: 32px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-heading h2 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.section-icon {
  font-size: 1.125rem;
}

/* ── Task cards ── */

.task-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  width: 100%;
}

.task-card:hover {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.task-card-blocked {
  border-left: 3px solid #f59e0b;
}

.task-card-main {
  flex: 1;
  min-width: 0;
}

.task-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
  display: block;
  margin-bottom: 4px;
}

.task-meta {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.task-status {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 1px 8px;
  border-radius: 4px;
}

.status-running {
  color: #059669;
  background: rgba(5, 150, 105, 0.1);
}

.status-blocked {
  color: #d97706;
  background: rgba(217, 119, 6, 0.1);
}

.status-queued {
  color: #6366f1;
  background: rgba(99, 102, 241, 0.1);
}

.status-done {
  color: #6b7280;
  background: rgba(107, 114, 128, 0.1);
}

.status-cancelled {
  color: #9ca3af;
  background: rgba(156, 163, 175, 0.1);
}

.task-workspace {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.task-step {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.task-reason {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 4px 0 0;
}

.task-card-action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
  margin-left: 16px;
}

.task-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.action-hint {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-primary, #4f46e5);
  white-space: nowrap;
}

/* ── Start new task button ── */

.start-task-button {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 12px;
  background: rgba(79, 70, 229, 0.06);
  backdrop-filter: blur(20px);
  border: 1px dashed rgba(79, 70, 229, 0.3);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  width: 100%;
  color: inherit;
}

.start-task-button:hover {
  background: rgba(79, 70, 229, 0.1);
  border-color: rgba(79, 70, 229, 0.5);
}

.start-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.start-text strong {
  display: block;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--color-primary, #4f46e5);
  margin-bottom: 2px;
}

.start-text p {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0;
}

/* ── Workspace grid ── */

.workspace-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.workspace-card {
  display: flex;
  flex-direction: column;
  padding: 20px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.06);
  cursor: pointer;
  transition: all 0.2s;
  text-align: left;
  width: 100%;
}

.workspace-card:hover {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(0, 0, 0, 0.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.card-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary);
}

.card-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.card-path {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  margin: 0 0 12px;
  word-break: break-all;
  line-height: 1.4;
}

.card-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.stat-item {
  font-size: 0.75rem;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.04);
  padding: 2px 8px;
  border-radius: 4px;
}

.workspace-card-new {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 20px;
  border: 2px dashed rgba(0, 0, 0, 0.12);
  background: transparent;
  color: var(--text-secondary);
}

.workspace-card-new:hover {
  border-color: rgba(0, 0, 0, 0.24);
  color: var(--text-primary);
}

.new-icon {
  font-size: 1.5rem;
  font-weight: 300;
  color: var(--text-secondary);
}

.workspace-card-new strong {
  font-size: 0.875rem;
}

.workspace-card-new p {
  font-size: 0.75rem;
  margin: 0;
}

/* ── Badge ── */

.badge {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.4;
}

.badge-warning {
  color: #d97706;
  background: rgba(217, 119, 6, 0.12);
}

/* ── Empty section ── */

.empty-section {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
}

.empty-section p {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin: 0;
}

.eyebrow {
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}
</style>
