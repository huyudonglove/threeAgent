// src-main/model-config/model-health-check-service.ts
// 模型健康检查服务
// 重构：支持 ProviderConfig 驱动的认证模式和路径

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import { SecretStore } from './secret-store'
import type { ModelHealthCheckRecord, ModelProviderConfig } from './contracts'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

// ═══════════════════════════════════════════════════════════════
// 健康检查辅助函数
// ═══════════════════════════════════════════════════════════════

/**
 * 根据 provider 配置构建请求头
 */
export function buildProviderHeaders(
  provider: Pick<ModelProviderConfig, 'authMode' | 'authHeaderName'>,
  apiKey: string,
): Record<string, string> {
  const authMode = provider.authMode ?? 'authorization-bearer'
  const headerName = provider.authHeaderName ?? 'Authorization'

  switch (authMode) {
    case 'authorization-bearer':
      return { [headerName]: `Bearer ${apiKey}` }
    case 'api-key-header':
      return { [headerName]: apiKey }
    case 'custom-header':
      return { [headerName]: apiKey }
    default:
      return { [headerName]: `Bearer ${apiKey}` }
  }
}

/**
 * 根据 provider 配置构建健康检查 URL
 */
export function buildModelsUrl(provider: Pick<ModelProviderConfig, 'apiBaseUrl' | 'modelsPath'>): string {
  const apiBaseUrl = provider.apiBaseUrl.replace(/\/+$/, '')
  const modelsPath = provider.modelsPath ?? '/models'
  return `${apiBaseUrl}${modelsPath}`
}

// ═══════════════════════════════════════════════════════════════
// 健康检查服务
// ═══════════════════════════════════════════════════════════════

export class ModelHealthCheckService {
  /**
   * 对指定 provider 执行健康检查
   */
  async check(
    workspaceRootPath: string,
    providerId: string,
    apiBaseUrl: string,
    apiKeyKey: string,
    providerConfig?: Pick<ModelProviderConfig, 'authMode' | 'authHeaderName' | 'modelsPath'>,
  ): Promise<Result<ModelHealthCheckRecord>> {
    const secretStore = new SecretStore(workspaceRootPath)
    const apiKeyResult = await secretStore.get(apiKeyKey)

    if (!apiKeyResult.ok) {
      const record: ModelHealthCheckRecord = {
        id: `hc_${Date.now()}`,
        providerId,
        status: 'failed',
        latencyMs: null,
        error: 'API key not configured',
        checkedAt: new Date().toISOString(),
      }
      await this.saveRecord(workspaceRootPath, record)
      return ok(record)
    }

    // 使用 provider 配置构建请求头
    const resolvedProvider = {
      authMode: providerConfig?.authMode,
      authHeaderName: providerConfig?.authHeaderName,
      apiBaseUrl: apiBaseUrl,
      modelsPath: providerConfig?.modelsPath,
    }

    const headers = buildProviderHeaders(
      { authMode: resolvedProvider.authMode, authHeaderName: resolvedProvider.authHeaderName },
      apiKeyResult.data,
    )
    const url = buildModelsUrl(resolvedProvider)

    // 尝试发送最小请求
    const startTime = Date.now()
    try {
      const response = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000), // 10s 超时
      })
      const latencyMs = Date.now() - startTime

      const record: ModelHealthCheckRecord = {
        id: `hc_${Date.now()}`,
        providerId,
        status: response.ok ? 'healthy' : 'degraded',
        latencyMs,
        error: response.ok ? null : `HTTP ${response.status}: ${response.statusText}`,
        checkedAt: new Date().toISOString(),
      }
      await this.saveRecord(workspaceRootPath, record)
      return ok(record)
    } catch (e) {
      const latencyMs = Date.now() - startTime
      const record: ModelHealthCheckRecord = {
        id: `hc_${Date.now()}`,
        providerId,
        status: 'failed',
        latencyMs,
        error: e instanceof Error ? e.message : String(e),
        checkedAt: new Date().toISOString(),
      }
      await this.saveRecord(workspaceRootPath, record)
      return ok(record)
    }
  }

  /**
   * 获取最近的健康检查记录
   */
  async getLatestRecord(workspaceRootPath: string, providerId: string): Promise<Result<ModelHealthCheckRecord | null>> {
    const resolver = new PathResolver(workspaceRootPath)
    const result = await JsonStore.read<Record<string, ModelHealthCheckRecord>>(
      resolver.modelConfigDir + '/health-check.json',
    )
    if (!result.ok) return ok(null)
    return ok(result.data[providerId] ?? null)
  }

  /**
   * 保存健康检查记录
   */
  private async saveRecord(workspaceRootPath: string, record: ModelHealthCheckRecord): Promise<void> {
    const resolver = new PathResolver(workspaceRootPath)
    const filePath = resolver.modelConfigDir + '/health-check.json'
    const existing = await JsonStore.read<Record<string, ModelHealthCheckRecord>>(filePath)
    const records = existing.ok ? existing.data : {}
    records[record.providerId] = record
    await JsonStore.write(filePath, records)
  }
}
