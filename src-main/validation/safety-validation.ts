// src-main/validation/safety-validation.ts
// 安全校验：检查动作是否越过权限、安全或确认边界
// 来源：12-实现落地/系统级校验层约束 - SafetyValidation

import type { ValidationIssue } from './types'
import { makeValidationResult, makeIssue } from './types'
import type { ValidationResult } from './types'

function safetyIssue(issueCode: string, field: string, message: string, severity: 'error' | 'critical' = 'error', relatedObjectId?: string): ValidationIssue {
  return makeIssue('safety', issueCode, field, message, severity, relatedObjectId)
}

/**
 * 校验操作是否需要用户确认
 * 来源：01-设计原则/ConfirmationPolicy用户确认策略
 */
export function validatePermissionForOperation(
  operationType: 'write' | 'delete' | 'execute' | 'override_builtin',
  targetObjectType: string,
  targetObjectId: string,
  isHighRisk: boolean,
): ValidationResult {
  const issues: ValidationIssue[] = []

  if (operationType === 'override_builtin') {
    issues.push(safetyIssue('unsafe_operation_detected', 'operation',
      `Attempt to override builtin ${targetObjectType} "${targetObjectId}"`, 'critical', targetObjectId))
  }

  if (operationType === 'delete' && isHighRisk) {
    issues.push(safetyIssue('unsafe_operation_detected', 'operation',
      `High-risk delete operation on ${targetObjectType} "${targetObjectId}" requires user confirmation`, 'error', targetObjectId))
  }

  if (operationType === 'execute' && isHighRisk) {
    issues.push(safetyIssue('unsafe_operation_detected', 'operation',
      `High-risk execute operation on ${targetObjectType} "${targetObjectId}" requires user confirmation`, 'error', targetObjectId))
  }

  return makeValidationResult(issues)
}

/**
 * 校验插件启用是否安全
 */
export function validatePluginSafety(
  pluginId: string,
  pluginType: string,
  hasHighRiskTools: boolean,
  affectsRunningTasks: boolean,
): ValidationResult {
  const issues: ValidationIssue[] = []

  if (hasHighRiskTools) {
    issues.push(safetyIssue('unsafe_operation_detected', 'tools',
      `Plugin "${pluginId}" introduces high-risk tools, user confirmation required`, 'error', pluginId))
  }

  if (affectsRunningTasks) {
    issues.push(safetyIssue('plugin_runtime_dependency_active', 'runtime',
      `Plugin "${pluginId}" affects running tasks, cannot enable without resolution`, 'error', pluginId))
  }

  return makeValidationResult(issues)
}

/**
 * 校验高风险动作
 */
export function validateHighRiskAction(
  actionType: string,
  description: string,
  confirmedByUser: boolean,
): ValidationResult {
  const issues: ValidationIssue[] = []

  if (!confirmedByUser) {
    issues.push(safetyIssue('unsafe_operation_detected', 'action',
      `High-risk action "${actionType}" requires user confirmation: ${description}`, 'error'))
  }

  return makeValidationResult(issues)
}

/**
 * 校验禁用操作的影响范围
 */
export function validateDisableImpact(
  pluginId: string,
  dependentTaskIds: string[],
): ValidationResult {
  const issues: ValidationIssue[] = []

  if (dependentTaskIds.length > 0) {
    issues.push(safetyIssue('plugin_runtime_dependency_active', 'runtime',
      `Cannot disable plugin "${pluginId}": tasks [${dependentTaskIds.join(', ')}] depend on it`, 'critical', pluginId))
  }

  return makeValidationResult(issues)
}
