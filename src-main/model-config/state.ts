// src-main/model-config/state.ts
// 模型配置状态管理

import type { ModelConfigState, ModelProviderConfig, ModelProfileConfig, ModelBindingConfig } from './contracts'

/**
 * 判断整体配置状态（§15.2 顺序，仅后端可检测的状态）
 * 注意：provider_missing_key 需要 access secret store，
 * not_tested / test_failed 需要 runtime test history，
 * 这些由前端 ModelConfigPage 补充判断。
 */
export function resolveConfigState(
  providers: ModelProviderConfig[],
  models: ModelProfileConfig[],
  bindings: ModelBindingConfig[],
  defaultProviderId?: string | null,
  defaultModelId?: string | null,
): { state: ModelConfigState; blockedReason: string | null } {
  const enabledProviders = providers.filter((p) => p.enabled)
  if (enabledProviders.length === 0) {
    return { state: 'no_provider', blockedReason: '尚未连接任何模型服务商' }
  }

  const enabledModels = models.filter((m) => m.enabled && enabledProviders.some((p) => p.id === m.providerId))
  if (enabledModels.length === 0) {
    return { state: 'no_model', blockedReason: '服务商已连接，但尚未选择可用模型' }
  }

  // 检查默认模型
  const hasDefaultModel = defaultModelId
    ? enabledModels.some(m => m.id === defaultModelId)
    : false
  if (!hasDefaultModel) {
    return { state: 'no_default_model', blockedReason: '已有模型，但尚未设置默认模型' }
  }

  // 配置完整（API Key / 测试状态由前端补充）
  return { state: 'ready', blockedReason: null }
}
