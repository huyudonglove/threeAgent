import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { WorkspaceManager } from '../src-main/storage/workspace-manager'
import { ConversationRuntimeManager } from '../src-main/runtime/conversation-runtime-manager'
import { TaskRuntimeManager } from '../src-main/runtime/task-runtime-manager'
import { BackflowManager } from '../src-main/runtime/backflow-manager'
import { ModelProfileResolver } from '../src-main/model-config/model-profile-resolver'
import { ModelHealthCheckService } from '../src-main/model-config/model-health-check-service'
import { ArtifactService } from '../src-main/artifacts/artifact-service'
import { DisplayTraceService } from '../src-main/trace/display-trace-service'
import { WorkflowRegistry } from '../src-main/workflows/workflow-registry'
import { WorkflowRunner } from '../src-main/workflows/workflow-runner'
import { PluginConfigManager } from '../src-main/plugins/plugin-config-manager'
import { checkWorkflowPluginConflict, checkRolePluginConflict, checkDisableConflict } from '../src-main/plugins/plugin-conflict-check'
import { ModelConfigManager } from '../src-main/model-config/model-config-manager'
import { AgentMemoryService } from '../src-main/memory/agent-memory-service'
import { MemoryDecisionEngine } from '../src-main/memory/memory-decision-engine'
import { ResultPersistenceService } from '../src-main/results/result-persistence-service'
import { InputUnderstandingService } from '../src-main/runtime/input-understanding-service'
import type { TaskStatus } from '../src-main/contracts/types'
import type { ArtifactStatus } from '../src-main/contracts/types'
import { AppPathResolver } from '../src-main/storage/app-path-resolver'
import { ConfigMigrationService } from '../src-main/storage/config-migration'
import { err } from '../src-main/errors/result'
import { createError } from '../src-main/errors/unified-error'
import { getBuiltinProviderPresets } from '../src-main/model-config/provider-presets'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 应用级路径解析器（独立于工作区路径）
const appPathResolver = new AppPathResolver()
appPathResolver.ensureConfigDir()

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// ─── IPC Handler 注册 ───

const workspaceManager = new WorkspaceManager()
const conversationManager = new ConversationRuntimeManager()
const taskRuntimeManager = new TaskRuntimeManager()
const backflowManager = new BackflowManager()
const modelProfileResolver = new ModelProfileResolver()
const healthCheckService = new ModelHealthCheckService()
const artifactService = new ArtifactService()
const traceService = new DisplayTraceService()
const workflowRegistry = new WorkflowRegistry()
const workflowRunner = new WorkflowRunner(workflowRegistry)
// 延迟注入依赖（避免循环引用）
taskRuntimeManager.setWorkflowRunner(workflowRunner)
taskRuntimeManager.setConversationManager(conversationManager)
const pluginConfigManager = new PluginConfigManager(appPathResolver)
const modelConfigManager = new ModelConfigManager(appPathResolver)
const agentMemoryService = new AgentMemoryService()
const memoryDecisionEngine = new MemoryDecisionEngine()
const resultPersistenceService = new ResultPersistenceService()
const inputUnderstandingService = new InputUnderstandingService()
const migrationService = new ConfigMigrationService(appPathResolver, workspaceManager)

// 注入记忆系统依赖到会话管理器
conversationManager.setMemoryService(agentMemoryService)
conversationManager.setMemoryDecisionEngine(memoryDecisionEngine)

function registerIpcHandlers() {
  // 工作区
  ipcMain.handle('workspace:list', () =>
    workspaceManager.listWorkspaces(),
  )
  ipcMain.handle('workspace:get', (_event, rootPath: string) =>
    workspaceManager.readManifest(rootPath),
  )
  ipcMain.handle('workspace:create', (_event, rootPath: string, name?: string) =>
    workspaceManager.initWorkspace(rootPath, name),
  )
  ipcMain.handle('workspace:recover', (_event, rootPath: string) =>
    workspaceManager.recoverWorkspace(rootPath),
  )
  ipcMain.handle('workspace:list-conversations', async (_event, rootPath: string) => {
    return workspaceManager.listConversations(rootPath)
  })
  ipcMain.handle('workspace:list-recent', () =>
    workspaceManager.listRecentWorkspaces(),
  )
  ipcMain.handle('workspace:save-recent', (_event, workspacePath: string) =>
    workspaceManager.saveRecentWorkspace(workspacePath),
  )
  ipcMain.handle('workspace:get-stats', (_event, rootPath: string) =>
    workspaceManager.getWorkspaceStats(rootPath),
  )
  ipcMain.handle('workspace:recent-tasks', (_event, rootPath: string) =>
    workspaceManager.getRecentTasks(rootPath),
  )
  ipcMain.handle('workspace:blocked-tasks', (_event, rootPath: string) =>
    workspaceManager.getBlockedTasks(rootPath),
  )

  // 会话
  ipcMain.handle('conversation:get', (_event, rootPath: string, conversationId: string) =>
    conversationManager.read(rootPath, conversationId),
  )
  ipcMain.handle('conversation:create', (_event, rootPath: string, title: string, taskType: string, taskDomain?: string) =>
    conversationManager.create(rootPath, { title, taskType, taskDomain }),
  )

  // 任务运行态
  ipcMain.handle('task-runtime:get', (_event, rootPath: string, taskId: string) =>
    taskRuntimeManager.read(rootPath, taskId),
  )
  ipcMain.handle('task-runtime:create', (_event, rootPath: string, conversationId: string, title: string, owner: string, currentNodeName: string) =>
    taskRuntimeManager.create(rootPath, conversationId, { title, owner, currentNodeName }),
  )
  ipcMain.handle('task-runtime:update-status', (_event, rootPath: string, taskId: string, newStatus: string) =>
    taskRuntimeManager.updateStatus(rootPath, taskId, newStatus as TaskStatus),
  )
  ipcMain.handle('task:resume', (_event, rootPath: string, conversationId: string) =>
    taskRuntimeManager.resumeTask(rootPath, conversationId),
  )

  // 模型配置
  ipcMain.handle('model-config:resolve', (_event, rootPath: string, role: string) =>
    modelProfileResolver.resolve(rootPath, role),
  )
  ipcMain.handle('model-config:health-check', async (_event, rootPath: string, providerId: string) => {
    // 从配置中读取 provider 的 apiBaseUrl 和 apiKeyRef
    const configResult = await modelConfigManager.readGlobalConfig(rootPath)
    if (!configResult.ok) {
      return configResult
    }
    const provider = configResult.data.providers.find(p => p.id === providerId)
    if (!provider) {
      return err(createError('MODEL_PROVIDER_NOT_FOUND', 'model-config',
        `Provider "${providerId}" not found`))
    }
    const apiBaseUrl = provider.apiBaseUrl
    const apiKeyKey = provider.apiKeyRef?.key ?? ''
    return healthCheckService.check(rootPath, providerId, apiBaseUrl, apiKeyKey)
  })
  ipcMain.handle('model-config:read', (_event, rootPath: string) =>
    modelConfigManager.readGlobalConfig(rootPath),
  )
  ipcMain.handle('model-config:state', (_event, rootPath: string) =>
    modelConfigManager.getConfigState(rootPath),
  )
  ipcMain.handle('model-config:add-provider', (_event, rootPath: string, provider: Record<string, unknown>) =>
    modelConfigManager.addProvider(rootPath, provider as any),
  )
  ipcMain.handle('model-config:update-provider', (_event, rootPath: string, providerId: string, patch: Record<string, unknown>) =>
    modelConfigManager.updateProvider(rootPath, providerId, patch as any),
  )
  ipcMain.handle('model-config:delete-provider', (_event, rootPath: string, providerId: string) =>
    modelConfigManager.deleteProvider(rootPath, providerId),
  )
  ipcMain.handle('model-config:add-model', (_event, rootPath: string, model: Record<string, unknown>) =>
    modelConfigManager.addModel(rootPath, model as any),
  )
  ipcMain.handle('model-config:update-model', (_event, rootPath: string, modelId: string, patch: Record<string, unknown>) =>
    modelConfigManager.updateModel(rootPath, modelId, patch as any),
  )
  ipcMain.handle('model-config:delete-model', (_event, rootPath: string, modelId: string) =>
    modelConfigManager.deleteModel(rootPath, modelId),
  )
  ipcMain.handle('model-config:add-binding', (_event, rootPath: string, binding: Record<string, unknown>) =>
    modelConfigManager.addBinding(rootPath, binding as any),
  )
  ipcMain.handle('model-config:update-binding', (_event, rootPath: string, bindingId: string, patch: Record<string, unknown>) =>
    modelConfigManager.updateBinding(rootPath, bindingId, patch as any),
  )
  ipcMain.handle('model-config:delete-binding', (_event, rootPath: string, bindingId: string) =>
    modelConfigManager.deleteBinding(rootPath, bindingId),
  )
  ipcMain.handle('model-config:set-secret', (_event, rootPath: string, key: string, value: string) =>
    modelConfigManager.setSecret(rootPath, key, value),
  )
  ipcMain.handle('model-config:get-secret-preview', (_event, rootPath: string, key: string) =>
    modelConfigManager.getSecretPreview(rootPath, key),
  )
  ipcMain.handle('model-config:delete-secret', (_event, rootPath: string, key: string) =>
    modelConfigManager.deleteSecret(rootPath, key),
  )
  ipcMain.handle('model-config:list-secret-keys', (_event, rootPath: string) =>
    modelConfigManager.listSecretKeys(rootPath),
  )
  ipcMain.handle('model-config:set-default-provider', (_event, rootPath: string, providerId: string) =>
    modelConfigManager.setDefaultProvider(rootPath, providerId),
  )
  ipcMain.handle('model-config:set-default-model', (_event, rootPath: string, modelId: string) =>
    modelConfigManager.setDefaultModel(rootPath, modelId),
  )
  ipcMain.handle('model-config:get-config-status', (_event, rootPath: string) =>
    modelConfigManager.getConfigStatus(rootPath),
  )

  // ─── 应用级模型配置 IPC ───

  ipcMain.handle('app-model-config:read', () =>
    modelConfigManager.readAppConfig(),
  )
  ipcMain.handle('app-model-config:add-provider', (_event, provider: Record<string, unknown>) =>
    modelConfigManager.addAppProvider(provider as any),
  )
  ipcMain.handle('app-model-config:update-provider', (_event, providerId: string, patch: Record<string, unknown>) =>
    modelConfigManager.updateAppProvider(providerId, patch as any),
  )
  ipcMain.handle('app-model-config:delete-provider', (_event, providerId: string) =>
    modelConfigManager.deleteAppProvider(providerId),
  )
  ipcMain.handle('app-model-config:add-model', (_event, model: Record<string, unknown>) =>
    modelConfigManager.addAppModel(model as any),
  )
  ipcMain.handle('app-model-config:update-model', (_event, modelId: string, patch: Record<string, unknown>) =>
    modelConfigManager.updateAppModel(modelId, patch as any),
  )
  ipcMain.handle('app-model-config:delete-model', (_event, modelId: string) =>
    modelConfigManager.deleteAppModel(modelId),
  )
  ipcMain.handle('app-model-config:add-binding', (_event, binding: Record<string, unknown>) =>
    modelConfigManager.addAppBinding(binding as any),
  )
  ipcMain.handle('app-model-config:update-binding', (_event, bindingId: string, patch: Record<string, unknown>) =>
    modelConfigManager.updateAppBinding(bindingId, patch as any),
  )
  ipcMain.handle('app-model-config:delete-binding', (_event, bindingId: string) =>
    modelConfigManager.deleteAppBinding(bindingId),
  )
  ipcMain.handle('app-model-config:set-secret', (_event, key: string, value: string) =>
    modelConfigManager.setAppSecret(key, value),
  )
  ipcMain.handle('app-model-config:get-secret-preview', (_event, key: string) =>
    modelConfigManager.getAppSecretPreview(key),
  )
  ipcMain.handle('app-model-config:delete-secret', (_event, key: string) =>
    modelConfigManager.deleteAppSecret(key),
  )
  ipcMain.handle('app-model-config:list-secret-keys', () =>
    modelConfigManager.listAppSecretKeys(),
  )
  ipcMain.handle('app-model-config:set-default-provider', (_event, providerId: string) =>
    modelConfigManager.setAppDefaultProvider(providerId),
  )
  ipcMain.handle('app-model-config:set-default-model', (_event, modelId: string) =>
    modelConfigManager.setAppDefaultModel(modelId),
  )
  ipcMain.handle('app-model-config:get-config-status', () =>
    modelConfigManager.getAppConfigStatus(),
  )
  ipcMain.handle('app-model-config:health-check', (_event, providerId: string) =>
    modelConfigManager.healthCheckApp(providerId),
  )
  ipcMain.handle('app-model-config:list-presets', () => {
    const presets = getBuiltinProviderPresets()
    return { ok: true as const, data: presets }
  })
  ipcMain.handle('app-model-config:list-model-candidates', (_event, providerId?: string) =>
    modelConfigManager.listModelCandidates(providerId),
  )
  ipcMain.handle('app-model-config:state', () =>
    modelConfigManager.getAppConfigState(),
  )

  // 产物服务
  ipcMain.handle('artifact:create', (_event, input: Parameters<typeof artifactService.createArtifact>[0]) =>
    artifactService.createArtifact(input),
  )
  ipcMain.handle('artifact:get', (_event, rootPath: string, artifactId: string, includeContent?: boolean) =>
    artifactService.getArtifactById(rootPath, artifactId, includeContent),
  )
  ipcMain.handle('artifact:update-status', (_event, rootPath: string, artifactId: string, toStatus: string) =>
    artifactService.updateArtifactStatus(rootPath, artifactId, toStatus as ArtifactStatus),
  )
  ipcMain.handle('artifact:list-by-task', (_event, rootPath: string, taskId: string) =>
    artifactService.listArtifactsByTask(rootPath, taskId),
  )

  // 展示镜像
  ipcMain.handle('trace:query-by-task', (_event, rootPath: string, conversationId: string, taskId: string, limit?: number) =>
    traceService.queryByTask(rootPath, conversationId, taskId, limit),
  )
  ipcMain.handle('trace:read-summary', (_event, rootPath: string, conversationId: string, limit?: number) =>
    traceService.readSummary(rootPath, conversationId, limit),
  )

  // 领域流程注册表
  ipcMain.handle('workflow:load-builtin', (_event, rootPath: string) =>
    workflowRegistry.loadBuiltinDomainWorkflows(rootPath),
  )
  ipcMain.handle('workflow:load-custom', (_event, rootPath: string) =>
    workflowRegistry.loadCustomDomainWorkflows(rootPath),
  )
  ipcMain.handle('workflow:resolve-by-domain', (_event, taskDomain: string) =>
    workflowRegistry.resolveWorkflowByTaskDomain(taskDomain),
  )
  ipcMain.handle('workflow:list-all', () =>
    workflowRegistry.listAll(),
  )

  // 工作流运行器
  ipcMain.handle('workflow-runner:start', (_event, input: Parameters<typeof workflowRunner.startTaskWorkflow>[0]) =>
    workflowRunner.startTaskWorkflow(input),
  )
  ipcMain.handle('workflow-runner:advance', (_event, input: Parameters<typeof workflowRunner.advanceTaskWorkflow>[0]) =>
    workflowRunner.advanceTaskWorkflow(input),
  )
  ipcMain.handle('workflow-runner:block', (_event, input: Parameters<typeof workflowRunner.blockTaskWorkflowNode>[0]) =>
    workflowRunner.blockTaskWorkflowNode(input),
  )
  ipcMain.handle('workflow-runner:return', (_event, input: Parameters<typeof workflowRunner.returnTaskWorkflow>[0]) =>
    workflowRunner.returnTaskWorkflow(input),
  )
  ipcMain.handle('workflow-runner:complete-node', (_event, input: Parameters<typeof workflowRunner.completeTaskWorkflowNode>[0]) =>
    workflowRunner.completeTaskWorkflowNode(input),
  )
  ipcMain.handle('workflow-runner:get-context', (_event, taskId: string) =>
    workflowRunner.getContext(taskId),
  )

  // 插件配置
  ipcMain.handle('plugin:preview-impact', (_event, rootPath: string, pluginId: string, pluginType: 'workflow' | 'role' | 'skill', action: 'enable' | 'disable', input?: Parameters<typeof pluginConfigManager.previewPluginImpact>[4]) =>
    pluginConfigManager.previewPluginImpact(rootPath, pluginId, pluginType, action, input),
  )
  ipcMain.handle('plugin:enable', (_event, input: Parameters<typeof pluginConfigManager.enablePlugin>[0]) =>
    pluginConfigManager.enablePlugin(input),
  )
  ipcMain.handle('plugin:disable', (_event, input: Parameters<typeof pluginConfigManager.disablePlugin>[0]) =>
    pluginConfigManager.disablePlugin(input),
  )
  ipcMain.handle('plugin:confirm-enable', (_event, rootPath: string, pluginId: string) =>
    pluginConfigManager.confirmEnable(rootPath, pluginId),
  )
  ipcMain.handle('plugin:list-enabled', (_event, rootPath: string) =>
    pluginConfigManager.listEnabledPlugins(rootPath),
  )
  ipcMain.handle('plugin:list-all', (_event, rootPath: string) =>
    pluginConfigManager.listAllPlugins(rootPath),
  )
  ipcMain.handle('plugin:get', (_event, rootPath: string, pluginId: string) =>
    pluginConfigManager.getPluginRecord(rootPath, pluginId),
  )

  // 插件保存（启用插件）
  ipcMain.handle('plugin:save', (_event, rootPath: string, pluginConfig: Record<string, unknown>) =>
    pluginConfigManager.enablePlugin({
      workspaceRootPath: rootPath,
      pluginId: pluginConfig.pluginId as string,
      pluginType: (pluginConfig.pluginType as 'workflow' | 'role' | 'skill') ?? 'skill',
      pluginName: (pluginConfig.pluginName as string) ?? (pluginConfig.pluginId as string),
      domain: pluginConfig.domain as string | undefined,
      version: pluginConfig.version as string | undefined,
      operatorRole: 'user',
      reason: '手动添加插件',
      confirmedByUser: true,
    }),
  )

  // 插件删除（禁用插件）
  ipcMain.handle('plugin:remove', (_event, rootPath: string, pluginId: string) =>
    pluginConfigManager.disablePlugin({
      workspaceRootPath: rootPath,
      pluginId,
      operatorRole: 'user',
      reason: '手动删除插件',
    }),
  )

  // 插件配置更新
  ipcMain.handle('plugin:update-config', async (_event, rootPath: string, pluginId: string, patch: Record<string, unknown>) => {
    const configResult = await pluginConfigManager.readConfig(rootPath)
    if (!configResult.ok) return configResult
    const config = configResult.data
    const recordIndex = config.enabledPlugins.findIndex(p => p.pluginId === pluginId)
    if (recordIndex === -1) {
      return err(createError('VALIDATION_FAILED', 'plugin', `Plugin "${pluginId}" not found`))
    }
    const record = config.enabledPlugins[recordIndex]
    const updated = { ...record, ...patch, updatedAt: new Date().toISOString() } as typeof record
    config.enabledPlugins[recordIndex] = updated
    return pluginConfigManager.writeConfig(rootPath, config)
  })

  // 插件冲突检查
  ipcMain.handle('plugin:conflict-check', async (_event, rootPath: string, pluginIds: string[]) => {
    const configResult = await pluginConfigManager.readConfig(rootPath)
    if (!configResult.ok) return configResult
    const config = configResult.data
    const results: Record<string, unknown> = {}
    for (const pluginId of pluginIds) {
      const record = config.enabledPlugins.find(p => p.pluginId === pluginId)
      if (record) {
        if (record.pluginType === 'workflow') {
          results[pluginId] = checkWorkflowPluginConflict(
            { id: record.pluginId, name: record.pluginName, taskDomain: record.domain ?? '', version: record.version ?? '1.0', status: 'custom', nodes: [], roleBindings: [], skillBindings: [] },
            [],
            config.enabledPlugins,
          )
        } else if (record.pluginType === 'role') {
          results[pluginId] = checkRolePluginConflict(
            record.pluginName,
            [],
            config.enabledPlugins,
          )
        } else {
          results[pluginId] = { canProceed: true, requiresConfirmation: false, impacts: [] }
        }
      } else {
        results[pluginId] = { canProceed: true, requiresConfirmation: false, impacts: [] }
      }
    }
    return { ok: true as const, data: results }
  })

  // 应用级插件库
  ipcMain.handle('app-plugin:list-all', () =>
    pluginConfigManager.listAppPlugins(),
  )
  ipcMain.handle('app-plugin:list-enabled', () =>
    pluginConfigManager.listEnabledAppPlugins(),
  )
  ipcMain.handle('app-plugin:get', (_event, pluginId: string) =>
    pluginConfigManager.getAppPlugin(pluginId),
  )
  ipcMain.handle('app-plugin:save', (_event, pluginConfig: Record<string, unknown>) =>
    pluginConfigManager.saveAppPlugin(pluginConfig as any),
  )
  ipcMain.handle('app-plugin:remove', (_event, pluginId: string) =>
    pluginConfigManager.removeAppPlugin(pluginId),
  )
  ipcMain.handle('app-plugin:update-config', (_event, pluginId: string, patch: Record<string, unknown>) =>
    pluginConfigManager.updateAppPluginConfig(pluginId, patch),
  )
  ipcMain.handle('app-plugin:preview-impact', (_event, pluginId: string, pluginType: string, action: string) =>
    pluginConfigManager.previewAppPluginImpact(pluginId, pluginType, action),
  )
  ipcMain.handle('app-plugin:conflict-check', (_event, pluginIds: string[]) =>
    pluginConfigManager.checkAppPluginConflict(pluginIds),
  )
  ipcMain.handle('app-plugin:confirm-enable', (_event, pluginId: string) =>
    pluginConfigManager.confirmAppPluginEnable(pluginId),
  )

  // 记忆系统
  ipcMain.handle('memory:submit', (_event, input: Parameters<typeof agentMemoryService.submitMemorySource>[0]) =>
    agentMemoryService.submitMemorySource(input),
  )
  ipcMain.handle('memory:query', (_event, input: Parameters<typeof agentMemoryService.queryAgentMemory>[0]) =>
    agentMemoryService.queryAgentMemory(input),
  )
  ipcMain.handle('memory:turn-end', (_event, input: Parameters<typeof agentMemoryService.notifyMemoryTurnEnd>[0]) =>
    agentMemoryService.notifyMemoryTurnEnd(input),
  )
  ipcMain.handle('memory:resolve-conflict', (_event, rootPath: string, conversationId: string, decision: Record<string, unknown>, userChoice: 'keep' | 'update') =>
    agentMemoryService.resolveMemoryConflict(rootPath, conversationId, decision as any, userChoice),
  )
  ipcMain.handle('memory:get-manifest', (_event, rootPath: string, conversationId: string) =>
    agentMemoryService.getConversationMemoryManifest(rootPath, conversationId),
  )

  // 记忆系统 - 会话回路集成
  ipcMain.handle('memory:process-turn-end', (_event, workspaceRootPath: string, conversationId: string, turnData: { userInput: string; agentOutput: string; context?: unknown }) =>
    conversationManager.processTurnEnd(workspaceRootPath, conversationId, turnData),
  )
  ipcMain.handle('memory:list', (_event, rootPath: string, conversationId: string) =>
    agentMemoryService.queryAgentMemory({ rootPath, conversationId }),
  )

  // 输入理解（仅理解，不启动任务）
  ipcMain.handle('input:understand', async (_event, rawInput: string) => {
    return inputUnderstandingService.understand(rawInput)
  })

  // 输入理解 + 启动完整链路
  ipcMain.handle('input:understand-and-start', async (_event, rootPath: string, rawInput: string) => {
    // 1. 输入理解
    const understandResult = inputUnderstandingService.understand(rawInput)
    if (!understandResult.ok) return understandResult

    const { title, taskType, taskDomain, workflowId } = understandResult.data

    // 2. 创建会话
    const convResult = await conversationManager.create(rootPath, { title, taskType, taskDomain })
    if (!convResult.ok) return convResult as import('../src-main/errors/result').Result<never>

    const conversationId = convResult.data.id

    // 3. 获取 workspaceId
    let workspaceId = ''
    const manifestResult = await workspaceManager.readManifest(rootPath)
    if (manifestResult.ok && manifestResult.data) {
      workspaceId = (manifestResult.data as { id?: string }).id ?? ''
    }

    // 4. 启动工作流（使用映射后的 workflowId 而非原始 taskDomain）
    const workflowResult = await workflowRunner.startTaskWorkflow({
      workspaceRootPath: rootPath,
      workspaceId,
      conversationId,
      taskDomain: workflowId,
      title,
      operatorRole: 'tech_lead',
    })
    if (!workflowResult.ok) return workflowResult as import('../src-main/errors/result').Result<never>

    const taskId = workflowResult.data.taskId

    return { ok: true as const, data: { conversationId, taskId, workflowStarted: true } }
  })

  // 工作区目录选择对话框
  ipcMain.handle('workspace:select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: '选择工作区目录',
    })
    if (result.canceled || result.filePaths.length === 0) {
      return { ok: true as const, data: null }
    }
    return { ok: true as const, data: result.filePaths[0] }
  })

  // 结果沉淀
  ipcMain.handle('result:collect-and-persist', (_event, input: Parameters<typeof resultPersistenceService.collectAndPersist>[0]) =>
    resultPersistenceService.collectAndPersist(input),
  )
  ipcMain.handle('result:list-by-workspace', (_event, rootPath: string) =>
    resultPersistenceService.listByWorkspace(rootPath),
  )
  ipcMain.handle('result:list-by-task', (_event, rootPath: string, taskId: string) =>
    resultPersistenceService.listByTask(rootPath, taskId),
  )
  ipcMain.handle('result:load', (_event, rootPath: string, resultId: string) =>
    resultPersistenceService.load(rootPath, resultId),
  )
  ipcMain.handle('result:build-summary', (_event, rootPath: string, taskId: string) =>
    resultPersistenceService.buildResultSummary(rootPath, taskId),
  )
  ipcMain.handle('result:reuse-suggestions', (_event, rootPath: string, currentDomain: string, currentTaskId: string) =>
    resultPersistenceService.getReuseSuggestions(rootPath, currentDomain, currentTaskId),
  )

  // 结果继续链路：基于历史结果生成新任务草案
  ipcMain.handle('result:continue-draft', (_event, rootPath: string, resultId: string) =>
    resultPersistenceService.generateContinueDraft(rootPath, resultId),
  )
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  migrationService.migrate().then(result => {
    if (result.modelConfigMigrated) console.log('[Migration] Model config migrated from workspace')
    if (result.pluginConfigMigrated) console.log('[Migration] Plugin config migrated from workspace')
    if (result.errors.length > 0) console.warn('[Migration] Errors:', result.errors)
  }).catch(err => {
    console.warn('[Migration] Failed (non-blocking):', err)
  })
})
