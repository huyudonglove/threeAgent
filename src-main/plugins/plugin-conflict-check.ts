// src-main/plugins/plugin-conflict-check.ts
// 插件冲突检查
// 来源：10-领域工作流/插件正式Schema与校验规则、12-实现落地/系统级校验层约束 - ConflictValidation

import type { DomainWorkflowDefinition, PluginEnablementRecord } from '../contracts/types'
import { validatePluginConfig, validateWorkflowConflict, validateRoleConflict } from '../validation/conflict-validation'
import { validatePluginSafety, validateDisableImpact } from '../validation/safety-validation'
import type { ValidationResult } from '../validation/types'
import { makeValidationResult, makeIssue } from '../validation/types'

/**
 * 插件影响项
 */
export interface PluginImpactItem {
  objectType: 'workflow' | 'role' | 'skill' | 'artifact_type'
  objectId: string
  impactType: 'added' | 'overridden' | 'conflicted' | 'removed'
  description: string
  severity: 'info' | 'warning' | 'error'
}

/**
 * 冲突检查结果
 */
export interface ConflictCheckResult {
  canProceed: boolean
  requiresConfirmation: boolean
  impacts: PluginImpactItem[]
  validation: ValidationResult
}

/**
 * 检查启用一个 workflow 插件的冲突
 */
export function checkWorkflowPluginConflict(
  workflow: DomainWorkflowDefinition,
  existingWorkflows: DomainWorkflowDefinition[],
  enabledPlugins: PluginEnablementRecord[],
): ConflictCheckResult {
  const impacts: PluginImpactItem[] = []

  // 1. 检查 ID 重复
  const configValidation = validatePluginConfig(
    workflow.id, 'workflow',
    enabledPlugins.map(p => ({ id: p.pluginId, type: p.pluginType, domain: p.domain })),
  )

  // 2. 检查 workflow 域冲突
  const workflowValidation = validateWorkflowConflict(workflow, existingWorkflows)

  // 合并校验结果
  const allIssues = [...configValidation.issues, ...workflowValidation.issues]
  const validation = makeValidationResult(allIssues)

  // 构建影响列表
  for (const existing of existingWorkflows) {
    if (existing.id === workflow.id) {
      impacts.push({
        objectType: 'workflow',
        objectId: workflow.id,
        impactType: 'overridden',
        description: `Will override existing workflow "${workflow.name}"`,
        severity: 'warning',
      })
    }

    if (existing.status === 'builtin' && existing.taskDomain === workflow.taskDomain) {
      impacts.push({
        objectType: 'workflow',
        objectId: workflow.id,
        impactType: 'conflicted',
        description: `Custom workflow conflicts with builtin in domain "${workflow.taskDomain}"`,
        severity: 'warning',
      })
    }
  }

  // 检查是否已有同一 taskDomain 的 enabled workflow
  const domainPlugins = enabledPlugins.filter(
    p => p.pluginType === 'workflow' && p.domain === workflow.taskDomain && p.status === 'enabled',
  )
  for (const dp of domainPlugins) {
    impacts.push({
      objectType: 'workflow',
      objectId: dp.pluginId,
      impactType: 'conflicted',
      description: `Domain "${workflow.taskDomain}" already has enabled plugin "${dp.pluginName}"`,
      severity: 'warning',
    })
  }

  const hasBlocking = impacts.some(i => i.severity === 'error')
  const requiresConfirmation = impacts.some(i => i.severity === 'warning')

  return {
    canProceed: !hasBlocking && validation.ok,
    requiresConfirmation,
    impacts,
    validation,
  }
}

/**
 * 检查启用一个角色插件的冲突
 */
export function checkRolePluginConflict(
  roleName: string,
  existingRoles: string[],
  enabledPlugins: PluginEnablementRecord[],
): ConflictCheckResult {
  const roleValidation = validateRoleConflict(roleName, existingRoles)
  const impacts: PluginImpactItem[] = []

  if (existingRoles.includes(roleName)) {
    impacts.push({
      objectType: 'role',
      objectId: roleName,
      impactType: 'overridden',
      description: `Role "${roleName}" already exists, will be overridden`,
      severity: 'warning',
    })
  }

  const configValidation = validatePluginConfig(
    roleName, 'role',
    enabledPlugins.map(p => ({ id: p.pluginId, type: p.pluginType })),
  )

  const allIssues = [...roleValidation.issues, ...configValidation.issues]
  const validation = makeValidationResult(allIssues)
  const hasBlocking = impacts.some(i => i.severity === 'error')

  return {
    canProceed: !hasBlocking && validation.ok,
    requiresConfirmation: impacts.some(i => i.severity === 'warning'),
    impacts,
    validation,
  }
}

/**
 * 检查禁用一个插件的冲突（运行中任务依赖）
 */
export function checkDisableConflict(
  pluginId: string,
  pluginType: string,
  dependentTaskIds: string[],
  enabledPlugins: PluginEnablementRecord[],
): ConflictCheckResult {
  const impacts: PluginImpactItem[] = []
  const issues = []

  // 1. 运行中依赖检查
  const disableValidation = validateDisableImpact(pluginId, dependentTaskIds)
  issues.push(...disableValidation.issues)

  if (dependentTaskIds.length > 0) {
    impacts.push({
      objectType: pluginType as any,
      objectId: pluginId,
      impactType: 'removed',
      description: `Cannot disable: ${dependentTaskIds.length} running task(s) depend on this plugin`,
      severity: 'error',
    })
  }

  // 2. 检查是否有其他插件依赖此插件
  const dependents = enabledPlugins.filter(
    p => p.status === 'enabled' && p.affectedObjectIds.includes(pluginId),
  )
  for (const dep of dependents) {
    impacts.push({
      objectType: dep.pluginType as any,
      objectId: dep.pluginId,
      impactType: 'conflicted',
      description: `Plugin "${dep.pluginName}" depends on "${pluginId}"`,
      severity: 'warning',
    })
  }

  const validation = makeValidationResult(issues)
  const hasBlocking = impacts.some(i => i.severity === 'error')

  return {
    canProceed: !hasBlocking && validation.ok,
    requiresConfirmation: impacts.some(i => i.severity === 'warning'),
    impacts,
    validation,
  }
}
