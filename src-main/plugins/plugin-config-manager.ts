// src-main/plugins/plugin-config-manager.ts
// 插件配置管理器：读写 WorkspacePluginConfig，启用/禁用插件
// 来源：10-领域工作流/PluginLoadingAndConfig插件加载与配置、SafetyAndPermissionPolicy安全与权限策略

import path from 'node:path'
import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import { JsonlStore } from '../storage/jsonl-store'
import type { PluginEnablementRecord, PluginEnablementStatus, DomainWorkflowDefinition } from '../contracts/types'
import { PLUGIN_ENABLEMENT_TRANSITIONS } from '../contracts/status'
import { validatePluginSafety } from '../validation/safety-validation'
import { previewEnableImpact, previewDisableImpact } from './plugin-impact-preview'
import type { PluginImpactPreview } from './plugin-impact-preview'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import type { AppPathResolver } from '../storage/app-path-resolver'
import { checkWorkflowPluginConflict, checkRolePluginConflict } from './plugin-conflict-check'
import type { ConflictCheckResult } from './plugin-conflict-check'

// ─── WorkspacePluginConfig ───

/**
 * 工作区级插件配置
 * 持久化到 .agent-workspace/domains/plugin-config.json
 */
export interface WorkspacePluginConfig {
  workspaceId: string
  enabledPlugins: PluginEnablementRecord[]
  lastModifiedAt: string
}

// ─── AppPluginRegistry ───

/**
 * 应用级插件库
 * 持久化到 appPathResolver.pluginRegistryPath
 */
export interface AppPluginRegistry {
  installedPlugins: PluginEnablementRecord[]
  lastModifiedAt: string
}

// ─── PluginConfigManager ───

export class PluginConfigManager {
  private appPathResolver?: AppPathResolver

  constructor(appPathResolver?: AppPathResolver) {
    this.appPathResolver = appPathResolver
  }
  /**
   * 读取工作区插件配置
   */
  async readConfig(workspaceRootPath: string): Promise<Result<WorkspacePluginConfig>> {
    const resolver = new PathResolver(workspaceRootPath)
    const configPath = path.join(resolver.domainsDir, 'plugin-config.json')

    const exists = await JsonStore.exists(configPath)
    if (!exists) {
      // 返回空配置
      return ok({
        workspaceId: '',
        enabledPlugins: [],
        lastModifiedAt: new Date().toISOString(),
      })
    }

    const result = await JsonStore.read<WorkspacePluginConfig>(configPath)
    if (!result.ok) return result

    return ok(result.data)
  }

  /**
   * 写入工作区插件配置
   */
  async writeConfig(workspaceRootPath: string, config: WorkspacePluginConfig): Promise<Result<void>> {
    const resolver = new PathResolver(workspaceRootPath)
    const configPath = path.join(resolver.domainsDir, 'plugin-config.json')

    const updated: WorkspacePluginConfig = {
      ...config,
      lastModifiedAt: new Date().toISOString(),
    }

    return JsonStore.write(configPath, updated)
  }

  /**
   * 预览启用插件的影响
   * 来源：模块接口I/O契约 - PluginConfigManager.previewPluginImpact
   */
  async previewPluginImpact(
    workspaceRootPath: string,
    pluginId: string,
    pluginType: 'workflow' | 'role' | 'skill',
    action: 'enable' | 'disable',
    input?: {
      workflow?: DomainWorkflowDefinition
      existingWorkflows?: DomainWorkflowDefinition[]
      existingRoles?: string[]
      hasHighRiskTools?: boolean
      dependentTaskIds?: string[]
    },
  ): Promise<Result<PluginImpactPreview>> {
    const configResult = await this.readConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    // 查找插件名
    const existing = config.enabledPlugins.find(p => p.pluginId === pluginId)
    const pluginName = existing?.pluginName ?? pluginId

    if (action === 'enable') {
      return previewEnableImpact(pluginId, pluginType, pluginName, {
        workflow: input?.workflow,
        existingWorkflows: input?.existingWorkflows ?? [],
        existingRoles: input?.existingRoles ?? [],
        enabledPlugins: config.enabledPlugins,
        hasHighRiskTools: input?.hasHighRiskTools,
      })
    } else {
      return previewDisableImpact(pluginId, pluginType, pluginName, {
        dependentTaskIds: input?.dependentTaskIds ?? [],
        enabledPlugins: config.enabledPlugins,
      })
    }
  }

  /**
   * 启用插件
   * 来源：模块接口I/O契约 - PluginConfigManager.enablePlugin
   *
   * 步骤：
   * 1. 预览影响
   * 2. 如果有阻断项，拒绝启用
   * 3. 如果需要确认且未确认，返回 pending_confirmation
   * 4. 安全校验
   * 5. 创建 PluginEnablementRecord 并写入
   * 6. 写 DisplayTrace（如果传入 traceService）
   */
  async enablePlugin(input: {
    workspaceRootPath: string
    pluginId: string
    pluginType: 'workflow' | 'role' | 'skill'
    pluginName: string
    domain?: string
    version?: string
    operatorRole: string
    reason: string
    confirmedByUser?: boolean
    hasHighRiskTools?: boolean
    affectsRunningTasks?: boolean
    existingWorkflows?: DomainWorkflowDefinition[]
    existingRoles?: string[]
    affectedObjectIds?: string[]
  }): Promise<Result<PluginEnablementRecord>> {
    // 1. 读取当前配置
    const configResult = await this.readConfig(input.workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    // 2. 检查是否已启用
    const existingRecord = config.enabledPlugins.find(
      p => p.pluginId === input.pluginId && p.status === 'enabled',
    )
    if (existingRecord) {
      return err(createError('VALIDATION_CONFLICT_FAILED', 'plugin',
        `Plugin "${input.pluginId}" is already enabled`, {
          recoverable: true,
          suggestedAction: 'Disable the plugin first if you want to re-enable it.',
        }))
    }

    // 3. 安全校验
    const safetyValidation = validatePluginSafety(
      input.pluginId,
      input.pluginType,
      input.hasHighRiskTools ?? false,
      input.affectsRunningTasks ?? false,
    )
    if (!safetyValidation.ok) {
      return err(createError('VALIDATION_SAFETY_FAILED', 'plugin',
        `Safety validation failed for plugin "${input.pluginId}"`, {
          detail: safetyValidation.issues,
        }))
    }

    // 4. 预览冲突
    const preview = previewEnableImpact(
      input.pluginId, input.pluginType, input.pluginName, {
        existingWorkflows: input.existingWorkflows ?? [],
        existingRoles: input.existingRoles ?? [],
        enabledPlugins: config.enabledPlugins,
        hasHighRiskTools: input.hasHighRiskTools,
        affectsRunningTasks: input.affectsRunningTasks,
      },
    )
    if (!preview.ok) return preview as Result<never>

    // 5. 如果有阻断项，拒绝
    if (!preview.data.canProceed) {
      return err(createError('VALIDATION_CONFLICT_FAILED', 'plugin',
        `Cannot enable plugin "${input.pluginId}": blocking conflicts detected`, {
          detail: preview.data.impacts,
        }))
    }

    // 6. 确定状态
    let status: PluginEnablementStatus = 'enabled'
    if (preview.data.requiresConfirmation && !input.confirmedByUser) {
      status = 'pending_confirmation'
    }

    // 7. 创建记录
    const now = new Date().toISOString()
    const record: PluginEnablementRecord = {
      id: `plugin_${Date.now()}`,
      pluginId: input.pluginId,
      pluginType: input.pluginType,
      pluginName: input.pluginName,
      status,
      domain: input.domain,
      version: input.version,
      enabledAt: status === 'enabled' ? now : null,
      disabledAt: null,
      enabledBy: input.operatorRole,
      reason: input.reason,
      affectedObjectIds: input.affectedObjectIds ?? [],
      createdAt: now,
      updatedAt: now,
    }

    // 8. 写入配置
    // 移除同 pluginId 的旧记录（如果存在 disabled/failed）
    config.enabledPlugins = config.enabledPlugins.filter(
      p => p.pluginId !== input.pluginId,
    )
    config.enabledPlugins.push(record)

    const writeResult = await this.writeConfig(input.workspaceRootPath, config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(record)
  }

  /**
   * 禁用插件
   * 来源：模块接口I/O契约 - PluginConfigManager.disablePlugin
   */
  async disablePlugin(input: {
    workspaceRootPath: string
    pluginId: string
    operatorRole: string
    reason: string
    dependentTaskIds?: string[]
  }): Promise<Result<PluginEnablementRecord>> {
    // 1. 读取当前配置
    const configResult = await this.readConfig(input.workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    // 2. 查找记录
    const recordIndex = config.enabledPlugins.findIndex(
      p => p.pluginId === input.pluginId && p.status === 'enabled',
    )
    if (recordIndex === -1) {
      return err(createError('VALIDATION_FAILED', 'plugin',
        `Plugin "${input.pluginId}" is not enabled`, {
          recoverable: true,
          suggestedAction: 'The plugin may already be disabled or not exist.',
        }))
    }

    const record = config.enabledPlugins[recordIndex]

    // 3. 运行中依赖检查
    const dependentTaskIds = input.dependentTaskIds ?? []
    if (dependentTaskIds.length > 0) {
      return err(createError('PLUGIN_RUNTIME_DEPENDENCY_ACTIVE', 'plugin',
        `Cannot disable plugin "${input.pluginId}": ${dependentTaskIds.length} running task(s) depend on it`, {
          recoverable: true,
          suggestedAction: 'Wait for the tasks to complete or cancel them first.',
          detail: { dependentTaskIds },
        }))
    }

    // 4. 预览禁用影响
    const preview = previewDisableImpact(
      input.pluginId, record.pluginType, record.pluginName, {
        dependentTaskIds,
        enabledPlugins: config.enabledPlugins,
      },
    )
    if (!preview.ok) return preview as Result<never>

    if (!preview.data.canProceed) {
      return err(createError('VALIDATION_CONFLICT_FAILED', 'plugin',
        `Cannot disable plugin "${input.pluginId}": blocking conflicts detected`, {
          detail: preview.data.impacts,
        }))
    }

    // 5. 更新记录
    const now = new Date().toISOString()
    const updatedRecord: PluginEnablementRecord = {
      ...record,
      status: 'disabled',
      disabledAt: now,
      updatedAt: now,
    }

    config.enabledPlugins[recordIndex] = updatedRecord

    // 6. 写入配置
    const writeResult = await this.writeConfig(input.workspaceRootPath, config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(updatedRecord)
  }

  /**
   * 确认启用（从 pending_confirmation → enabled）
   */
  async confirmEnable(
    workspaceRootPath: string,
    pluginId: string,
  ): Promise<Result<PluginEnablementRecord>> {
    const configResult = await this.readConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>
    const config = configResult.data

    const recordIndex = config.enabledPlugins.findIndex(
      p => p.pluginId === pluginId && p.status === 'pending_confirmation',
    )
    if (recordIndex === -1) {
      return err(createError('VALIDATION_FAILED', 'plugin',
        `Plugin "${pluginId}" is not in pending_confirmation state`))
    }

    const record = config.enabledPlugins[recordIndex]
    const now = new Date().toISOString()
    const updatedRecord: PluginEnablementRecord = {
      ...record,
      status: 'enabled',
      enabledAt: now,
      updatedAt: now,
    }

    config.enabledPlugins[recordIndex] = updatedRecord
    const writeResult = await this.writeConfig(workspaceRootPath, config)
    if (!writeResult.ok) return writeResult as Result<never>

    return ok(updatedRecord)
  }

  /**
   * 列出已启用的插件
   */
  async listEnabledPlugins(workspaceRootPath: string): Promise<Result<PluginEnablementRecord[]>> {
    const configResult = await this.readConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>

    return ok(configResult.data.enabledPlugins.filter(p => p.status === 'enabled'))
  }

  /**
   * 列出所有插件记录（包括 disabled/failed）
   */
  async listAllPlugins(workspaceRootPath: string): Promise<Result<PluginEnablementRecord[]>> {
    const configResult = await this.readConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>

    return ok(configResult.data.enabledPlugins)
  }

  /**
   * 获取指定插件记录
   */
  async getPluginRecord(
    workspaceRootPath: string,
    pluginId: string,
  ): Promise<Result<PluginEnablementRecord | null>> {
    const configResult = await this.readConfig(workspaceRootPath)
    if (!configResult.ok) return configResult as Result<never>

    const record = configResult.data.enabledPlugins.find(p => p.pluginId === pluginId) ?? null
    return ok(record)
  }

  // ═══════════════════════════════════════════════════════════════════
  // 应用级插件库方法（不需要工作区路径）
  // ═══════════════════════════════════════════════════════════════════

  private async readAppRegistry(): Promise<Result<AppPluginRegistry>> {
    if (!this.appPathResolver) {
      return err(createError('VALIDATION_FAILED', 'plugin', 'AppPathResolver not configured'))
    }
    const registryPath = this.appPathResolver.pluginRegistryPath
    const exists = await JsonStore.exists(registryPath)
    if (!exists) {
      return ok({
        installedPlugins: [],
        lastModifiedAt: new Date().toISOString(),
      })
    }
    const result = await JsonStore.read<AppPluginRegistry>(registryPath)
    if (!result.ok) return result
    return ok(result.data)
  }

  private async writeAppRegistry(registry: AppPluginRegistry): Promise<Result<void>> {
    if (!this.appPathResolver) {
      return err(createError('VALIDATION_FAILED', 'plugin', 'AppPathResolver not configured'))
    }
    const registryPath = this.appPathResolver.pluginRegistryPath
    const updated: AppPluginRegistry = {
      ...registry,
      lastModifiedAt: new Date().toISOString(),
    }
    return JsonStore.write(registryPath, updated)
  }

  /**
   * 列出应用级所有插件
   */
  async listAppPlugins(): Promise<Result<PluginEnablementRecord[]>> {
    const result = await this.readAppRegistry()
    if (!result.ok) return result as Result<never>
    return ok(result.data.installedPlugins)
  }

  /**
   * 列出应用级已启用插件
   */
  async listEnabledAppPlugins(): Promise<Result<PluginEnablementRecord[]>> {
    const result = await this.readAppRegistry()
    if (!result.ok) return result as Result<never>
    return ok(result.data.installedPlugins.filter(p => p.status === 'enabled'))
  }

  /**
   * 获取应用级指定插件
   */
  async getAppPlugin(pluginId: string): Promise<Result<PluginEnablementRecord | null>> {
    const result = await this.readAppRegistry()
    if (!result.ok) return result as Result<never>
    const record = result.data.installedPlugins.find(p => p.pluginId === pluginId) ?? null
    return ok(record)
  }

  /**
   * 保存应用级插件（启用）
   */
  async saveAppPlugin(pluginConfig: PluginEnablementRecord): Promise<Result<void>> {
    const registryResult = await this.readAppRegistry()
    if (!registryResult.ok) return registryResult as Result<never>
    const registry = registryResult.data

    // 移除同 pluginId 的旧记录
    registry.installedPlugins = registry.installedPlugins.filter(
      p => p.pluginId !== pluginConfig.pluginId,
    )
    registry.installedPlugins.push(pluginConfig)

    return this.writeAppRegistry(registry)
  }

  /**
   * 移除应用级插件
   */
  async removeAppPlugin(pluginId: string): Promise<Result<void>> {
    const registryResult = await this.readAppRegistry()
    if (!registryResult.ok) return registryResult as Result<never>
    const registry = registryResult.data

    const index = registry.installedPlugins.findIndex(p => p.pluginId === pluginId)
    if (index === -1) {
      return err(createError('VALIDATION_FAILED', 'plugin',
        `Plugin "${pluginId}" not found in app registry`, {
          recoverable: true,
          suggestedAction: 'The plugin may not be installed.',
        }))
    }

    // 更新为 disabled 状态而非直接移除
    const now = new Date().toISOString()
    registry.installedPlugins[index] = {
      ...registry.installedPlugins[index],
      status: 'disabled',
      disabledAt: now,
      updatedAt: now,
    }

    return this.writeAppRegistry(registry)
  }

  /**
   * 更新应用级插件配置
   */
  async updateAppPluginConfig(pluginId: string, patch: Record<string, unknown>): Promise<Result<void>> {
    const registryResult = await this.readAppRegistry()
    if (!registryResult.ok) return registryResult as Result<never>
    const registry = registryResult.data

    const index = registry.installedPlugins.findIndex(p => p.pluginId === pluginId)
    if (index === -1) {
      return err(createError('VALIDATION_FAILED', 'plugin',
        `Plugin "${pluginId}" not found in app registry`))
    }

    registry.installedPlugins[index] = {
      ...registry.installedPlugins[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    } as PluginEnablementRecord

    return this.writeAppRegistry(registry)
  }

  /**
   * 应用级插件冲突检查
   */
  async checkAppPluginConflict(pluginIds: string[]): Promise<Result<ConflictCheckResult>> {
    const registryResult = await this.readAppRegistry()
    if (!registryResult.ok) return registryResult as Result<never>
    const registry = registryResult.data

    // 对每个 pluginId 做冲突检查，合并结果
    const allImpacts: import('./plugin-conflict-check').PluginImpactItem[] = []
    let canProceed = true
    let requiresConfirmation = false

    for (const pluginId of pluginIds) {
      const record = registry.installedPlugins.find(p => p.pluginId === pluginId)
      if (!record) continue

      if (record.pluginType === 'workflow') {
        const check = checkWorkflowPluginConflict(
          { id: record.pluginId, name: record.pluginName, taskDomain: record.domain ?? '', version: record.version ?? '1.0', status: 'custom', nodes: [], roleBindings: [], skillBindings: [] },
          [],
          registry.installedPlugins,
        )
        allImpacts.push(...check.impacts)
        if (!check.canProceed) canProceed = false
        if (check.requiresConfirmation) requiresConfirmation = true
      } else if (record.pluginType === 'role') {
        const check = checkRolePluginConflict(
          record.pluginName,
          [],
          registry.installedPlugins,
        )
        allImpacts.push(...check.impacts)
        if (!check.canProceed) canProceed = false
        if (check.requiresConfirmation) requiresConfirmation = true
      }
    }

    return ok({
      canProceed,
      requiresConfirmation,
      impacts: allImpacts,
      validation: { ok: canProceed, result: canProceed ? 'passed' as const : 'failed' as const, issues: [] },
    })
  }

  /**
   * 应用级插件影响预览
   */
  async previewAppPluginImpact(
    pluginId: string,
    pluginType: string,
    action: string,
  ): Promise<Result<PluginImpactPreview>> {
    const registryResult = await this.readAppRegistry()
    if (!registryResult.ok) return registryResult as Result<never>
    const registry = registryResult.data

    const existing = registry.installedPlugins.find(p => p.pluginId === pluginId)
    const pluginName = existing?.pluginName ?? pluginId

    if (action === 'enable') {
      return previewEnableImpact(pluginId, pluginType as 'workflow' | 'role' | 'skill', pluginName, {
        existingWorkflows: [],
        existingRoles: [],
        enabledPlugins: registry.installedPlugins,
      })
    } else {
      return previewDisableImpact(pluginId, pluginType as 'workflow' | 'role' | 'skill', pluginName, {
        dependentTaskIds: [],
        enabledPlugins: registry.installedPlugins,
      })
    }
  }

  /**
   * 确认应用级插件启用（pending_confirmation → enabled）
   */
  async confirmAppPluginEnable(pluginId: string): Promise<Result<void>> {
    const registryResult = await this.readAppRegistry()
    if (!registryResult.ok) return registryResult as Result<never>
    const registry = registryResult.data

    const index = registry.installedPlugins.findIndex(
      p => p.pluginId === pluginId && p.status === 'pending_confirmation',
    )
    if (index === -1) {
      return err(createError('VALIDATION_FAILED', 'plugin',
        `Plugin "${pluginId}" is not in pending_confirmation state`))
    }

    const now = new Date().toISOString()
    registry.installedPlugins[index] = {
      ...registry.installedPlugins[index],
      status: 'enabled',
      enabledAt: now,
      updatedAt: now,
    }

    return this.writeAppRegistry(registry)
  }
}
