// src-main/model-config/model-config-manager.ts
// 模型配置管理器：Provider / Model / Binding / Secret CRUD
// 来源：T15 model-config-ui、ModelProviderConfig产品需求、模块接口I/O契约

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import { SecretStore } from './secret-store'
import { resolveConfigState } from './state'
import { buildProviderHeaders, buildModelsUrl } from './model-health-check-service'
import { getBuiltinProviderPresets, type ProviderPresetModel } from './provider-presets'
import type {
  AppModelConfig,
  GlobalModelConfig,
  ModelProviderConfig,
  ModelProfileConfig,
  ModelBindingConfig,
  ModelConfigState,
  ModelConfigStatus,
  ModelCandidate,
} from './contracts'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import type { AppPathResolver } from '../storage/app-path-resolver'

export class ModelConfigManager {
  private appPathResolver?: AppPathResolver

  constructor(appPathResolver?: AppPathResolver) {
    this.appPathResolver = appPathResolver
  }
  /**
   * 读取全局模型配置
   */
  async readGlobalConfig(workspaceRootPath: string): Promise<Result<GlobalModelConfig>> {
    const resolver = new PathResolver(workspaceRootPath)
    const result = await JsonStore.read<GlobalModelConfig>(
      resolver.modelConfigDir + '/global-config.json',
    )
    if (!result.ok) {
      // 文件不存在返回空配置
      return ok({ providers: [], models: [], bindings: [] })
    }
    return ok(result.data)
  }

  /**
   * 写入全局模型配置
   */
  async writeGlobalConfig(workspaceRootPath: string, config: GlobalModelConfig): Promise<Result<void>> {
    const resolver = new PathResolver(workspaceRootPath)
    return JsonStore.write(resolver.modelConfigDir + '/global-config.json', config)
  }

  /**
   * 获取整体配置状态
   */
  async getConfigState(workspaceRootPath: string): Promise<Result<{ state: ModelConfigState; blockedReason: string | null }>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>

    const cfg = configResult.data
    const { state, blockedReason } = resolveConfigState(
      cfg.providers,
      cfg.models,
      cfg.bindings,
      (cfg as GlobalModelConfig & { defaultProviderId?: string }).defaultProviderId,
      (cfg as GlobalModelConfig & { defaultModelId?: string }).defaultModelId,
    )
    return ok({ state, blockedReason })
  }

  // ─── Provider CRUD ───

  /**
   * 添加 Provider
   */
  async addProvider(workspaceRootPath: string, provider: Omit<ModelProviderConfig, 'createdAt' | 'updatedAt'>): Promise<Result<ModelProviderConfig>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    // 检查 ID 重复
    if (config.providers.some(p => p.id === provider.id)) {
      return err(createError('WS_ALREADY_EXISTS', 'model-config',
        `Provider "${provider.id}" already exists`, {
          recoverable: true,
          suggestedAction: 'Use a different provider ID.',
        }))
    }

    const now = new Date().toISOString()
    const newProvider: ModelProviderConfig = {
      ...provider,
      createdAt: now,
      updatedAt: now,
    }
    config.providers.push(newProvider)

    const writeResult = await this.writeGlobalConfig(workspaceRootPath, config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(newProvider)
  }

  /**
   * 更新 Provider
   */
  async updateProvider(workspaceRootPath: string, providerId: string, patch: Partial<ModelProviderConfig>): Promise<Result<ModelProviderConfig>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const index = config.providers.findIndex(p => p.id === providerId)
    if (index === -1) {
      return err(createError('MODEL_PROVIDER_NOT_FOUND', 'model-config',
        `Provider "${providerId}" not found`))
    }

    const updated: ModelProviderConfig = {
      ...config.providers[index],
      ...patch,
      id: providerId,  // 不允许覆盖 id
      createdAt: config.providers[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    config.providers[index] = updated

    const writeResult = await this.writeGlobalConfig(workspaceRootPath, config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(updated)
  }

  /**
   * 删除 Provider（同时删除关联 models 和 bindings）
   */
  async deleteProvider(workspaceRootPath: string, providerId: string): Promise<Result<void>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    config.providers = config.providers.filter(p => p.id !== providerId)
    config.models = config.models.filter(m => m.providerId !== providerId)
    config.bindings = config.bindings.filter(b => b.providerId !== providerId)

    // 删除关联密钥
    const secretStore = new SecretStore(workspaceRootPath)
    await secretStore.delete(`provider-${providerId}-apiKey`)

    return this.writeGlobalConfig(workspaceRootPath, config)
  }

  // ─── Model CRUD ───

  /**
   * 添加 Model
   */
  async addModel(workspaceRootPath: string, model: Omit<ModelProfileConfig, 'createdAt' | 'updatedAt'>): Promise<Result<ModelProfileConfig>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    if (config.models.some(m => m.id === model.id)) {
      return err(createError('WS_ALREADY_EXISTS', 'model-config',
        `Model "${model.id}" already exists`))
    }

    const now = new Date().toISOString()
    const newModel: ModelProfileConfig = { ...model, createdAt: now, updatedAt: now }
    config.models.push(newModel)

    const writeResult = await this.writeGlobalConfig(workspaceRootPath, config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(newModel)
  }

  /**
   * 更新 Model
   */
  async updateModel(workspaceRootPath: string, modelId: string, patch: Partial<ModelProfileConfig>): Promise<Result<ModelProfileConfig>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const index = config.models.findIndex(m => m.id === modelId)
    if (index === -1) {
      return err(createError('MODEL_PROFILE_NOT_FOUND', 'model-config',
        `Model "${modelId}" not found`))
    }

    const updated: ModelProfileConfig = {
      ...config.models[index],
      ...patch,
      id: modelId,
      createdAt: config.models[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    config.models[index] = updated

    const writeResult = await this.writeGlobalConfig(workspaceRootPath, config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(updated)
  }

  /**
   * 删除 Model
   */
  async deleteModel(workspaceRootPath: string, modelId: string): Promise<Result<void>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    config.models = config.models.filter(m => m.id !== modelId)
    config.bindings = config.bindings.filter(b => b.modelId !== modelId)

    return this.writeGlobalConfig(workspaceRootPath, config)
  }

  // ─── Binding CRUD ───

  /**
   * 添加 Binding
   */
  async addBinding(workspaceRootPath: string, binding: Omit<ModelBindingConfig, 'createdAt' | 'updatedAt'>): Promise<Result<ModelBindingConfig>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const now = new Date().toISOString()
    const newBinding: ModelBindingConfig = { ...binding, createdAt: now, updatedAt: now }
    config.bindings.push(newBinding)

    const writeResult = await this.writeGlobalConfig(workspaceRootPath, config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(newBinding)
  }

  /**
   * 更新 Binding
   */
  async updateBinding(workspaceRootPath: string, bindingId: string, patch: Partial<ModelBindingConfig>): Promise<Result<ModelBindingConfig>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const index = config.bindings.findIndex(b => b.id === bindingId)
    if (index === -1) {
      return err(createError('MODEL_BINDING_NOT_FOUND', 'model-config',
        `Binding "${bindingId}" not found`))
    }

    const updated: ModelBindingConfig = {
      ...config.bindings[index],
      ...patch,
      id: bindingId,
      createdAt: config.bindings[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    config.bindings[index] = updated

    const writeResult = await this.writeGlobalConfig(workspaceRootPath, config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(updated)
  }

  /**
   * 删除 Binding
   */
  async deleteBinding(workspaceRootPath: string, bindingId: string): Promise<Result<void>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    config.bindings = config.bindings.filter(b => b.id !== bindingId)
    return this.writeGlobalConfig(workspaceRootPath, config)
  }

  /**
   * 获取配置状态摘要（供前端判断是否有默认 provider/model）
   */
  async getConfigStatus(workspaceRootPath: string): Promise<Result<ModelConfigStatus>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const enabledProviders = config.providers.filter(p => p.enabled)
    const enabledModels = config.models.filter(m => m.enabled && enabledProviders.some(p => p.id === m.providerId))
    const enabledBindings = config.bindings.filter(b => b.enabled && enabledModels.some(m => m.id === b.modelId))

    const defaultProviderId = (config as GlobalModelConfig & { defaultProviderId?: string }).defaultProviderId ?? null
    const defaultModelId = (config as GlobalModelConfig & { defaultModelId?: string }).defaultModelId ?? null

    const defaultProvider = enabledProviders.find(p => p.id === defaultProviderId) ?? null
    const defaultModel = enabledModels.find(m => m.id === defaultModelId) ?? null

    return ok({
      hasProvider: enabledProviders.length > 0,
      hasModel: enabledModels.length > 0,
      hasBinding: enabledBindings.length > 0,
      defaultProvider: defaultProvider?.id ?? null,
      defaultModel: defaultModel?.id ?? null,
      defaultProviderName: defaultProvider?.name ?? null,
      defaultModelName: defaultModel?.displayName ?? defaultModel?.modelName ?? null,
    })
  }

  /**
   * 设置默认 Provider
   */
  async setDefaultProvider(workspaceRootPath: string, providerId: string): Promise<Result<void>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    if (!config.providers.some(p => p.id === providerId)) {
      return err(createError('MODEL_PROVIDER_NOT_FOUND', 'model-config',
        `Provider "${providerId}" not found`))
    }

    // 在 global-config.json 顶层添加 defaultProviderId 字段
    const extendedConfig = { ...config, defaultProviderId: providerId }
    return this.writeGlobalConfig(workspaceRootPath, extendedConfig)
  }

  /**
   * 设置默认 Model
   */
  async setDefaultModel(workspaceRootPath: string, modelId: string): Promise<Result<void>> {
    const configResult = await this.readGlobalConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    if (!config.models.some(m => m.id === modelId)) {
      return err(createError('MODEL_PROFILE_NOT_FOUND', 'model-config',
        `Model "${modelId}" not found`))
    }

    const extendedConfig = { ...config, defaultModelId: modelId }
    return this.writeGlobalConfig(workspaceRootPath, extendedConfig)
  }

  // ─── Secret ───

  /**
   * 设置密钥
   */
  async setSecret(workspaceRootPath: string, key: string, value: string): Promise<Result<void>> {
    const secretStore = new SecretStore(workspaceRootPath)
    return secretStore.set(key, value)
  }

  /**
   * 获取密钥掩码预览
   */
  async getSecretPreview(workspaceRootPath: string, key: string): Promise<Result<string>> {
    const secretStore = new SecretStore(workspaceRootPath)
    const hasResult = await secretStore.has(key)
    if (!hasResult) {
      return ok('')
    }
    // 返回掩码值
    return ok('••••••••')
  }

  /**
   * 删除密钥
   */
  async deleteSecret(workspaceRootPath: string, key: string): Promise<Result<void>> {
    const secretStore = new SecretStore(workspaceRootPath)
    return secretStore.delete(key)
  }

  /**
   * 列出密钥 key
   */
  async listSecretKeys(workspaceRootPath: string): Promise<Result<string[]>> {
    const secretStore = new SecretStore(workspaceRootPath)
    return secretStore.listKeys()
  }

  // ═══════════════════════════════════════════════════════════════
  // 应用级配置方法（使用 AppPathResolver，无需工作区路径）
  // ═══════════════════════════════════════════════════════════════

  // ─── 应用级配置内部辅助 ───

  private getAppConfigPath(): string {
    if (!this.appPathResolver) {
      throw new Error('AppPathResolver not configured')
    }
    return this.appPathResolver.modelConfigPath
  }

  private getAppSecretsPath(): string {
    if (!this.appPathResolver) {
      throw new Error('AppPathResolver not configured')
    }
    return this.appPathResolver.secretsPath
  }

  private async readAppConfigFile(): Promise<Result<AppModelConfig>> {
    const result = await JsonStore.read<AppModelConfig>(this.getAppConfigPath())
    if (!result.ok) {
      return ok({ providers: [], models: [], bindings: [] })
    }
    return ok(result.data)
  }

  private async writeAppConfigFile(config: AppModelConfig): Promise<Result<void>> {
    return JsonStore.write(this.getAppConfigPath(), config)
  }

  // ─── 应用级配置读写 ───

  async readAppConfig(): Promise<Result<AppModelConfig>> {
    return this.readAppConfigFile()
  }

  async writeAppConfig(config: AppModelConfig): Promise<Result<void>> {
    return this.writeAppConfigFile(config)
  }

  // ─── 应用级 Provider CRUD ───

  async addAppProvider(provider: Omit<ModelProviderConfig, 'createdAt' | 'updatedAt'>): Promise<Result<ModelProviderConfig>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    if (config.providers.some(p => p.id === provider.id)) {
      return err(createError('WS_ALREADY_EXISTS', 'model-config',
        `Provider "${provider.id}" already exists`, {
          recoverable: true,
          suggestedAction: 'Use a different provider ID.',
        }))
    }

    const now = new Date().toISOString()
    const newProvider: ModelProviderConfig = {
      ...provider,
      createdAt: now,
      updatedAt: now,
    }
    config.providers.push(newProvider)

    const writeResult = await this.writeAppConfigFile(config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(newProvider)
  }

  async updateAppProvider(providerId: string, patch: Partial<ModelProviderConfig>): Promise<Result<ModelProviderConfig>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const index = config.providers.findIndex(p => p.id === providerId)
    if (index === -1) {
      return err(createError('MODEL_PROVIDER_NOT_FOUND', 'model-config',
        `Provider "${providerId}" not found`))
    }

    const updated: ModelProviderConfig = {
      ...config.providers[index],
      ...patch,
      id: providerId,
      createdAt: config.providers[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    config.providers[index] = updated

    const writeResult = await this.writeAppConfigFile(config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(updated)
  }

  async deleteAppProvider(providerId: string): Promise<Result<void>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    config.providers = config.providers.filter(p => p.id !== providerId)
    config.models = config.models.filter(m => m.providerId !== providerId)
    config.bindings = config.bindings.filter(b => b.providerId !== providerId)

    // 删除关联密钥
    await this.deleteAppSecret(`provider-${providerId}-apiKey`)

    return this.writeAppConfigFile(config)
  }

  // ─── 应用级 Model CRUD ───

  async addAppModel(model: Omit<ModelProfileConfig, 'createdAt' | 'updatedAt'>): Promise<Result<ModelProfileConfig>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    if (config.models.some(m => m.id === model.id)) {
      return err(createError('WS_ALREADY_EXISTS', 'model-config',
        `Model "${model.id}" already exists`))
    }

    const now = new Date().toISOString()
    const newModel: ModelProfileConfig = { ...model, createdAt: now, updatedAt: now }
    config.models.push(newModel)

    const writeResult = await this.writeAppConfigFile(config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(newModel)
  }

  async updateAppModel(modelId: string, patch: Partial<ModelProfileConfig>): Promise<Result<ModelProfileConfig>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const index = config.models.findIndex(m => m.id === modelId)
    if (index === -1) {
      return err(createError('MODEL_PROFILE_NOT_FOUND', 'model-config',
        `Model "${modelId}" not found`))
    }

    const updated: ModelProfileConfig = {
      ...config.models[index],
      ...patch,
      id: modelId,
      createdAt: config.models[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    config.models[index] = updated

    const writeResult = await this.writeAppConfigFile(config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(updated)
  }

  async deleteAppModel(modelId: string): Promise<Result<void>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    config.models = config.models.filter(m => m.id !== modelId)
    config.bindings = config.bindings.filter(b => b.modelId !== modelId)

    return this.writeAppConfigFile(config)
  }

  // ─── 应用级 Binding CRUD ───

  async addAppBinding(binding: Omit<ModelBindingConfig, 'createdAt' | 'updatedAt'>): Promise<Result<ModelBindingConfig>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const now = new Date().toISOString()
    const newBinding: ModelBindingConfig = { ...binding, createdAt: now, updatedAt: now }
    config.bindings.push(newBinding)

    const writeResult = await this.writeAppConfigFile(config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(newBinding)
  }

  async updateAppBinding(bindingId: string, patch: Partial<ModelBindingConfig>): Promise<Result<ModelBindingConfig>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const index = config.bindings.findIndex(b => b.id === bindingId)
    if (index === -1) {
      return err(createError('MODEL_BINDING_NOT_FOUND', 'model-config',
        `Binding "${bindingId}" not found`))
    }

    const updated: ModelBindingConfig = {
      ...config.bindings[index],
      ...patch,
      id: bindingId,
      createdAt: config.bindings[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    config.bindings[index] = updated

    const writeResult = await this.writeAppConfigFile(config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(updated)
  }

  async deleteAppBinding(bindingId: string): Promise<Result<void>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    config.bindings = config.bindings.filter(b => b.id !== bindingId)
    return this.writeAppConfigFile(config)
  }

  // ─── 应用级默认设置 ───

  async setAppDefaultProvider(providerId: string): Promise<Result<void>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    if (!config.providers.some(p => p.id === providerId)) {
      return err(createError('MODEL_PROVIDER_NOT_FOUND', 'model-config',
        `Provider "${providerId}" not found`))
    }

    const extendedConfig = { ...config, defaultProviderId: providerId }
    return this.writeAppConfigFile(extendedConfig)
  }

  async setAppDefaultModel(modelId: string): Promise<Result<void>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    if (!config.models.some(m => m.id === modelId)) {
      return err(createError('MODEL_PROFILE_NOT_FOUND', 'model-config',
        `Model "${modelId}" not found`))
    }

    const extendedConfig = { ...config, defaultModelId: modelId }
    return this.writeAppConfigFile(extendedConfig)
  }

  // ─── 应用级密钥 ───

  async setAppSecret(key: string, value: string): Promise<Result<void>> {
    const secretsPath = this.getAppSecretsPath()
    const existing = await JsonStore.read<Record<string, string>>(secretsPath)
    const secrets = existing.ok ? existing.data : {}
    secrets[key] = value
    return JsonStore.write(secretsPath, secrets)
  }

  async getAppSecretPreview(key: string): Promise<Result<string>> {
    const secretsPath = this.getAppSecretsPath()
    const result = await JsonStore.read<Record<string, string>>(secretsPath)
    if (!result.ok || !(key in result.data)) {
      return ok('')
    }
    return ok('\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022')
  }

  async deleteAppSecret(key: string): Promise<Result<void>> {
    const secretsPath = this.getAppSecretsPath()
    const existing = await JsonStore.read<Record<string, string>>(secretsPath)
    if (!existing.ok) {
      return ok(undefined)
    }
    const secrets = { ...existing.data }
    if (!(key in secrets)) {
      return ok(undefined)
    }
    delete secrets[key]
    return JsonStore.write(secretsPath, secrets)
  }

  async listAppSecretKeys(): Promise<Result<string[]>> {
    const secretsPath = this.getAppSecretsPath()
    const result = await JsonStore.read<Record<string, string>>(secretsPath)
    if (!result.ok) return ok([])
    return ok(Object.keys(result.data))
  }

  // ─── 应用级状态 ───

  async getAppConfigState(): Promise<Result<{ state: ModelConfigState; blockedReason: string | null }>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>

    const cfg = configResult.data
    const { state, blockedReason } = resolveConfigState(
      cfg.providers,
      cfg.models,
      cfg.bindings,
      cfg.defaultProviderId,
      cfg.defaultModelId,
    )
    return ok({ state, blockedReason })
  }

  async getAppConfigStatus(): Promise<Result<ModelConfigStatus>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const enabledProviders = config.providers.filter(p => p.enabled)
    const enabledModels = config.models.filter(m => m.enabled && enabledProviders.some(p => p.id === m.providerId))
    const enabledBindings = config.bindings.filter(b => b.enabled && enabledModels.some(m => m.id === b.modelId))

    const defaultProviderId = config.defaultProviderId ?? null
    const defaultModelId = config.defaultModelId ?? null

    const defaultProvider = enabledProviders.find(p => p.id === defaultProviderId) ?? null
    const defaultModel = enabledModels.find(m => m.id === defaultModelId) ?? null

    return ok({
      hasProvider: enabledProviders.length > 0,
      hasModel: enabledModels.length > 0,
      hasBinding: enabledBindings.length > 0,
      defaultProvider: defaultProvider?.id ?? null,
      defaultModel: defaultModel?.id ?? null,
      defaultProviderName: defaultProvider?.name ?? null,
      defaultModelName: defaultModel?.displayName ?? defaultModel?.modelName ?? null,
    })
  }

  // ─── 应用级健康检查 ───

  async healthCheckApp(providerId: string): Promise<Result<{
    ok: boolean
    status: 'healthy' | 'degraded' | 'failed'
    latencyMs: number | null
    error: string | null
    checkedUrl: string | null
    checkedAt: string
  }>> {
    const configResult = await this.readAppConfigFile()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const provider = config.providers.find(p => p.id === providerId)
    if (!provider) {
      return err(createError('MODEL_PROVIDER_NOT_FOUND', 'model-config',
        `Provider "${providerId}" not found`))
    }

    const apiKeyKey = provider.apiKeyRef?.key ?? ''

    // 从应用级密钥存储获取 API Key
    const secretsPath = this.getAppSecretsPath()
    const secretsResult = await JsonStore.read<Record<string, string>>(secretsPath)
    const apiKey = (secretsResult.ok && apiKeyKey) ? secretsResult.data[apiKeyKey] : undefined

    const checkedAt = new Date().toISOString()

    // 使用 provider 配置驱动健康检查
    const url = buildModelsUrl(provider)

    if (!apiKey) {
      return ok({
        ok: false,
        status: 'failed',
        latencyMs: null,
        error: `API Key 未配置。请重新编辑服务商「${provider.name}」并填写 API Key。`,
        checkedUrl: url,
        checkedAt,
      })
    }

    const headers = buildProviderHeaders(
      { authMode: provider.authMode, authHeaderName: provider.authHeaderName },
      apiKey,
    )

    const startTime = Date.now()
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      })
      const latencyMs = Date.now() - startTime
      if (response.ok) {
        return ok({
          ok: true,
          status: 'healthy',
          latencyMs,
          error: null,
          checkedUrl: url,
          checkedAt,
        })
      }

      let detail = ''
      try {
        detail = await response.text()
      } catch {
        detail = ''
      }
      const shortDetail = detail.trim().slice(0, 300)
      return ok({
        ok: false,
        status: 'degraded',
        latencyMs,
        error: `HTTP ${response.status} ${response.statusText}${shortDetail ? `: ${shortDetail}` : ''}`,
        checkedUrl: url,
        checkedAt,
      })
    } catch (e) {
      const latencyMs = Date.now() - startTime
      return ok({
        ok: false,
        status: 'failed',
        latencyMs,
        error: e instanceof Error ? e.message : String(e),
        checkedUrl: url,
        checkedAt,
      })
    }
  }

  // ─── 模型候选列表 ───

  /**
   * 获取模型候选列表
   * 合并内置 preset 推荐模型 + 用户已配置模型，去重
   * @param providerId 可选，按服务商过滤
   */
  async listModelCandidates(providerId?: string): Promise<Result<ModelCandidate[]>> {
    const candidates: ModelCandidate[] = []
    const seenIds = new Set<string>()

    // 1. 从内置 preset 获取推荐模型作为候选
    const presets = getBuiltinProviderPresets()
    const filteredPresets = providerId
      ? presets.filter(p => p.id === providerId)
      : presets

    for (const preset of filteredPresets) {
      for (const recModel of preset.recommendedModels) {
        const candidateId = recModel.id
        if (seenIds.has(candidateId)) continue
        seenIds.add(candidateId)
        candidates.push({
          id: candidateId,
          modelName: recModel.modelName,
          displayName: recModel.displayName,
          providerId: preset.id,
          providerName: preset.name,
          providerIcon: preset.icon,
          capabilities: recModel.capabilities,
          contextWindow: recModel.contextWindow,
          supportsReasoning: recModel.supportsReasoning ?? false,
          supportsToolCall: recModel.supportsToolCall ?? false,
          supportsStreaming: preset.supportsStreaming,
          deprecated: recModel.deprecated ?? false,
          deprecationNote: recModel.deprecationNote ?? null,
          source: 'preset',
        })
      }
    }

    // 2. 从用户已配置的模型获取候选
    try {
      const configResult = await this.readAppConfigFile()
      if (configResult.ok) {
        const config = configResult.data
        const userModels = providerId
          ? config.models.filter(m => m.providerId === providerId)
          : config.models

        for (const model of userModels) {
          const candidateId = model.id
          if (seenIds.has(candidateId)) continue
          seenIds.add(candidateId)
          const provider = config.providers.find(p => p.id === model.providerId)
          candidates.push({
            id: candidateId,
            modelName: model.modelName,
            displayName: model.displayName,
            providerId: model.providerId,
            providerName: provider?.name ?? model.providerId,
            providerIcon: undefined,
            capabilities: model.capabilities,
            contextWindow: model.contextWindow,
            supportsReasoning: model.supportsReasoning ?? false,
            supportsToolCall: model.supportsToolCall ?? false,
            supportsStreaming: model.supportsStreaming ?? false,
            deprecated: model.deprecated ?? false,
            deprecationNote: model.deprecationNote ?? null,
            source: 'user',
          })
        }
      }
    } catch {
      // 用户配置读取失败不影响 preset 候选返回
    }

    return ok(candidates)
  }
}
