<script setup lang="ts">
// PluginManagePage.vue - 插件管理页面
// T23 插件管理页与确认闭环

import { ref, onMounted, computed } from 'vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import FormDialog from '../components/FormDialog.vue'
import type { FormField } from '../components/FormDialog.vue'

const api = window.agentAPI

// ─── 类型 ───

interface PluginRecord {
  id: string
  pluginId: string
  pluginType: 'workflow' | 'role' | 'skill'
  pluginName: string
  status: string
  domain?: string
  version?: string
  enabledAt: string | null
  disabledAt: string | null
  enabledBy: string
  reason: string
  affectedObjectIds: string[]
  createdAt: string
  updatedAt: string
}

interface ImpactItem {
  objectType: string
  objectId: string
  impactType: string
  description: string
  severity: 'info' | 'warning' | 'error'
}

interface ImpactPreview {
  pluginId: string
  pluginType: string
  pluginName: string
  action: string
  canProceed: boolean
  requiresConfirmation: boolean
  impacts: ImpactItem[]
  summary: string
}

// ─── 状态 ───

const plugins = ref<PluginRecord[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const selectedPluginId = ref<string | null>(null)
const configJson = ref('')
const configEditing = ref(false)

// ─── ConfirmDialog 状态 ───

interface ConfirmState {
  visible: boolean
  title: string
  message: string
  danger: boolean
  onConfirm: () => void
}

const confirmDialog = ref<ConfirmState>({
  visible: false,
  title: '',
  message: '',
  danger: false,
  onConfirm: () => {},
})

function openConfirm(title: string, message: string, onConfirm: () => void, danger = false) {
  confirmDialog.value = { visible: true, title, message, danger, onConfirm }
}

// ─── FormDialog 状态（添加插件） ───

const showAddPlugin = ref(false)

const addPluginFields: FormField[] = [
  { key: 'pluginId', label: '插件 ID', type: 'text', required: true },
  { key: 'pluginName', label: '插件名称', type: 'text', required: true },
  { key: 'pluginType', label: '插件类型', type: 'select', required: true, options: ['workflow', 'role', 'skill'] },
  { key: 'version', label: '版本', type: 'text' },
  { key: 'domain', label: '领域', type: 'text' },
]

// ─── 计算属性 ───

const selectedPlugin = computed(() =>
  plugins.value.find(p => p.pluginId === selectedPluginId.value) ?? null,
)

const enabledCount = computed(() =>
  plugins.value.filter(p => p.status === 'enabled').length,
)

const typeLabelMap: Record<string, string> = {
  workflow: '工作流',
  role: '角色',
  skill: '技能',
}

// ─── 数据加载 ───

async function loadPlugins() {
  loading.value = true
  error.value = null
  try {
    const result = await api.listAppPlugins()
    if (result.ok && result.data) {
      plugins.value = result.data as PluginRecord[]
    } else if (!result.ok) {
      error.value = `加载插件列表失败: ${result.error?.message}`
    }
  } catch (e) {
    error.value = `加载插件列表失败: ${e}`
  } finally {
    loading.value = false
  }
}

// ─── 启用/禁用切换 ───

async function togglePlugin(plugin: PluginRecord, toEnabled: boolean) {
  if (toEnabled) {
    // 启用前预览影响
    const previewResult = await api.previewAppPluginImpact(
      plugin.pluginId, plugin.pluginType, 'enable',
    )
    if (previewResult.ok && previewResult.data) {
      const preview = previewResult.data as ImpactPreview
      if (preview.requiresConfirmation || preview.impacts.some(i => i.severity === 'warning')) {
        const impactList = preview.impacts
          .map(i => `[${i.severity}] ${i.description}`)
          .join('\n')
        openConfirm(
          '启用影响预览',
          `${preview.summary}\n\n${impactList || '无影响项'}\n\n确认启用此插件？`,
          async () => {
            await doEnablePlugin(plugin)
          },
        )
        return
      }
    }
    await doEnablePlugin(plugin)
  } else {
    // 禁用前预览影响
    const previewResult = await api.previewAppPluginImpact(
      plugin.pluginId, plugin.pluginType, 'disable',
    )
    if (previewResult.ok && previewResult.data) {
      const preview = previewResult.data as ImpactPreview
      if (!preview.canProceed) {
        const impactList = preview.impacts
          .map(i => `[${i.severity}] ${i.description}`)
          .join('\n')
        error.value = `无法禁用插件: ${impactList}`
        return
      }
      if (preview.requiresConfirmation) {
        const impactList = preview.impacts
          .map(i => `[${i.severity}] ${i.description}`)
          .join('\n')
        openConfirm(
          '禁用影响预览',
          `${preview.summary}\n\n${impactList || '无影响项'}\n\n确认禁用此插件？`,
          async () => {
            await doDisablePlugin(plugin)
          },
        )
        return
      }
    }
    await doDisablePlugin(plugin)
  }
}

async function doEnablePlugin(plugin: PluginRecord) {
  const now = new Date().toISOString()
  const result = await api.saveAppPlugin({
    id: `plugin_${Date.now()}`,
    pluginId: plugin.pluginId,
    pluginType: plugin.pluginType,
    pluginName: plugin.pluginName,
    status: 'enabled',
    domain: plugin.domain,
    version: plugin.version,
    enabledAt: now,
    disabledAt: null,
    enabledBy: 'user',
    reason: '手动启用插件',
    affectedObjectIds: [],
    createdAt: plugin.createdAt || now,
    updatedAt: now,
  })
  if (result.ok) {
    await loadPlugins()
  } else {
    error.value = `启用插件失败: ${result.error?.message}`
  }
}

async function confirmPendingPlugin(plugin: PluginRecord) {
  const result = await api.confirmAppPluginEnable(plugin.pluginId)
  if (result.ok) {
    await loadPlugins()
  } else {
    error.value = `确认启用失败: ${result.error?.message}`
  }
}

async function doDisablePlugin(plugin: PluginRecord) {
  const result = await api.removeAppPlugin(plugin.pluginId)
  if (result.ok) {
    if (selectedPluginId.value === plugin.pluginId) {
      selectedPluginId.value = null
    }
    await loadPlugins()
  } else {
    error.value = `禁用插件失败: ${result.error?.message}`
  }
}

// ─── 添加插件 ───

async function onAddPlugin(payload: Record<string, string>) {
  const now = new Date().toISOString()
  const result = await api.saveAppPlugin({
    id: `plugin_${Date.now()}`,
    pluginId: payload.pluginId,
    pluginType: payload.pluginType || 'skill',
    pluginName: payload.pluginName || payload.pluginId,
    status: 'enabled',
    version: payload.version || undefined,
    domain: payload.domain || undefined,
    enabledAt: now,
    disabledAt: null,
    enabledBy: 'user',
    reason: '手动添加插件',
    affectedObjectIds: [],
    createdAt: now,
    updatedAt: now,
  })
  if (result.ok) {
    await loadPlugins()
  } else {
    error.value = `添加插件失败: ${result.error?.message}`
  }
}

// ─── 删除插件 ───

function removePlugin(plugin: PluginRecord) {
  openConfirm(
    '删除插件',
    `确认删除插件「${plugin.pluginName}」(${plugin.pluginId})？此操作将禁用该插件。`,
    async () => {
      await doDisablePlugin(plugin)
    },
    true,
  )
}

// ─── 配置编辑 ───

function selectPlugin(pluginId: string) {
  selectedPluginId.value = pluginId
  configEditing.value = false
  const plugin = plugins.value.find(p => p.pluginId === pluginId)
  if (plugin) {
    configJson.value = JSON.stringify(plugin, null, 2)
  }
}

async function saveConfig() {
  if (!selectedPluginId.value) return
  try {
    const parsed = JSON.parse(configJson.value) as Record<string, unknown>
    const result = await api.updateAppPluginConfig(selectedPluginId.value, parsed)
    if (result.ok) {
      configEditing.value = false
      await loadPlugins()
      // 刷新选中插件的配置
      const updated = plugins.value.find(p => p.pluginId === selectedPluginId.value)
      if (updated) {
        configJson.value = JSON.stringify(updated, null, 2)
      }
    } else {
      error.value = `保存配置失败: ${result.error?.message}`
    }
  } catch (e) {
    error.value = `JSON 解析失败: ${e}`
  }
}

// ─── 冲突检查 ───

async function runConflictCheck() {
  const enabledPluginIds = plugins.value
    .filter(p => p.status === 'enabled')
    .map(p => p.pluginId)
  if (enabledPluginIds.length === 0) {
    error.value = '没有已启用的插件可供检查'
    return
  }
  const result = await api.appPluginConflictCheck(enabledPluginIds)
  if (result.ok && result.data) {
    const checks = result.data
    const issues: string[] = []
    for (const [id, check] of Object.entries(checks)) {
      const c = check as { canProceed: boolean; impacts: ImpactItem[] }
      if (!c.canProceed || c.impacts?.length > 0) {
        const details = c.impacts?.map((i: ImpactItem) => `  [${i.severity}] ${i.description}`).join('\n') ?? ''
        issues.push(`插件 ${id}:\n${details || '  无冲突'}`)
      }
    }
    if (issues.length > 0) {
      openConfirm('冲突检查结果', issues.join('\n\n'), () => {}, false)
    } else {
      openConfirm('冲突检查结果', '所有插件无冲突', () => {}, false)
    }
  } else if (!result.ok) {
    error.value = `冲突检查失败: ${result.error?.message}`
  }
}

// ─── 初始化 ───

onMounted(() => {
  loadPlugins()
})
</script>

<template>
  <ConfirmDialog
    v-model:visible="confirmDialog.visible"
    :title="confirmDialog.title"
    :message="confirmDialog.message"
    :danger="confirmDialog.danger"
    @confirm="confirmDialog.onConfirm()"
  />

  <FormDialog
    v-model:visible="showAddPlugin"
    title="添加插件"
    :fields="addPluginFields"
    submit-text="添加"
    @submit="onAddPlugin"
  />

  <div class="plugin-page">
    <header class="page-header glass-panel">
      <div>
        <p class="eyebrow">插件管理</p>
        <h1>插件管理</h1>
        <p>管理应用级插件库：启用、禁用、配置和冲突检查。
          <span class="hint-text">工作区级插件覆盖可在高级设置中配置。</span>
        </p>
      </div>
      <div class="header-stats">
        <span class="stat-badge badge-info">{{ plugins.length }} 个插件</span>
        <span class="stat-badge badge-success">{{ enabledCount }} 已启用</span>
      </div>
    </header>

    <div v-if="error" class="error-banner">
      <p>{{ error }}</p>
      <button type="button" @click="error = null">✕</button>
    </div>

    <div v-if="loading" class="loading-state">
      <p>加载中...</p>
    </div>

    <main v-else class="plugin-shell">
      <section class="plugin-list-section glass-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">已安装插件</p>
            <h3>插件列表</h3>
          </div>
          <div class="section-actions">
            <button class="secondary-button" type="button" @click="runConflictCheck">冲突检查</button>
            <button class="primary-button" type="button" @click="showAddPlugin = true">添加插件</button>
          </div>
        </div>

        <div v-if="plugins.length === 0" class="empty-state">
          <p>尚未安装任何插件。点击「添加插件」开始。</p>
        </div>

        <div class="plugin-cards">
          <div
            v-for="plugin in plugins"
            :key="plugin.pluginId"
            class="plugin-card"
            :class="{
              'is-selected': selectedPluginId === plugin.pluginId,
              'is-enabled': plugin.status === 'enabled',
              'is-pending': plugin.status === 'pending_confirmation',
            }"
            @click="selectPlugin(plugin.pluginId)"
          >
            <div class="plugin-card-head">
              <div class="plugin-card-info">
                <strong class="plugin-name">{{ plugin.pluginName }}</strong>
                <span class="plugin-id">{{ plugin.pluginId }}</span>
              </div>
              <label class="toggle-switch" @click.stop>
                <input
                  type="checkbox"
                  :checked="plugin.status === 'enabled'"
                  @change="togglePlugin(plugin, plugin.status !== 'enabled')"
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
            <div class="plugin-card-meta">
              <span class="plugin-type-badge" :class="`type-${plugin.pluginType}`">
                {{ typeLabelMap[plugin.pluginType] ?? plugin.pluginType }}
              </span>
              <span v-if="plugin.version" class="plugin-version">v{{ plugin.version }}</span>
              <span class="plugin-status-badge" :class="`status-${plugin.status}`">
                {{ plugin.status === 'enabled' ? '已启用' : plugin.status === 'pending_confirmation' ? '待确认' : plugin.status === 'disabled' ? '已禁用' : plugin.status }}
              </span>
            </div>
            <p v-if="plugin.domain" class="plugin-domain">领域: {{ plugin.domain }}</p>
            <div class="plugin-card-actions" @click.stop>
              <button
                v-if="plugin.status === 'pending_confirmation'"
                type="button"
                class="confirm-btn"
                @click="confirmPendingPlugin(plugin)"
              >
                确认启用
              </button>
              <button type="button" class="danger" @click="removePlugin(plugin)">删除</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 配置编辑区 -->
      <section v-if="selectedPlugin" class="config-section glass-panel">
        <div class="section-heading">
          <div>
            <p class="eyebrow">插件配置</p>
            <h3>{{ selectedPlugin.pluginName }} 配置</h3>
          </div>
          <div class="section-actions">
            <button v-if="!configEditing" class="primary-button" type="button" @click="configEditing = true">编辑</button>
            <template v-else>
              <button class="secondary-button" type="button" @click="configEditing = false; selectPlugin(selectedPluginId!)">取消</button>
              <button class="primary-button" type="button" @click="saveConfig">保存</button>
            </template>
          </div>
        </div>
        <div class="config-editor">
          <textarea
            v-model="configJson"
            class="config-textarea"
            :readonly="!configEditing"
            spellcheck="false"
          />
        </div>
      </section>

      <section v-else class="config-section glass-panel">
        <div class="empty-state">
          <p>选择一个插件查看配置</p>
        </div>
      </section>
    </main>

    <footer class="page-footer">
      <router-link to="/workbench" class="nav-link">← 返回工作台</router-link>
    </footer>
  </div>
</template>

<style scoped>
.plugin-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  max-width: 960px;
  margin: 0 auto;
}

.page-header {
  padding: 24px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.header-stats {
  display: flex;
  gap: 8px;
}

.stat-badge {
  padding: 4px 12px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
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

.loading-state {
  padding: 32px;
  text-align: center;
  color: var(--text-secondary);
}

.plugin-shell {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plugin-list-section,
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

.section-actions {
  display: flex;
  gap: 8px;
}

.empty-state {
  padding: 16px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.plugin-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.plugin-card {
  padding: 16px;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.2s, box-shadow 0.2s;
  background: white;
}

.plugin-card:hover {
  border-color: rgba(59, 130, 246, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.plugin-card.is-selected {
  border-color: rgba(59, 130, 246, 0.5);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.2);
}

.plugin-card.is-enabled {
  border-left: 3px solid #4caf50;
}

.plugin-card.is-pending {
  border-left: 3px solid #ff9800;
}

.plugin-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.plugin-card-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.plugin-name {
  font-size: 0.9375rem;
  color: #111;
}

.plugin-id {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-family: monospace;
}

.plugin-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.plugin-type-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 500;
  text-transform: uppercase;
}

.type-workflow {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
}

.type-role {
  background: rgba(139, 92, 246, 0.1);
  color: #7c3aed;
}

.type-skill {
  background: rgba(16, 185, 129, 0.1);
  color: #059669;
}

.plugin-version {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.plugin-status-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.6875rem;
  font-weight: 500;
}

.status-enabled {
  background: rgba(76, 175, 80, 0.1);
  color: #2e7d32;
}

.status-disabled {
  background: rgba(158, 158, 158, 0.1);
  color: #757575;
}

.status-pending_confirmation {
  background: rgba(255, 152, 0, 0.1);
  color: #e65100;
}

.plugin-domain {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.plugin-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.plugin-card-actions button {
  padding: 4px 10px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  background: white;
}

.plugin-card-actions button.confirm-btn {
  color: #2f6fed;
  border-color: rgba(47, 111, 237, 0.3);
}

.plugin-card-actions button.danger {
  color: #d32f2f;
  border-color: rgba(211, 47, 47, 0.3);
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  cursor: pointer;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  inset: 0;
  background: #ccc;
  border-radius: 22px;
  transition: background 0.3s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  left: 2px;
  bottom: 2px;
  width: 18px;
  height: 18px;
  background: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

.toggle-switch input:checked + .toggle-slider {
  background: #4caf50;
}

.toggle-switch input:checked + .toggle-slider::before {
  transform: translateX(18px);
}

/* Config Editor */
.config-editor {
  position: relative;
}

.config-textarea {
  width: 100%;
  min-height: 260px;
  padding: 12px;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
  background: #fafafa;
  color: #333;
  resize: vertical;
  outline: none;
  transition: border-color 0.2s;
}

.config-textarea:focus {
  border-color: #3b82f6;
  background: #fff;
}

.config-textarea[readonly] {
  background: #f5f5f5;
  color: #555;
  cursor: default;
}

.page-footer {
  padding: 16px 0;
}

.nav-link {
  color: var(--accent);
  text-decoration: none;
  font-size: 0.875rem;
}

.nav-link:hover {
  text-decoration: underline;
}

.primary-button {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  background: #3b82f6;
  color: #fff;
  border: none;
  transition: opacity 0.15s;
}

.primary-button:hover {
  opacity: 0.85;
}

.secondary-button {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  background: #f4f4f5;
  color: #444;
  border: 1px solid #e4e4e7;
  transition: opacity 0.15s;
}

.secondary-button:hover {
  opacity: 0.85;
}

.badge-info {
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
}

.badge-success {
  background: rgba(76, 175, 80, 0.1);
  color: #2e7d32;
}

.hint-text {
  font-size: 0.75rem;
  color: var(--text-secondary, #999);
  margin-left: 4px;
}
</style>
