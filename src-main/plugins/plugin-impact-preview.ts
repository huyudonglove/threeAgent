// src-main/plugins/plugin-impact-preview.ts
// 插件影响预览
// 来源：10-领域工作流/PluginLoadingAndConfig插件加载与配置、01-设计原则/SafetyAndPermissionPolicy安全与权限策略

import type { DomainWorkflowDefinition, PluginEnablementRecord } from '../contracts/types'
import type { PluginImpactItem } from './plugin-conflict-check'
import { checkWorkflowPluginConflict, checkRolePluginConflict, checkDisableConflict } from './plugin-conflict-check'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

/**
 * 插件影响预览结果
 */
export interface PluginImpactPreview {
  pluginId: string
  pluginType: 'workflow' | 'role' | 'skill'
  pluginName: string
  action: 'enable' | 'disable'
  canProceed: boolean
  requiresConfirmation: boolean
  impacts: PluginImpactItem[]
  summary: string
}

/**
 * 预览启用插件的影响
 * 来源：模块接口I/O契约 - PluginConfigManager.previewPluginImpact
 *
 * 在实际执行启停前，让用户看到影响范围
 */
export function previewEnableImpact(
  pluginId: string,
  pluginType: 'workflow' | 'role' | 'skill',
  pluginName: string,
  input: {
    workflow?: DomainWorkflowDefinition
    existingWorkflows?: DomainWorkflowDefinition[]
    existingRoles?: string[]
    enabledPlugins: PluginEnablementRecord[]
    hasHighRiskTools?: boolean
    affectsRunningTasks?: boolean
  },
): Result<PluginImpactPreview> {
  if (pluginType === 'workflow' && input.workflow) {
    const check = checkWorkflowPluginConflict(
      input.workflow,
      input.existingWorkflows ?? [],
      input.enabledPlugins,
    )

    return ok({
      pluginId,
      pluginType,
      pluginName,
      action: 'enable',
      canProceed: check.canProceed,
      requiresConfirmation: check.requiresConfirmation,
      impacts: check.impacts,
      summary: buildSummary('enable', pluginName, check.impacts),
    })
  }

  if (pluginType === 'role') {
    const check = checkRolePluginConflict(
      pluginName,
      input.existingRoles ?? [],
      input.enabledPlugins,
    )

    return ok({
      pluginId,
      pluginType,
      pluginName,
      action: 'enable',
      canProceed: check.canProceed,
      requiresConfirmation: check.requiresConfirmation,
      impacts: check.impacts,
      summary: buildSummary('enable', pluginName, check.impacts),
    })
  }

  // skill 类型：暂返回最小预览
  return ok({
    pluginId,
    pluginType,
    pluginName,
    action: 'enable',
    canProceed: true,
    requiresConfirmation: false,
    impacts: [],
    summary: `Enable skill plugin "${pluginName}": no conflicts detected`,
  })
}

/**
 * 预览禁用插件的影响
 */
export function previewDisableImpact(
  pluginId: string,
  pluginType: 'workflow' | 'role' | 'skill',
  pluginName: string,
  input: {
    dependentTaskIds: string[]
    enabledPlugins: PluginEnablementRecord[]
  },
): Result<PluginImpactPreview> {
  const check = checkDisableConflict(
    pluginId,
    pluginType,
    input.dependentTaskIds,
    input.enabledPlugins,
  )

  return ok({
    pluginId,
    pluginType,
    pluginName,
    action: 'disable',
    canProceed: check.canProceed,
    requiresConfirmation: check.requiresConfirmation,
    impacts: check.impacts,
    summary: buildSummary('disable', pluginName, check.impacts),
  })
}

// ─── 辅助 ───

function buildSummary(
  action: 'enable' | 'disable',
  pluginName: string,
  impacts: PluginImpactItem[],
): string {
  if (impacts.length === 0) {
    return `${action === 'enable' ? 'Enable' : 'Disable'} plugin "${pluginName}": no impacts detected`
  }

  const errorCount = impacts.filter(i => i.severity === 'error').length
  const warningCount = impacts.filter(i => i.severity === 'warning').length

  const parts: string[] = []
  if (errorCount > 0) parts.push(`${errorCount} blocking issue(s)`)
  if (warningCount > 0) parts.push(`${warningCount} warning(s)`)

  return `${action === 'enable' ? 'Enable' : 'Disable'} plugin "${pluginName}": ${parts.join(', ')}`
}
