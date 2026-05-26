// src/electron-api.d.ts
// Window.agentAPI 类型声明

export interface AgentAPIResult<T> {
  ok: boolean
  data?: T
  error?: { code: string; message: string }
}

export interface AgentAPI {
  // ─── 工作区 ───
  listWorkspaces: () => Promise<AgentAPIResult<unknown>>
  getWorkspace: (rootPath: string) => Promise<AgentAPIResult<unknown>>
  createWorkspace: (rootPath: string, name?: string) => Promise<AgentAPIResult<unknown>>
  recoverWorkspace: (rootPath: string) => Promise<AgentAPIResult<unknown>>

  // ─── 会话 ───
  listConversations(rootPath: string): Promise<AgentAPIResult<string[]>>
  getConversation: (rootPath: string, conversationId: string) => Promise<AgentAPIResult<unknown>>
  createConversation: (rootPath: string, title: string, taskType: string, taskDomain?: string) => Promise<AgentAPIResult<unknown>>
  closeConversation: (rootPath: string, conversationId: string) => Promise<AgentAPIResult<unknown>>

  // ─── 任务运行态 ───
  getTaskRuntime: (rootPath: string, taskId: string) => Promise<AgentAPIResult<unknown>>
  createTaskRuntime: (rootPath: string, conversationId: string, title: string, owner: string, currentNodeName: string) => Promise<AgentAPIResult<unknown>>
  updateTaskStatus: (rootPath: string, taskId: string, newStatus: string) => Promise<AgentAPIResult<unknown>>
  resumeTask: (rootPath: string, conversationId: string) => Promise<AgentAPIResult<{ resumed: boolean; currentNodeId?: string; status?: string; blockReason?: string }>>

  // ─── 工作区目录选择 ───
  selectWorkspace: () => Promise<AgentAPIResult<string | null>>

  // ─── 最近工作区 ───
  listRecentWorkspaces: () => Promise<AgentAPIResult<{ path: string; name: string; lastOpened: string }[]>>
  saveRecentWorkspace: (workspacePath: string) => Promise<AgentAPIResult<void>>
  getWorkspaceStats: (rootPath: string) => Promise<AgentAPIResult<{ conversationCount: number; taskCount: number; lastActivityAt: string | null }>>

  // ─── 首页聚合查询 ───
  getRecentTasks: (rootPath: string) => Promise<AgentAPIResult<{ taskId: string; title: string; status: string; lastUpdated: string; currentNodeLabel: string; conversationId: string; workspaceRootPath: string }[]>>
  getBlockedTasks: (rootPath: string) => Promise<AgentAPIResult<{ taskId: string; title: string; blockReason: string; blockedSince: string; conversationId: string; workspaceRootPath: string }[]>>
  getWorkbenchCurrentState: (rootPath: string, conversationId?: string) => Promise<AgentAPIResult<unknown>>

  // ─── 模型配置 ───
  /** @deprecated 使用应用级 API 代替 */
  resolveModelProfile: (rootPath: string, role: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  healthCheck: (rootPath: string, providerId: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  readModelConfig: (rootPath: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  getModelConfigState: (rootPath: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  addProvider: (rootPath: string, provider: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  updateProvider: (rootPath: string, providerId: string, patch: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  deleteProvider: (rootPath: string, providerId: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  addModel: (rootPath: string, model: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  updateModel: (rootPath: string, modelId: string, patch: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  deleteModel: (rootPath: string, modelId: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  addBinding: (rootPath: string, binding: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  updateBinding: (rootPath: string, bindingId: string, patch: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  deleteBinding: (rootPath: string, bindingId: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  setSecret: (rootPath: string, key: string, value: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  getSecretPreview: (rootPath: string, key: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  deleteSecret: (rootPath: string, key: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  listSecretKeys: (rootPath: string) => Promise<AgentAPIResult<unknown>>

  // ─── 模型配置（默认设置） ───
  /** @deprecated 使用应用级 API 代替 */
  setDefaultProvider: (rootPath: string, providerId: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  setDefaultModel: (rootPath: string, modelId: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级 API 代替 */
  getModelConfigStatus: (rootPath: string) => Promise<AgentAPIResult<{
    hasProvider: boolean
    hasModel: boolean
    hasBinding: boolean
    defaultProvider: string | null
    defaultModel: string | null
    defaultProviderName: string | null
    defaultModelName: string | null
  }>>

  // ─── 应用级模型配置（无需 rootPath） ───
  readAppModelConfig: () => Promise<AgentAPIResult<unknown>>
  addAppProvider: (provider: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  updateAppProvider: (providerId: string, patch: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  deleteAppProvider: (providerId: string) => Promise<AgentAPIResult<unknown>>
  addAppModel: (model: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  updateAppModel: (modelId: string, patch: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  deleteAppModel: (modelId: string) => Promise<AgentAPIResult<unknown>>
  addAppBinding: (binding: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  updateAppBinding: (bindingId: string, patch: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  deleteAppBinding: (bindingId: string) => Promise<AgentAPIResult<unknown>>
  setAppSecret: (key: string, value: string) => Promise<AgentAPIResult<unknown>>
  getAppSecretPreview: (key: string) => Promise<AgentAPIResult<unknown>>
  deleteAppSecret: (key: string) => Promise<AgentAPIResult<unknown>>
  listAppSecretKeys: () => Promise<AgentAPIResult<unknown>>
  setAppDefaultProvider: (providerId: string) => Promise<AgentAPIResult<unknown>>
  setAppDefaultModel: (modelId: string) => Promise<AgentAPIResult<unknown>>
  getAppModelConfigStatus: () => Promise<AgentAPIResult<{
    hasProvider: boolean
    hasModel: boolean
    hasBinding: boolean
    defaultProvider: string | null
    defaultModel: string | null
    defaultProviderName: string | null
    defaultModelName: string | null
  }>>
  healthCheckApp: (providerId: string) => Promise<AgentAPIResult<{
    ok: boolean
    status: 'healthy' | 'degraded' | 'failed'
    latencyMs: number | null
    error: string | null
    checkedUrl: string | null
    checkedAt: string
  }>>
  listPresets: () => Promise<AgentAPIResult<Array<{
    id: string
    name: string
    icon: string
    providerType: string
    providerProtocol: string
    defaultBaseUrl: string
    chatCompletionsPath: string
    modelsPath: string
    authMode: string
    authHeaderName: string
    secretEnvName: string
    supportsStreaming: boolean
    recommendedModels: Array<{
      id: string
      modelName: string
      displayName: string
      capabilities: string[]
      contextWindow: number | null
      deprecated?: boolean
      deprecationNote?: string | null
    }>
  }>>>

  listModelCandidates: (providerId?: string) => Promise<AgentAPIResult<Array<{
    id: string
    modelName: string
    displayName: string
    providerId: string
    providerName: string
    providerIcon?: string
    capabilities: string[]
    contextWindow: number | null
    supportsReasoning: boolean
    supportsToolCall: boolean
    supportsStreaming: boolean
    deprecated: boolean
    deprecationNote: string | null
    source: 'preset' | 'user'
  }>>>

  getAppModelConfigState: () => Promise<AgentAPIResult<{ state: string; blockedReason: string | null }>>

  // ─── 模型输出实验 ───
  modelLabInvoke: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  modelLabRunParameterSweep: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  modelLabRunConsistencyTest: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  modelLabValidateOutput: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  modelLabListPromptTemplates: () => Promise<AgentAPIResult<unknown>>
  modelLabSavePromptTemplate: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  modelLabDeletePromptTemplate: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  modelLabListRuns: (limit?: number) => Promise<AgentAPIResult<unknown>>

  // ─── 产物服务 ───
  createArtifact: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  getArtifact: (rootPath: string, artifactId: string, includeContent?: boolean) => Promise<AgentAPIResult<unknown>>
  updateArtifactStatus: (rootPath: string, artifactId: string, toStatus: string) => Promise<AgentAPIResult<unknown>>
  listArtifactsByTask: (rootPath: string, taskId: string) => Promise<AgentAPIResult<unknown>>

  // ─── 展示镜像 ───
  queryTraceByTask: (rootPath: string, conversationId: string, taskId: string, limit?: number) => Promise<AgentAPIResult<unknown>>
  readTraceSummary: (rootPath: string, conversationId: string, limit?: number) => Promise<AgentAPIResult<unknown>>

  // ─── 领域流程注册表 ───
  loadBuiltinWorkflows: (rootPath: string) => Promise<AgentAPIResult<unknown>>
  loadCustomWorkflows: (rootPath: string) => Promise<AgentAPIResult<unknown>>
  resolveWorkflowByDomain: (taskDomain: string) => Promise<AgentAPIResult<unknown>>
  listAllWorkflows: (rootPath: string) => Promise<AgentAPIResult<unknown>>

  // ─── 工作流运行器 ───
  startTaskWorkflow: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  advanceTaskWorkflow: (input: { workspaceRootPath: string; taskId: string }) => Promise<AgentAPIResult<unknown>>
  blockTaskWorkflowNode: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  returnTaskWorkflow: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  completeTaskWorkflowNode: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  getWorkflowContext: (taskId: string) => Promise<AgentAPIResult<unknown>>

  // ─── 插件配置 ───
  /** @deprecated 使用应用级插件 API 代替 */
  previewPluginImpact: (rootPath: string, pluginId: string, pluginType: string, action: string, input?: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级插件 API 代替 */
  enablePlugin: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用应用级插件 API 代替 */
  disablePlugin: (input: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用 confirmAppPluginEnable 代替 */
  confirmPluginEnable: (rootPath: string, pluginId: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用 listEnabledAppPlugins 代替 */
  listEnabledPlugins: (rootPath: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用 listAppPlugins 代替 */
  listAllPlugins: (rootPath: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用 getAppPlugin 代替 */
  getPluginRecord: (rootPath: string, pluginId: string) => Promise<AgentAPIResult<unknown>>

  // ─── 插件管理（扩展） ───
  /** @deprecated 使用 saveAppPlugin 代替 */
  savePlugin: (rootPath: string, pluginConfig: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用 removeAppPlugin 代替 */
  removePlugin: (rootPath: string, pluginId: string) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用 updateAppPluginConfig 代替 */
  updatePluginConfig: (rootPath: string, pluginId: string, patch: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  /** @deprecated 使用 appPluginConflictCheck 代替 */
  pluginConflictCheck: (rootPath: string, pluginIds: string[]) => Promise<AgentAPIResult<Record<string, unknown>>>

  // ─── 应用级插件库（不需要工作区路径） ───
  listAppPlugins: () => Promise<AgentAPIResult<unknown>>
  listEnabledAppPlugins: () => Promise<AgentAPIResult<unknown>>
  getAppPlugin: (pluginId: string) => Promise<AgentAPIResult<unknown>>
  saveAppPlugin: (pluginConfig: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  removeAppPlugin: (pluginId: string) => Promise<AgentAPIResult<unknown>>
  updateAppPluginConfig: (pluginId: string, patch: Record<string, unknown>) => Promise<AgentAPIResult<unknown>>
  previewAppPluginImpact: (pluginId: string, pluginType: string, action: string) => Promise<AgentAPIResult<unknown>>
  appPluginConflictCheck: (pluginIds: string[]) => Promise<AgentAPIResult<unknown>>
  confirmAppPluginEnable: (pluginId: string) => Promise<AgentAPIResult<unknown>>

  // ─── 记忆系统 ───
  submitMemorySource: (input: { rootPath: string; conversationId: string; turnId: string; currentAgentRole: string; sourceText: string }) => Promise<AgentAPIResult<unknown>>
  queryAgentMemory: (input: { rootPath: string; conversationId: string; agentRole?: string; categories?: string[] }) => Promise<AgentAPIResult<unknown>>
  notifyMemoryTurnEnd: (input: { rootPath: string; conversationId: string; turnId: string }) => Promise<AgentAPIResult<unknown>>
  resolveMemoryConflict: (rootPath: string, conversationId: string, decision: Record<string, unknown>, userChoice: 'keep' | 'update') => Promise<AgentAPIResult<unknown>>
  getMemoryManifest: (rootPath: string, conversationId: string) => Promise<AgentAPIResult<unknown>>

  // ─── 记忆系统 - 会话回路集成 ───
  processTurnEnd: (workspaceRootPath: string, conversationId: string, turnData: { userInput: string; agentOutput: string; context?: unknown }) => Promise<AgentAPIResult<{ memorized: boolean; conflictDetected?: boolean; conflictDetails?: unknown }>>
  listMemories: (rootPath: string, conversationId: string) => Promise<AgentAPIResult<unknown>>

  // ─── 输入理解（仅理解，不启动任务） ───
  understandInput: (rawInput: string) => Promise<AgentAPIResult<{ title: string; taskType: string; taskDomain: string; workflowId: string }>>

  // ─── 输入理解 + 启动完整链路 ───
  understandAndStart: (rootPath: string, rawInput: string) => Promise<AgentAPIResult<{ conversationId: string; taskId: string; workflowStarted: boolean }>>

  // ─── 结果沉淀 ───
  collectAndPersist: (input: { rootPath: string; taskId: string; conversationId: string; operatorRole: string }) => Promise<AgentAPIResult<unknown>>
  listResultsByWorkspace: (rootPath: string) => Promise<AgentAPIResult<unknown>>
  listResultsByTask: (rootPath: string, taskId: string) => Promise<AgentAPIResult<unknown>>
  loadResult: (rootPath: string, resultId: string) => Promise<AgentAPIResult<unknown>>
  buildResultSummary: (rootPath: string, taskId: string) => Promise<AgentAPIResult<unknown>>
  getReuseSuggestions: (rootPath: string, currentDomain: string, currentTaskId: string) => Promise<AgentAPIResult<unknown>>
  /** 基于历史结果生成继续任务草案（P2-MAIN-01） */
  generateContinueDraft: (rootPath: string, resultId: string) => Promise<AgentAPIResult<{ title: string; taskType: string; taskDomain: string; workflowId: string; rawInput: string }>>

  // ─── 事件监听 ───
  onMainProcessMessage: (callback: (message: string) => void) => void
}

declare global {
  interface Window {
    agentAPI: AgentAPI
  }
}
