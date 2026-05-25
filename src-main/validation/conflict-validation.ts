// src-main/validation/conflict-validation.ts
// 冲突校验：检查对象虽然结构正确，但是否与系统现状冲突
// 来源：12-实现落地/系统级校验层约束 - ConflictValidation

import type { DomainWorkflowDefinition } from '../contracts/types'
import type { ValidationIssue } from './types'
import { makeValidationResult, makeIssue } from './types'
import type { ValidationResult } from './types'

function conflictIssue(issueCode: string, field: string, message: string, severity: 'info' | 'warning' | 'error' = 'error', relatedObjectId?: string): ValidationIssue {
  return makeIssue('conflict', issueCode, field, message, severity, relatedObjectId)
}

/**
 * 校验插件配置是否与当前启用对象冲突
 */
export function validatePluginConfig(
  pluginId: string,
  pluginType: string,
  enabledPlugins: Array<{ id: string; type: string; domain?: string }>,
): ValidationResult {
  const issues: ValidationIssue[] = []

  for (const enabled of enabledPlugins) {
    if (enabled.id === pluginId) {
      issues.push(conflictIssue('duplicate_id', 'pluginId',
        `Plugin "${pluginId}" is already enabled`, 'warning', pluginId))
    }
  }

  return makeValidationResult(issues)
}

/**
 * 校验 workflow 是否与 builtin workflow 默认域冲突
 */
export function validateWorkflowConflict(
  workflow: DomainWorkflowDefinition,
  existingWorkflows: DomainWorkflowDefinition[],
): ValidationResult {
  const issues: ValidationIssue[] = []

  for (const existing of existingWorkflows) {
    // 同一 taskDomain 下不应有多个同 id 的 workflow
    if (existing.id === workflow.id && existing.taskDomain === workflow.taskDomain) {
      issues.push(conflictIssue('duplicate_id', 'id',
        `Workflow with id "${workflow.id}" already exists in domain "${workflow.taskDomain}"`, 'error', workflow.id))
    }

    // custom workflow 不应覆盖 builtin workflow 的默认域
    if (existing.status === 'builtin' && workflow.status === 'custom' && existing.taskDomain === workflow.taskDomain) {
      issues.push(conflictIssue('artifact_scope_conflict', 'taskDomain',
        `Custom workflow "${workflow.id}" conflicts with builtin workflow in domain "${workflow.taskDomain}"`, 'warning', workflow.id))
    }
  }

  return makeValidationResult(issues)
}

/**
 * 校验角色是否冲突
 */
export function validateRoleConflict(
  roleName: string,
  existingRoles: string[],
): ValidationResult {
  const issues: ValidationIssue[] = []
  if (existingRoles.includes(roleName)) {
    issues.push(conflictIssue('duplicate_id', 'role',
      `Role "${roleName}" already exists`, 'warning', roleName))
  }
  return makeValidationResult(issues)
}

/**
 * 校验产物类型是否冲突
 */
export function validateArtifactTypeConflict(
  artifactType: string,
  registeredTypes: string[],
  aliasMap?: Map<string, string>,
): ValidationResult {
  const issues: ValidationIssue[] = []
  if (registeredTypes.includes(artifactType)) {
    // 类型已注册，info 级别
    issues.push(conflictIssue('duplicate_id', 'artifactType',
      `Artifact type "${artifactType}" is already registered`, 'info', artifactType))
  }
  if (aliasMap && aliasMap.has(artifactType)) {
    issues.push(conflictIssue('artifact_scope_conflict', 'artifactType',
      `Artifact type "${artifactType}" has an alias conflict: also registered as "${aliasMap.get(artifactType)}"`, 'warning', artifactType))
  }
  return makeValidationResult(issues)
}
