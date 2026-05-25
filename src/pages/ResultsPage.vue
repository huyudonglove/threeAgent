<script setup lang="ts">
// ResultsPage.vue - 任务总结页
// 选中结果后展示：已完成、产出、未完成、风险与技术债、推荐下一步

import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useActiveWorkspace } from '../composables/useActiveWorkspace'

const router = useRouter()
const api = window.agentAPI
const { activeWorkspaceRootPath, hasActiveWorkspace } = useActiveWorkspace()

// ─── 状态 ───

const loading = ref(false)
const error = ref<string | null>(null)

// 工作区 rootPath 来自全局共享状态
const workspaceRootPath = computed(() => activeWorkspaceRootPath.value)

// 结果列表
interface ResultEntry {
  id: string
  title: string
  taskId: string
  status: string
  createdAt: string
  updatedAt: string
}

const results = ref<ResultEntry[]>([])

// 选中结果详情
interface ResultDetail {
  index: {
    id: string
    title: string
    taskId: string
    status: string
    createdAt: string
    updatedAt: string
  }
  content: {
    taskId: string
    taskTitle: string
    taskDomain: string
    status: string
    completedScope: string[]
    unfinishedScope: string[]
    technicalDebt: string[]
    nextSuggestions: string[]
    artifactSummaries: Array<{
      artifactId: string
      artifactType: string
      title: string
      status: string
    }>
    generatedAt: string
  }
}

const activeResult = ref<ResultDetail | null>(null)
const activeResultId = ref('')

// 产物类型中文映射
const artifactTypeLabelMap: Record<string, string> = {
  RepositoryReviewResult: '仓库审查',
  ProductSpec: '产品说明',
  ProductSpecOutline: '产品大纲',
  ChangeImpactAnalysis: '变更分析',
  IterationTechnicalPlan: '技术方案',
  TechnicalDesignDocument: '技术设计',
  DevelopmentTaskPlan: '开发计划',
  TechnicalTaskBreakdown: '任务拆解',
  ImplementationSummary: '实现总结',
  SelfCheckResult: '自检结果',
  AcceptanceResult: '验收结果',
  ResultSummary: '结果摘要',
  ResearchRequirementFrame: '需求框定',
  SourceReviewMatrix: '信息源审查',
  ResearchReport: '调研报告',
  TechnicalRecommendation: '技术建议',
  NextActionProposal: '下一步建议',
}

// 状态标签映射
const statusLabelMap: Record<string, string> = {
  draft: '草稿',
  ready: '就绪',
  updated: '已更新',
  archived: '已归档',
  done: '已完成',
  running: '进行中',
  blocked: '已阻塞',
}

// ─── 操作 ───

async function loadResults() {
  const rootPath = workspaceRootPath.value
  if (!rootPath) return

  loading.value = true
  error.value = null
  try {
    const result = await api.listResultsByWorkspace(rootPath)
    if (result.ok && result.data) {
      const entries = result.data as ResultEntry[]
      results.value = entries.map(e => ({
        id: e.id,
        title: e.title,
        taskId: e.taskId,
        status: e.status,
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      }))
    }
  } catch (e) {
    error.value = `加载结果列表失败: ${e}`
  } finally {
    loading.value = false
  }
}

async function selectResult(resultId: string) {
  const rootPath = workspaceRootPath.value
  if (!rootPath) return

  activeResultId.value = resultId
  try {
    const result = await api.loadResult(rootPath, resultId)
    if (result.ok && result.data) {
      activeResult.value = result.data as ResultDetail
    }
  } catch (e) {
    error.value = `加载结果详情失败: ${e}`
  }
}

function handleContinueFromResult(result: ResultDetail) {
  const firstSuggestion = result.content.nextSuggestions[0] ?? ''
  const prefillText = `基于任务「${result.content.taskTitle}」的结果继续: ${firstSuggestion}`
  router.push({
    path: '/workbench',
    query: {
      continueFrom: result.index.id,
      continueTaskId: result.content.taskId,
      continueTitle: prefillText,
    },
  })
}

function handleContinueFromSuggestion(result: ResultDetail, suggestion: string) {
  const prefillText = `基于任务「${result.content.taskTitle}」的结果继续: ${suggestion}`
  router.push({
    path: '/workbench',
    query: {
      continueFrom: result.index.id,
      continueTaskId: result.content.taskId,
      continueTitle: prefillText,
    },
  })
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

// ─── 监听全局工作区变化自动刷新 ───

watch(activeWorkspaceRootPath, (newRootPath) => {
  if (newRootPath) {
    loadResults()
  } else {
    results.value = []
    activeResult.value = null
    activeResultId.value = ''
  }
})

// ─── 初始化 ───

onMounted(() => {
  if (hasActiveWorkspace.value) {
    loadResults()
  }
})
</script>

<template>
  <div class="results-page">
    <div class="ambient ambient-left"></div>
    <div class="ambient ambient-right"></div>

    <header class="results-header glass-panel">
      <div>
        <p class="eyebrow">任务总结</p>
        <h1>任务总结</h1>
        <p class="header-copy">
          回顾任务完成情况、产出物、遗留风险，并决定下一步行动。
        </p>
      </div>

      <div class="header-actions">
        <button
          class="secondary-button"
          type="button"
          :disabled="loading"
          @click="loadResults"
        >刷新</button>
      </div>
    </header>

    <main class="results-shell">
      <!-- Loading / Error overlay -->
      <div v-if="loading && results.length === 0" class="status-overlay">
        <span class="eyebrow">加载中...</span>
      </div>
      <div v-else-if="error" class="status-overlay status-error">
        <span class="eyebrow">{{ error }}</span>
      </div>

      <!-- 无工作区提示 -->
      <div v-if="!workspaceRootPath && !loading" class="empty-state glass-panel">
        <p class="eyebrow">未选择工作区</p>
        <p>请先在工作台中选择一个工作区，任务总结将自动加载。</p>
        <button class="primary-button" type="button" @click="router.push('/workbench')">
          前往工作台
        </button>
      </div>

      <!-- 左侧：结果列表 -->
      <aside v-if="workspaceRootPath" class="results-list-panel glass-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">历史结果</p>
            <h3>已完成的任务结果</h3>
          </div>
          <span class="badge badge-neutral">{{ results.length }} 条</span>
        </div>

        <div v-if="results.length === 0 && !loading" class="empty-hint">
          <p>暂无任务结果。完成任务后，结果将自动沉淀到此处。</p>
        </div>

        <button
          v-for="r in results"
          :key="r.id"
          class="result-card"
          :class="{ 'is-active': r.id === activeResultId }"
          type="button"
          @click="selectResult(r.id)"
        >
          <div class="result-card-head">
            <strong>{{ r.title }}</strong>
            <span class="badge" :class="`badge-${r.status}`">
              {{ statusLabelMap[r.status] ?? r.status }}
            </span>
          </div>
          <div class="result-card-meta">
            <span class="meta-inline">{{ formatDate(r.createdAt) }}</span>
          </div>
        </button>
      </aside>

      <!-- 右侧：任务总结 -->
      <section v-if="workspaceRootPath" class="results-detail-panel">
        <!-- 无选中结果 -->
        <article v-if="!activeResult" class="detail-placeholder glass-panel">
          <p class="eyebrow">选择结果</p>
          <p>点击左侧结果条目，查看任务总结。</p>
        </article>

        <!-- 任务总结 -->
        <template v-else>
          <!-- 标题区 -->
          <article class="detail-hero glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">任务总结</p>
                <h2>{{ activeResult.content.taskTitle }}</h2>
              </div>
              <div class="heading-badges">
                <span class="badge" :class="`badge-${activeResult.content.status}`">
                  {{ statusLabelMap[activeResult.content.status] ?? activeResult.content.status }}
                </span>
                <span class="badge badge-info">{{ activeResult.content.taskDomain }}</span>
              </div>
            </div>

            <div class="detail-meta-grid">
              <div class="meta-chip">
                <span>任务 ID</span>
                <strong>{{ activeResult.content.taskId }}</strong>
              </div>
              <div class="meta-chip">
                <span>生成时间</span>
                <strong>{{ formatDate(activeResult.content.generatedAt) }}</strong>
              </div>
            </div>
          </article>

          <!-- ✅ 已完成 -->
          <article class="detail-section glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">✅ 已完成</p>
                <h3>本次完成了什么</h3>
              </div>
              <span class="badge badge-success">{{ activeResult.content.completedScope.length }}</span>
            </div>
            <ul class="detail-list" v-if="activeResult.content.completedScope.length > 0">
              <li v-for="(item, idx) in activeResult.content.completedScope" :key="idx">{{ item }}</li>
            </ul>
            <p v-else class="meta-inline">无已完成范围</p>
          </article>

          <!-- 📦 产出 -->
          <article class="detail-section glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">📦 产出</p>
                <h3>生成了哪些产出</h3>
              </div>
              <span class="badge badge-neutral">{{ activeResult.content.artifactSummaries.length }}</span>
            </div>
            <div v-if="activeResult.content.artifactSummaries.length > 0" class="artifact-grid">
              <div
                v-for="a in activeResult.content.artifactSummaries"
                :key="a.artifactId"
                class="artifact-chip"
              >
                <strong>{{ a.title }}</strong>
                <span class="meta-inline">{{ artifactTypeLabelMap[a.artifactType] ?? a.artifactType }}</span>
                <span class="badge" :class="`badge-${a.status}`">
                  {{ statusLabelMap[a.status] ?? a.status }}
                </span>
              </div>
            </div>
            <p v-else class="meta-inline">暂无产出</p>
          </article>

          <!-- ⏳ 未完成 -->
          <article v-if="activeResult.content.unfinishedScope.length > 0" class="detail-section glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">⏳ 未完成</p>
                <h3>尚未完成的范围</h3>
              </div>
              <span class="badge badge-warning">{{ activeResult.content.unfinishedScope.length }}</span>
            </div>
            <ul class="detail-list">
              <li v-for="(item, idx) in activeResult.content.unfinishedScope" :key="idx">{{ item }}</li>
            </ul>
          </article>

          <!-- ⚠️ 风险与技术债 -->
          <article v-if="activeResult.content.technicalDebt.length > 0" class="detail-section glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">⚠️ 风险与技术债</p>
                <h3>识别到的问题</h3>
              </div>
              <span class="badge badge-danger">{{ activeResult.content.technicalDebt.length }}</span>
            </div>
            <ul class="detail-list">
              <li v-for="(item, idx) in activeResult.content.technicalDebt" :key="idx">{{ item }}</li>
            </ul>
          </article>

          <!-- 💡 推荐下一步 -->
          <article v-if="activeResult.content.nextSuggestions.length > 0" class="detail-section glass-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">💡 推荐下一步</p>
                <h3>建议的后续行动</h3>
              </div>
            </div>
            <ul class="suggestion-list">
              <li v-for="(item, idx) in activeResult.content.nextSuggestions" :key="idx" class="suggestion-item">
                <span class="suggestion-text">{{ item }}</span>
                <button
                  class="suggestion-action"
                  type="button"
                  @click="handleContinueFromSuggestion(activeResult!, item)"
                >基于此继续</button>
              </li>
            </ul>
          </article>

          <!-- 主操作按钮 -->
          <article class="detail-actions glass-panel">
            <button
              class="action-btn action-advance"
              type="button"
              @click="handleContinueFromResult(activeResult!)"
            >基于此结果继续</button>
            <p class="action-hint">跳转到工作台，预填"基于任务 {{ activeResult.content.taskTitle }} 的结果继续"</p>
          </article>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.results-page {
  min-height: 100vh;
  padding: 0 24px 48px;
  position: relative;
  overflow: hidden;
}

/* Ambient gradients */
.ambient {
  position: fixed;
  pointer-events: none;
  border-radius: 50%;
  filter: blur(120px);
  z-index: 0;
}
.ambient-left {
  width: 620px;
  height: 620px;
  top: -180px;
  left: -160px;
  background: rgba(140, 184, 255, 0.18);
}
.ambient-right {
  width: 480px;
  height: 480px;
  bottom: -120px;
  right: -80px;
  background: rgba(255, 213, 170, 0.16);
}

/* Glass panel */
.glass-panel {
  background: var(--surface-base);
  backdrop-filter: blur(24px);
  border: 1px solid var(--border-soft);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
}

/* Header */
.results-header {
  position: relative;
  z-index: 1;
  padding: 24px 28px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
}

.results-header h1 {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 4px 0 0;
}

.header-copy {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin-top: 4px;
  max-width: 520px;
}

.header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.secondary-button {
  padding: 7px 18px;
  border-radius: 10px;
  border: 1px solid var(--border-soft);
  background: var(--surface-muted);
  color: var(--text-primary);
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.secondary-button:hover { background: var(--surface-active); }
.secondary-button:disabled { opacity: 0.4; cursor: not-allowed; }

.primary-button {
  padding: 7px 18px;
  border-radius: 10px;
  border: none;
  background: var(--accent-blue);
  color: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.primary-button:hover { opacity: 0.88; }
.primary-button:disabled { opacity: 0.4; cursor: not-allowed; }

/* Shell layout */
.results-shell {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  min-height: 600px;
}

/* Status overlay */
.status-overlay {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
  color: var(--text-tertiary);
}
.status-error { color: var(--accent-red); }

/* Empty state */
.empty-state {
  grid-column: 1 / -1;
  padding: 48px 32px;
  text-align: center;
  color: var(--text-secondary);
}
.empty-state p { margin: 8px 0; }

/* Section heading */
.section-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.section-heading h3 {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 2px 0 0;
}

/* Eyebrow */
.eyebrow {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  margin: 0;
}

/* Badges */
.badge {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.6875rem;
  font-weight: 600;
}
.badge-neutral { background: rgba(0,0,0,0.05); color: var(--text-secondary); }
.badge-info { background: rgba(47,111,237,0.1); color: var(--accent-blue); }
.badge-success { background: rgba(31,157,102,0.1); color: var(--accent-green); }
.badge-warning { background: rgba(200,139,23,0.1); color: var(--accent-amber); }
.badge-danger { background: rgba(197,83,73,0.1); color: var(--accent-red); }
.badge-draft { background: rgba(0,0,0,0.05); color: var(--text-secondary); }
.badge-ready { background: rgba(31,157,102,0.1); color: var(--accent-green); }
.badge-updated { background: rgba(47,111,237,0.1); color: var(--accent-blue); }
.badge-archived { background: rgba(107,125,148,0.1); color: var(--accent-slate); }
.badge-done { background: rgba(31,157,102,0.1); color: var(--accent-green); }
.badge-running { background: rgba(47,111,237,0.1); color: var(--accent-blue); }
.badge-blocked { background: rgba(197,83,73,0.1); color: var(--accent-red); }

.meta-inline {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}

/* Left panel: results list */
.results-list-panel {
  padding: 20px;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}

.empty-hint {
  padding: 24px 16px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  text-align: center;
}

.result-card {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid transparent;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 4px;
}
.result-card:hover {
  background: var(--surface-muted);
  border-color: var(--border-soft);
}
.result-card.is-active {
  background: var(--surface-active);
  border-color: var(--accent-blue);
}

.result-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
.result-card-head strong {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-card-meta {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

/* Right panel: detail */
.results-detail-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  max-height: calc(100vh - 200px);
}

.detail-placeholder {
  padding: 48px 32px;
  text-align: center;
  color: var(--text-secondary);
}
.detail-placeholder p { margin: 8px 0; }

.detail-hero {
  padding: 20px 24px;
}
.detail-hero h2 {
  font-size: 1.125rem;
  font-weight: 700;
  margin: 4px 0 8px;
}
.heading-badges {
  display: flex;
  gap: 6px;
}

.detail-meta-grid {
  display: flex;
  gap: 16px;
  margin-top: 12px;
}

.meta-chip {
  padding: 8px 14px;
  border-radius: 10px;
  background: var(--surface-muted);
}
.meta-chip span {
  display: block;
  font-size: 0.6875rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 2px;
}
.meta-chip strong {
  font-size: 0.8125rem;
  color: var(--text-primary);
}

.detail-section {
  padding: 16px 20px;
}

.detail-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.detail-list li {
  padding: 6px 0;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  font-size: 0.8125rem;
  color: var(--text-primary);
}
.detail-list li:last-child { border-bottom: none; }

.artifact-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.artifact-chip {
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--surface-muted);
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8125rem;
}
.artifact-chip strong {
  font-weight: 600;
}

/* Suggestion list */
.suggestion-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.suggestion-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  gap: 12px;
}
.suggestion-item:last-child { border-bottom: none; }

.suggestion-text {
  font-size: 0.8125rem;
  color: var(--text-primary);
  flex: 1;
}

.suggestion-action {
  padding: 4px 12px;
  border-radius: 8px;
  border: 1px solid var(--accent-blue);
  background: transparent;
  color: var(--accent-blue);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
  flex-shrink: 0;
}
.suggestion-action:hover {
  background: var(--accent-blue);
  color: #fff;
}

/* Actions */
.detail-actions {
  padding: 20px 24px;
  text-align: center;
}

.action-btn {
  padding: 10px 28px;
  border-radius: 12px;
  border: none;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  color: #fff;
}

.action-advance {
  background: var(--accent-blue);
}
.action-advance:hover { opacity: 0.88; }

.action-hint {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 8px;
}
</style>
