import { ipcRenderer, contextBridge } from 'electron'

// --------- Agent API: narrow IPC interface for Renderer ---------
// 不暴露原始 ipcRenderer，仅暴露命名方法
type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

contextBridge.exposeInMainWorld('agentAPI', {
  // ─── 工作区 ───
  listWorkspaces: (): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workspace:list'),

  getWorkspace: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workspace:get', rootPath),

  createWorkspace: (rootPath: string, name?: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workspace:create', rootPath, name),

  recoverWorkspace: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workspace:recover', rootPath),

  // ─── 会话 ───
  listConversations: (rootPath: string): Promise<Result<string[]>> =>
    ipcRenderer.invoke('workspace:list-conversations', rootPath),

  getConversation: (rootPath: string, conversationId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('conversation:get', rootPath, conversationId),

  createConversation: (rootPath: string, title: string, taskType: string, taskDomain?: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('conversation:create', rootPath, title, taskType, taskDomain),

  closeConversation: (rootPath: string, conversationId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('conversation:close', rootPath, conversationId),

  // ─── 任务运行态 ───
  getTaskRuntime: (rootPath: string, taskId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('task-runtime:get', rootPath, taskId),

  createTaskRuntime: (rootPath: string, conversationId: string, title: string, owner: string, currentNodeName: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('task-runtime:create', rootPath, conversationId, title, owner, currentNodeName),

  updateTaskStatus: (rootPath: string, taskId: string, newStatus: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('task-runtime:update-status', rootPath, taskId, newStatus),

  // ─── 恢复/继续任务 ───
  resumeTask: (rootPath: string, conversationId: string): Promise<Result<{ resumed: boolean; currentNodeId?: string; status?: string; blockReason?: string }>> =>
    ipcRenderer.invoke('task:resume', rootPath, conversationId),

  // ─── 工作区目录选择 ───
  selectWorkspace: (): Promise<Result<string | null>> =>
    ipcRenderer.invoke('workspace:select-directory'),

  // ─── 最近工作区 ───
  listRecentWorkspaces: (): Promise<Result<{ path: string; name: string; lastOpened: string }[]>> =>
    ipcRenderer.invoke('workspace:list-recent'),

  saveRecentWorkspace: (workspacePath: string): Promise<Result<void>> =>
    ipcRenderer.invoke('workspace:save-recent', workspacePath),

  getWorkspaceStats: (rootPath: string): Promise<Result<{ conversationCount: number; taskCount: number; lastActivityAt: string | null }>> =>
    ipcRenderer.invoke('workspace:get-stats', rootPath),

  getRecentTasks: (rootPath: string): Promise<Result<{ taskId: string; title: string; status: string; lastUpdated: string; currentNodeLabel: string; conversationId: string; workspaceRootPath: string }[]>> =>
    ipcRenderer.invoke('workspace:recent-tasks', rootPath),

  getBlockedTasks: (rootPath: string): Promise<Result<{ taskId: string; title: string; blockReason: string; blockedSince: string; conversationId: string; workspaceRootPath: string }[]>> =>
    ipcRenderer.invoke('workspace:blocked-tasks', rootPath),

  getWorkbenchCurrentState: (rootPath: string, conversationId?: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workbench:get-current-state', rootPath, conversationId),

  // ─── 模型配置 ───
  /** @deprecated 使用应用级 API readAppModelConfig 代替 */
  resolveModelProfile: (rootPath: string, role: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:resolve', rootPath, role),

  /** @deprecated 使用应用级 API healthCheckApp 代替 */
  healthCheck: (rootPath: string, providerId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:health-check', rootPath, providerId),

  /** @deprecated 使用应用级 API readAppModelConfig 代替 */
  readModelConfig: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:read', rootPath),

  /** @deprecated 使用应用级 API getAppModelConfigStatus 代替 */
  getModelConfigState: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:state', rootPath),

  /** @deprecated 使用应用级 API addAppProvider 代替 */
  addProvider: (rootPath: string, provider: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:add-provider', rootPath, provider),

  /** @deprecated 使用应用级 API updateAppProvider 代替 */
  updateProvider: (rootPath: string, providerId: string, patch: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:update-provider', rootPath, providerId, patch),

  /** @deprecated 使用应用级 API deleteAppProvider 代替 */
  deleteProvider: (rootPath: string, providerId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:delete-provider', rootPath, providerId),

  /** @deprecated 使用应用级 API addAppModel 代替 */
  addModel: (rootPath: string, model: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:add-model', rootPath, model),

  /** @deprecated 使用应用级 API updateAppModel 代替 */
  updateModel: (rootPath: string, modelId: string, patch: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:update-model', rootPath, modelId, patch),

  /** @deprecated 使用应用级 API deleteAppModel 代替 */
  deleteModel: (rootPath: string, modelId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:delete-model', rootPath, modelId),

  /** @deprecated 使用应用级 API addAppBinding 代替 */
  addBinding: (rootPath: string, binding: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:add-binding', rootPath, binding),

  /** @deprecated 使用应用级 API updateAppBinding 代替 */
  updateBinding: (rootPath: string, bindingId: string, patch: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:update-binding', rootPath, bindingId, patch),

  /** @deprecated 使用应用级 API deleteAppBinding 代替 */
  deleteBinding: (rootPath: string, bindingId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:delete-binding', rootPath, bindingId),

  /** @deprecated 使用应用级 API setAppSecret 代替 */
  setSecret: (rootPath: string, key: string, value: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:set-secret', rootPath, key, value),

  /** @deprecated 使用应用级 API getAppSecretPreview 代替 */
  getSecretPreview: (rootPath: string, key: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:get-secret-preview', rootPath, key),

  /** @deprecated 使用应用级 API deleteAppSecret 代替 */
  deleteSecret: (rootPath: string, key: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:delete-secret', rootPath, key),

  /** @deprecated 使用应用级 API listAppSecretKeys 代替 */
  listSecretKeys: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:list-secret-keys', rootPath),

  /** @deprecated 使用应用级 API setAppDefaultProvider 代替 */
  setDefaultProvider: (rootPath: string, providerId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:set-default-provider', rootPath, providerId),

  /** @deprecated 使用应用级 API setAppDefaultModel 代替 */
  setDefaultModel: (rootPath: string, modelId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:set-default-model', rootPath, modelId),

  /** @deprecated 使用应用级 API getAppModelConfigStatus 代替 */
  getModelConfigStatus: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-config:get-config-status', rootPath),

  // ─── 应用级模型配置（无需 rootPath） ───

  readAppModelConfig: (): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:read'),

  addAppProvider: (provider: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:add-provider', provider),

  updateAppProvider: (providerId: string, patch: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:update-provider', providerId, patch),

  deleteAppProvider: (providerId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:delete-provider', providerId),

  addAppModel: (model: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:add-model', model),

  updateAppModel: (modelId: string, patch: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:update-model', modelId, patch),

  deleteAppModel: (modelId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:delete-model', modelId),

  addAppBinding: (binding: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:add-binding', binding),

  updateAppBinding: (bindingId: string, patch: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:update-binding', bindingId, patch),

  deleteAppBinding: (bindingId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:delete-binding', bindingId),

  setAppSecret: (key: string, value: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:set-secret', key, value),

  getAppSecretPreview: (key: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:get-secret-preview', key),

  deleteAppSecret: (key: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:delete-secret', key),

  listAppSecretKeys: (): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:list-secret-keys'),

  setAppDefaultProvider: (providerId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:set-default-provider', providerId),

  setAppDefaultModel: (modelId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:set-default-model', modelId),

  getAppModelConfigStatus: (): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:get-config-status'),

  healthCheckApp: (providerId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:health-check', providerId),

  listPresets: (): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:list-presets'),

  listModelCandidates: (providerId?: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-model-config:list-model-candidates', providerId),

  getAppModelConfigState: (): Promise<Result<{ state: string; blockedReason: string | null }>> =>
    ipcRenderer.invoke('app-model-config:state'),

  // ─── 模型输出实验 ───
  modelLabInvoke: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-lab:invoke', input),

  modelLabRunParameterSweep: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-lab:run-parameter-sweep', input),

  modelLabRunConsistencyTest: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-lab:run-consistency-test', input),

  modelLabValidateOutput: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-lab:validate-output', input),

  modelLabListPromptTemplates: (): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-lab:list-prompt-templates'),

  modelLabSavePromptTemplate: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-lab:save-prompt-template', input),

  modelLabDeletePromptTemplate: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-lab:delete-prompt-template', input),

  modelLabListRuns: (limit?: number): Promise<Result<unknown>> =>
    ipcRenderer.invoke('model-lab:list-runs', limit),

  // ─── 产物服务 ───
  createArtifact: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('artifact:create', input),

  getArtifact: (rootPath: string, artifactId: string, includeContent?: boolean): Promise<Result<unknown>> =>
    ipcRenderer.invoke('artifact:get', rootPath, artifactId, includeContent),

  updateArtifactStatus: (rootPath: string, artifactId: string, toStatus: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('artifact:update-status', rootPath, artifactId, toStatus),

  listArtifactsByTask: (rootPath: string, taskId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('artifact:list-by-task', rootPath, taskId),

  // ─── 展示镜像 ───
  queryTraceByTask: (rootPath: string, conversationId: string, taskId: string, limit?: number): Promise<Result<unknown>> =>
    ipcRenderer.invoke('trace:query-by-task', rootPath, conversationId, taskId, limit),

  readTraceSummary: (rootPath: string, conversationId: string, limit?: number): Promise<Result<unknown>> =>
    ipcRenderer.invoke('trace:read-summary', rootPath, conversationId, limit),

  // ─── 领域流程注册表 ───
  loadBuiltinWorkflows: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow:load-builtin', rootPath),

  loadCustomWorkflows: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow:load-custom', rootPath),

  resolveWorkflowByDomain: (taskDomain: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow:resolve-by-domain', taskDomain),

  listAllWorkflows: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow:list-all'),

  // ─── 工作流运行器 ───
  startTaskWorkflow: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow-runner:start', input),

  advanceTaskWorkflow: (input: { workspaceRootPath: string; taskId: string }): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow-runner:advance', input),

  blockTaskWorkflowNode: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow-runner:block', input),

  returnTaskWorkflow: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow-runner:return', input),

  completeTaskWorkflowNode: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow-runner:complete-node', input),

  getWorkflowContext: (taskId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('workflow-runner:get-context', taskId),

  // ─── 插件配置 ───
  /** @deprecated 使用应用级插件 API（listAppPlugins 等）代替 */
  previewPluginImpact: (rootPath: string, pluginId: string, pluginType: string, action: string, input?: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:preview-impact', rootPath, pluginId, pluginType, action, input),

  /** @deprecated 使用应用级插件 API（saveAppPlugin 等）代替 */
  enablePlugin: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:enable', input),

  /** @deprecated 使用应用级插件 API（removeAppPlugin 等）代替 */
  disablePlugin: (input: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:disable', input),

  /** @deprecated 使用 confirmAppPluginEnable 代替 */
  confirmPluginEnable: (rootPath: string, pluginId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:confirm-enable', rootPath, pluginId),

  /** @deprecated 使用 listEnabledAppPlugins 代替 */
  listEnabledPlugins: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:list-enabled', rootPath),

  /** @deprecated 使用 listAppPlugins 代替 */
  listAllPlugins: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:list-all', rootPath),

  /** @deprecated 使用 getAppPlugin 代替 */
  getPluginRecord: (rootPath: string, pluginId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:get', rootPath, pluginId),

  /** @deprecated 使用 saveAppPlugin 代替 */
  savePlugin: (rootPath: string, pluginConfig: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:save', rootPath, pluginConfig),

  /** @deprecated 使用 removeAppPlugin 代替 */
  removePlugin: (rootPath: string, pluginId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:remove', rootPath, pluginId),

  /** @deprecated 使用 updateAppPluginConfig 代替 */
  updatePluginConfig: (rootPath: string, pluginId: string, patch: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('plugin:update-config', rootPath, pluginId, patch),

  /** @deprecated 使用 appPluginConflictCheck 代替 */
  pluginConflictCheck: (rootPath: string, pluginIds: string[]): Promise<Result<Record<string, unknown>>> =>
    ipcRenderer.invoke('plugin:conflict-check', rootPath, pluginIds),

  // ─── 应用级插件库（不需要工作区路径） ───
  listAppPlugins: (): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-plugin:list-all'),

  listEnabledAppPlugins: (): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-plugin:list-enabled'),

  getAppPlugin: (pluginId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-plugin:get', pluginId),

  saveAppPlugin: (pluginConfig: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-plugin:save', pluginConfig),

  removeAppPlugin: (pluginId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-plugin:remove', pluginId),

  updateAppPluginConfig: (pluginId: string, patch: Record<string, unknown>): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-plugin:update-config', pluginId, patch),

  previewAppPluginImpact: (pluginId: string, pluginType: string, action: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-plugin:preview-impact', pluginId, pluginType, action),

  appPluginConflictCheck: (pluginIds: string[]): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-plugin:conflict-check', pluginIds),

  confirmAppPluginEnable: (pluginId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('app-plugin:confirm-enable', pluginId),

  // ─── 记忆系统 ───
  submitMemorySource: (input: { rootPath: string; conversationId: string; turnId: string; currentAgentRole: string; sourceText: string }): Promise<Result<unknown>> =>
    ipcRenderer.invoke('memory:submit', input),

  queryAgentMemory: (input: { rootPath: string; conversationId: string; agentRole?: string; categories?: string[] }): Promise<Result<unknown>> =>
    ipcRenderer.invoke('memory:query', input),

  notifyMemoryTurnEnd: (input: { rootPath: string; conversationId: string; turnId: string }): Promise<Result<unknown>> =>
    ipcRenderer.invoke('memory:turn-end', input),

  resolveMemoryConflict: (rootPath: string, conversationId: string, decision: Record<string, unknown>, userChoice: 'keep' | 'update'): Promise<Result<unknown>> =>
    ipcRenderer.invoke('memory:resolve-conflict', rootPath, conversationId, decision, userChoice),

  getMemoryManifest: (rootPath: string, conversationId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('memory:get-manifest', rootPath, conversationId),

  // ─── 记忆系统 - 会话回路集成 ───
  processTurnEnd: (workspaceRootPath: string, conversationId: string, turnData: { userInput: string; agentOutput: string; context?: unknown }): Promise<Result<{ memorized: boolean; conflictDetected?: boolean; conflictDetails?: unknown }>> =>
    ipcRenderer.invoke('memory:process-turn-end', workspaceRootPath, conversationId, turnData),

  listMemories: (rootPath: string, conversationId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('memory:list', rootPath, conversationId),

  // ─── 输入理解（仅理解，不启动任务） ───
  understandInput: (rawInput: string): Promise<Result<{ title: string; taskType: string; taskDomain: string; workflowId: string }>> =>
    ipcRenderer.invoke('input:understand', rawInput),

  // ─── 输入理解 + 启动完整链路 ───
  understandAndStart: (rootPath: string, rawInput: string): Promise<Result<{ conversationId: string; taskId: string; workflowStarted: boolean }>> =>
    ipcRenderer.invoke('input:understand-and-start', rootPath, rawInput),

  // ─── 结果沉淀 ───
  collectAndPersist: (input: { rootPath: string; taskId: string; conversationId: string; operatorRole: string }): Promise<Result<unknown>> =>
    ipcRenderer.invoke('result:collect-and-persist', input),

  listResultsByWorkspace: (rootPath: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('result:list-by-workspace', rootPath),

  listResultsByTask: (rootPath: string, taskId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('result:list-by-task', rootPath, taskId),

  loadResult: (rootPath: string, resultId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('result:load', rootPath, resultId),

  buildResultSummary: (rootPath: string, taskId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('result:build-summary', rootPath, taskId),

  getReuseSuggestions: (rootPath: string, currentDomain: string, currentTaskId: string): Promise<Result<unknown>> =>
    ipcRenderer.invoke('result:reuse-suggestions', rootPath, currentDomain, currentTaskId),

  /** 基于历史结果生成继续任务草案 */
  generateContinueDraft: (rootPath: string, resultId: string): Promise<Result<{ title: string; taskType: string; taskDomain: string; workflowId: string; rawInput: string }>> =>
    ipcRenderer.invoke('result:continue-draft', rootPath, resultId),

  // ─── 事件监听 ───
  onMainProcessMessage: (callback: (message: string) => void) => {
    ipcRenderer.on('main-process-message', (_event, message) => callback(message))
  },
})
