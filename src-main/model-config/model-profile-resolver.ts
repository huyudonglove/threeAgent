// src-main/model-config/model-profile-resolver.ts
// 模型配置解析器

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import { SecretStore } from './secret-store'
import { resolveConfigState } from './state'
import type { GlobalModelConfig, WorkspaceModelConfig, ResolvedModelProfile, ModelProviderConfig, ModelProfileConfig, ModelBindingConfig } from './contracts'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

export class ModelProfileResolver {
  /**
   * 解析指定角色对应的完整运行时模型配置
   * 优先级：工作区级 > 全局级
   */
  async resolve(workspaceRootPath: string, role: string): Promise<Result<ResolvedModelProfile>> {
    // 1. 读取工作区级配置
    const wsResolver = new PathResolver(workspaceRootPath)
    const wsConfigResult = await JsonStore.read<WorkspaceModelConfig>(
      wsResolver.modelConfigDir + '/workspace-config.json',
    )
    const wsConfig = wsConfigResult.ok ? wsConfigResult.data : { providers: [], models: [], bindings: [] }

    // 2. 读取全局级配置
    const globalConfigResult = await JsonStore.read<GlobalModelConfig>(
      wsResolver.modelConfigDir + '/global-config.json',
    )
    const globalConfig = globalConfigResult.ok ? globalConfigResult.data : { providers: [], models: [], bindings: [] }

    // 3. 合并：工作区级覆盖全局级
    const allProviders = [...globalConfig.providers, ...wsConfig.providers]
    const allModels = [...globalConfig.models, ...wsConfig.models]
    const allBindings = [...globalConfig.bindings, ...wsConfig.bindings]

    // 4. 检查整体配置状态
    const { state, blockedReason } = resolveConfigState(allProviders, allModels, allBindings)
    if (state !== 'ready') {
      return err(createError('MODEL_CONFIG_BLOCKED', 'model-config', blockedReason ?? '模型配置不完整', {
        recoverable: true,
        suggestedAction: '请先完成服务商、模型和默认模型配置。',
      }))
    }

    // 5. 查找指定角色的 binding（工作区级优先）
    const binding = findBinding(allBindings, role)
    if (!binding) {
      return err(createError('MODEL_BINDING_NOT_FOUND', 'model-config', `No binding found for role "${role}"`, {
        recoverable: true,
        suggestedAction: 'Add a binding for this role in model configuration.',
      }))
    }

    // 6. 查找对应的 model 和 provider
    const model = allModels.find((m) => m.id === binding.modelId && m.enabled)
    if (!model) {
      return err(createError('MODEL_PROFILE_NOT_FOUND', 'model-config', `Model "${binding.modelId}" not found or disabled`, {
        recoverable: true,
        suggestedAction: 'Check if the model is configured and enabled.',
      }))
    }

    const provider = allProviders.find((p) => p.id === binding.providerId && p.enabled)
    if (!provider) {
      return err(createError('MODEL_PROVIDER_NOT_FOUND', 'model-config', `Provider "${binding.providerId}" not found or disabled`, {
        recoverable: true,
        suggestedAction: 'Check if the provider is configured and enabled.',
      }))
    }

    // 7. 检查密钥是否存在
    const secretStore = new SecretStore(workspaceRootPath)
    const hasApiKey = await secretStore.has(provider.apiKeyRef.key)

    return ok({
      providerId: provider.id,
      providerName: provider.name,
      providerType: provider.type,
      apiBaseUrl: provider.apiBaseUrl,
      modelId: model.id,
      modelName: model.modelName,
      capabilities: model.capabilities,
      bindingRole: binding.role,
      bindingScope: binding.scope,
      hasApiKey,
      state: hasApiKey ? 'ready' : 'provider_missing_key',
    })
  }
}

function findBinding(bindings: ModelBindingConfig[], role: string): ModelBindingConfig | undefined {
  // 工作区级优先
  const wsBinding = bindings.find((b) => b.role === role && b.scope === 'workspace' && b.enabled)
  if (wsBinding) return wsBinding
  return bindings.find((b) => b.role === role && b.scope === 'global' && b.enabled)
}
