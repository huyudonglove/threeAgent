// src-main/model-runtime/model-invoke-service.ts
// 统一模型调用服务
// 职责：
// 1. 解析模型配置（provider + model + api key）
// 2. 选择合适的 Provider 适配器
// 3. 执行 stream / blocking 调用
// 4. 处理降级（不支持流式的 provider 降级到 blocking）

import { ModelConfigManager } from '../model-config/model-config-manager'
import { ModelProfileResolver } from '../model-config/model-profile-resolver'
import type { ResolvedModelProfile } from '../model-config/contracts'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import { OpenAICompatibleAdapter } from './provider-adapters/openai-compatible-adapter'
import type {
  ModelInvokeInput,
  ModelInvokeOutput,
  ModelStreamEvent,
  StreamEventCallback,
  ProviderAdapter,
} from './contracts'

export class ModelInvokeService {
  private adapters: Map<string, ProviderAdapter> = new Map()
  private modelConfigManager: ModelConfigManager
  private profileResolver: ModelProfileResolver

  constructor(
    modelConfigManager: ModelConfigManager,
    profileResolver: ModelProfileResolver,
  ) {
    this.modelConfigManager = modelConfigManager
    this.profileResolver = profileResolver

    // 注册内置适配器
    this.registerAdapter(new OpenAICompatibleAdapter())
  }

  /**
   * 注册 Provider 适配器
   */
  registerAdapter(adapter: ProviderAdapter): void {
    this.adapters.set(adapter.protocol, adapter)
  }

  /**
   * 统一调用入口
   * 根据 mode 选择 stream 或 blocking 路径
   */
  async invoke(input: ModelInvokeInput): Promise<Result<ModelInvokeOutput>> {
    try {
      // 1. 解析模型配置
      const profileResult = await this.resolveProfile(input)
      if (!profileResult.ok) return profileResult as Result<never>
      const profile = profileResult.data

      // 2. 获取 API Key
      const apiKeyResult = await this.resolveApiKey(profile)
      if (!apiKeyResult.ok) return apiKeyResult as Result<never>
      const apiKey = apiKeyResult.data

      // 3. 选择合适的适配器
      const adapter = this.selectAdapter(profile)
      if (!adapter) {
        return err(createError('MODEL_ADAPTER_NOT_FOUND', 'model-runtime',
          `No adapter found for provider protocol "${(profile as unknown as { providerProtocol?: string }).providerProtocol ?? 'unknown'}"`))
      }

      // 4. 构建完整调用输入
      const invokeInput: ModelInvokeInput = {
        ...input,
        resolvedProfile: profile,
        apiKey,
      }

      // 5. 检查流式支持
      if (invokeInput.mode === 'stream') {
        const supportsStreaming = (profile as unknown as { supportsStreaming?: boolean }).supportsStreaming !== false
        if (!supportsStreaming) {
          // 降级到 blocking
          invokeInput.mode = 'blocking'
        }
      }

      // 6. 执行调用
      const output = await adapter.invoke(invokeInput)
      return ok(output)
    } catch (e) {
      return err(createError('MODEL_INVOKE_FAILED', 'model-runtime',
        e instanceof Error ? e.message : String(e)))
    }
  }

  /**
   * 流式调用
   */
  async invokeStream(input: ModelInvokeInput, onEvent: StreamEventCallback): Promise<void> {
    // 1. 解析模型配置
    const profileResult = await this.resolveProfile(input)
    if (!profileResult.ok) {
      onEvent({ type: 'error', message: profileResult.error!.message, recoverable: false })
      return
    }
    const profile = profileResult.data

    // 2. 获取 API Key
    const apiKeyResult = await this.resolveApiKey(profile)
    if (!apiKeyResult.ok) {
      onEvent({ type: 'error', message: apiKeyResult.error!.message, recoverable: false })
      return
    }
    const apiKey = apiKeyResult.data

    // 3. 选择合适的适配器
    const adapter = this.selectAdapter(profile)
    if (!adapter) {
      onEvent({
        type: 'error',
        message: `No adapter found for protocol "${(profile as unknown as { providerProtocol?: string }).providerProtocol ?? 'unknown'}"`,
        recoverable: false,
      })
      return
    }

    // 4. 检查流式支持
    const supportsStreaming = (profile as unknown as { supportsStreaming?: boolean }).supportsStreaming !== false
    if (!supportsStreaming) {
      // 降级到 blocking 并转化为单次流式事件
      const invokeInput: ModelInvokeInput = {
        ...input,
        mode: 'blocking',
        resolvedProfile: profile,
        apiKey,
      }
      try {
        const output = await adapter.invoke(invokeInput)
        onEvent({ type: 'start', requestId: output.requestId, modelId: output.modelId })
        onEvent({ type: 'delta', text: output.content })
        onEvent({ type: 'done', usage: output.usage, finishReason: output.finishReason })
      } catch (e) {
        onEvent({ type: 'error', message: e instanceof Error ? e.message : String(e), recoverable: false })
      }
      return
    }

    // 5. 执行流式调用
    const invokeInput: ModelInvokeInput = {
      ...input,
      mode: 'stream',
      resolvedProfile: profile,
      apiKey,
    }
    await adapter.invokeStream(invokeInput, onEvent)
  }

  // ═══════════════════════════════════════════════════════════════
  // 私有辅助方法
  // ═══════════════════════════════════════════════════════════════

  /**
   * 解析模型配置（若未提供 resolvedProfile）
   */
  private async resolveProfile(input: ModelInvokeInput): Promise<Result<ResolvedModelProfile>> {
    // 优先使用已解析的 profile
    if (input.resolvedProfile) {
      return ok(input.resolvedProfile)
    }

    // 从配置管理器解析
    if (input.workspaceRootPath && input.role) {
      return this.profileResolver.resolve(input.workspaceRootPath, input.role)
    }

    // 读取应用级配置
    const configResult = await this.modelConfigManager.readAppConfig()
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    let providerId = input.providerId ?? config.defaultProviderId
    let modelId = input.modelId ?? config.defaultModelId

    if (!providerId) {
      return err(createError('MODEL_CONFIG_MISSING', 'model-runtime',
        'No provider configured. Please configure a model provider first.'))
    }

    const provider = config.providers.find(p => p.id === providerId)
    if (!provider) {
      return err(createError('MODEL_PROVIDER_NOT_FOUND', 'model-runtime',
        `Provider "${providerId}" not found`))
    }

    if (!modelId) {
      // 选择该 provider 下第一个启用的模型
      const firstModel = config.models.find(m => m.providerId === providerId && m.enabled)
      modelId = firstModel?.id
    }

    const model = modelId ? config.models.find(m => m.id === modelId) : undefined
    if (!model) {
      return err(createError('MODEL_PROFILE_NOT_FOUND', 'model-runtime',
        'No model configured. Please configure a model first.'))
    }

    // 检查是否配置了 API Key
    const secretsPath = this.modelConfigManager['getAppSecretsPath']?.()
    const { JsonStore } = await import('../storage/json-store')
    const secretsResult = secretsPath ? await JsonStore.read<Record<string, string>>(secretsPath) : { ok: false as const }
    const apiKeyKey = provider.apiKeyRef?.key ?? ''
    const hasApiKey = secretsResult.ok ? !!secretsResult.data[apiKeyKey] : false

    const resolvedProfile: ResolvedModelProfile = {
      providerId: provider.id,
      providerName: provider.name,
      providerType: provider.type,
      apiBaseUrl: provider.apiBaseUrl,
      modelId: model.id,
      modelName: model.modelName,
      capabilities: model.capabilities,
      bindingRole: input.role ?? 'default',
      bindingScope: 'global',
      hasApiKey,
      state: hasApiKey ? 'ready' : 'provider_missing_key',
    }

    return ok(resolvedProfile)
  }

  /**
   * 获取 API Key
   */
  private async resolveApiKey(profile: ResolvedModelProfile): Promise<Result<string>> {
    if (!profile.hasApiKey) {
      return err(createError('MODEL_API_KEY_MISSING', 'model-runtime',
        `API key not configured for provider "${profile.providerId}"`))
    }

    // 从应用级密钥存储获取
    const appResolver = (this.modelConfigManager as unknown as { appPathResolver?: { secretsPath: string } }).appPathResolver
    if (appResolver) {
      const { JsonStore } = await import('../storage/json-store')
      const secretsResult = await JsonStore.read<Record<string, string>>(appResolver.secretsPath)
      if (secretsResult.ok) {
        const apiKeyKey = `provider-${profile.providerId}-apiKey`
        const apiKey = secretsResult.data[apiKeyKey]
        if (apiKey) {
          return ok(apiKey)
        }
      }
    }

    return err(createError('MODEL_API_KEY_NOT_FOUND', 'model-runtime',
      `API key not found for provider "${profile.providerId}"`))
  }

  /**
   * 选择合适的 Provider 适配器
   */
  private selectAdapter(profile: ResolvedModelProfile): ProviderAdapter | undefined {
    const providerProtocol = (profile as unknown as { providerProtocol?: string }).providerProtocol
    const providerType = profile.providerType

    // 按协议选择
    if (providerProtocol) {
      return this.adapters.get(providerProtocol)
    }

    // 按 provider type 选择
    switch (providerType) {
      case 'openai':
        return this.adapters.get('openai-compatible')
      case 'custom':
        return this.adapters.get('openai-compatible')
      default:
        return undefined
    }
  }
}
