// src-main/storage/config-migration.ts
// 配置存储迁移：从工作区级迁移到应用级

import path from 'node:path'
import { AppPathResolver } from './app-path-resolver'
import { JsonStore } from './json-store'
import { WorkspaceManager } from './workspace-manager'
import type { AppPluginRegistry } from '../plugins/plugin-config-manager'
import type { AppModelConfig } from '../model-config/contracts'

export interface MigrationResult {
  modelConfigMigrated: boolean
  pluginConfigMigrated: boolean
  errors: string[]
}

export class ConfigMigrationService {
  constructor(
    private appPathResolver: AppPathResolver,
    private workspaceManager: WorkspaceManager
  ) {}

  /**
   * 执行配置迁移
   * - 首次读取应用级配置时，若不存在则从最近工作区迁移
   * - 迁移失败不阻塞应用启动
   * - 不删除旧文件
   * - 可重复执行不重复导入（已有应用级配置则跳过）
   */
  async migrate(): Promise<MigrationResult> {
    const result: MigrationResult = {
      modelConfigMigrated: false,
      pluginConfigMigrated: false,
      errors: [],
    }

    try {
      result.modelConfigMigrated = await this.migrateModelConfig()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`Model config migration failed: ${msg}`)
    }

    try {
      result.pluginConfigMigrated = await this.migratePluginConfig()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.errors.push(`Plugin config migration failed: ${msg}`)
    }

    return result
  }

  private async migrateModelConfig(): Promise<boolean> {
    // 1. 检查应用级配置是否已存在且非空
    const appConfigExists = await JsonStore.exists(this.appPathResolver.modelConfigPath)
    if (appConfigExists) {
      const readResult = await JsonStore.read<AppModelConfig>(this.appPathResolver.modelConfigPath)
      if (readResult.ok) {
        const data = readResult.data
        const hasContent =
          (Array.isArray(data.providers) && data.providers.length > 0) ||
          (Array.isArray(data.models) && data.models.length > 0) ||
          (Array.isArray(data.bindings) && data.bindings.length > 0)
        if (hasContent) {
          return false
        }
      }
    }

    // 2. 获取最近工作区列表
    const recentResult = await this.workspaceManager.listRecentWorkspaces()
    if (!recentResult.ok) {
      throw new Error(`Failed to list recent workspaces: ${recentResult.error.message}`)
    }
    const workspaces = recentResult.data

    // 3. 遍历最近工作区查找旧配置
    for (const ws of workspaces) {
      const oldConfigPath = path.join(ws.path, '.agent-workspace', 'model-config', 'global-config.json')
      const oldSecretsPath = path.join(ws.path, '.agent-workspace', 'model-config', 'secrets.json')
      const fallbackSecretsPath = path.join(ws.path, '.agent-workspace', 'secrets.json')

      const oldConfigExists = await JsonStore.exists(oldConfigPath)
      if (!oldConfigExists) continue

      const configResult = await JsonStore.read<AppModelConfig>(oldConfigPath)
      if (!configResult.ok) continue

      const data = configResult.data
      const hasContent =
        (Array.isArray(data.providers) && data.providers.length > 0) ||
        (Array.isArray(data.models) && data.models.length > 0) ||
        (Array.isArray(data.bindings) && data.bindings.length > 0)
      if (!hasContent) continue

      // 复制配置
      const writeResult = await JsonStore.write(this.appPathResolver.modelConfigPath, data)
      if (!writeResult.ok) {
        throw new Error(`Failed to write model config: ${writeResult.error.message}`)
      }

      // 复制密钥文件（优先任务指定的路径，其次 fallback 到 PathResolver 实际路径）
      const secretsSourcePath = (await JsonStore.exists(oldSecretsPath))
        ? oldSecretsPath
        : (await JsonStore.exists(fallbackSecretsPath))
          ? fallbackSecretsPath
          : null

      if (secretsSourcePath) {
        const secretsResult = await JsonStore.read<Record<string, string>>(secretsSourcePath)
        if (secretsResult.ok) {
          await JsonStore.write(this.appPathResolver.secretsPath, secretsResult.data)
        }
      }

      return true
    }

    return false
  }

  private async migratePluginConfig(): Promise<boolean> {
    // 1. 检查应用级插件库是否已存在且非空
    const appRegistryExists = await JsonStore.exists(this.appPathResolver.pluginRegistryPath)
    if (appRegistryExists) {
      const readResult = await JsonStore.read<AppPluginRegistry>(this.appPathResolver.pluginRegistryPath)
      if (readResult.ok) {
        const data = readResult.data
        const hasContent = Array.isArray(data.installedPlugins) && data.installedPlugins.length > 0
        if (hasContent) {
          return false
        }
      }
    }

    // 2. 获取最近工作区列表
    const recentResult = await this.workspaceManager.listRecentWorkspaces()
    if (!recentResult.ok) {
      throw new Error(`Failed to list recent workspaces: ${recentResult.error.message}`)
    }
    const workspaces = recentResult.data

    // 3. 遍历最近工作区查找旧配置
    for (const ws of workspaces) {
      const oldConfigPath = path.join(ws.path, '.agent-workspace', 'domains', 'plugin-config.json')

      const oldConfigExists = await JsonStore.exists(oldConfigPath)
      if (!oldConfigExists) continue

      const configResult = await JsonStore.read<{ enabledPlugins?: unknown[] }>(oldConfigPath)
      if (!configResult.ok) continue

      const enabledPlugins = configResult.data.enabledPlugins
      if (!Array.isArray(enabledPlugins) || enabledPlugins.length === 0) continue

      // 转换格式
      const registry: AppPluginRegistry = {
        installedPlugins: enabledPlugins as AppPluginRegistry['installedPlugins'],
        lastModifiedAt: new Date().toISOString(),
      }

      const writeResult = await JsonStore.write(this.appPathResolver.pluginRegistryPath, registry)
      if (!writeResult.ok) {
        throw new Error(`Failed to write plugin registry: ${writeResult.error.message}`)
      }

      return true
    }

    return false
  }
}
