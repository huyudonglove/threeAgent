// src-main/validation/recovery-validation.ts
// 恢复一致性校验：在恢复和补偿场景下判断系统是否处于可继续状态
// 来源：12-实现落地/系统级校验层约束 - RecoveryValidation

import type { ValidationIssue } from './types'
import { makeValidationResult, makeIssue } from './types'
import type { ValidationResult } from './types'

function recoveryIssue(issueCode: string, field: string, message: string, severity: 'warning' | 'error' = 'error', relatedObjectId?: string): ValidationIssue {
  return makeIssue('recovery', issueCode, field, message, severity, relatedObjectId)
}

/**
 * 校验工作区恢复完整性
 * 来源：持久化一致性与恢复规则 - 恢复顺序规则
 */
export function validateWorkspaceRecovery(
  manifestExists: boolean,
  manifestValid: boolean,
  requiredDirs: string[],
  existingDirs: string[],
  workspaceId?: string,
): ValidationResult {
  const issues: ValidationIssue[] = []

  if (!manifestExists) {
    issues.push(recoveryIssue('workspace_recovery_incomplete', 'manifest',
      'Workspace manifest file not found', 'error', workspaceId))
  } else if (!manifestValid) {
    issues.push(recoveryIssue('workspace_recovery_incomplete', 'manifest',
      'Workspace manifest validation failed', 'error', workspaceId))
  }

  const missingDirs = requiredDirs.filter(d => !existingDirs.includes(d))
  if (missingDirs.length > 0) {
    issues.push(recoveryIssue('workspace_recovery_incomplete', 'directories',
      `Missing directories: ${missingDirs.join(', ')}`, 'warning', workspaceId))
  }

  return makeValidationResult(issues)
}

/**
 * 校验会话恢复完整性
 */
export function validateConversationRecovery(
  conversationExists: boolean,
  conversationValid: boolean,
  activeTaskExists: boolean,
  conversationId?: string,
): ValidationResult {
  const issues: ValidationIssue[] = []

  if (!conversationExists) {
    issues.push(recoveryIssue('workspace_recovery_incomplete', 'conversation',
      `Conversation data not found`, 'error', conversationId))
  } else if (!conversationValid) {
    issues.push(recoveryIssue('workspace_recovery_incomplete', 'conversation',
      `Conversation validation failed`, 'warning', conversationId))
  }

  if (!activeTaskExists) {
    issues.push(recoveryIssue('task_recovery_incomplete', 'activeTask',
      `Active task referenced by conversation not found`, 'warning', conversationId))
  }

  return makeValidationResult(issues)
}

/**
 * 校验任务恢复完整性
 */
export function validateTaskRecovery(
  taskExists: boolean,
  taskValid: boolean,
  currentArtifactIds: string[],
  existingArtifactIds: string[],
  taskId?: string,
): ValidationResult {
  const issues: ValidationIssue[] = []

  if (!taskExists) {
    issues.push(recoveryIssue('task_recovery_incomplete', 'task',
      `Task data not found`, 'error', taskId))
  } else if (!taskValid) {
    issues.push(recoveryIssue('task_recovery_incomplete', 'task',
      `Task validation failed`, 'error', taskId))
  }

  // 检查产物引用是否都存在
  const missingArtifacts = currentArtifactIds.filter(id => !existingArtifactIds.includes(id))
  if (missingArtifacts.length > 0) {
    issues.push(recoveryIssue('task_recovery_incomplete', 'artifactIds',
      `Missing artifacts: ${missingArtifacts.join(', ')}`, 'warning', taskId))
  }

  return makeValidationResult(issues)
}

/**
 * 校验 ArtifactIndex 与正文文件一致性
 */
export function validateArtifactIndexConsistency(
  indexEntryPaths: string[],
  existingFilePaths: string[],
  workspaceId?: string,
): ValidationResult {
  const issues: ValidationIssue[] = []
  const existingSet = new Set(existingFilePaths)

  // 检查索引中有但正文文件缺失的
  for (const indexPath of indexEntryPaths) {
    if (!existingSet.has(indexPath)) {
      issues.push(recoveryIssue('index_runtime_mismatch', 'path',
        `Index entry references file "${indexPath}" but file does not exist`, 'warning'))
    }
  }

  return makeValidationResult(issues)
}

/**
 * 校验运行态与 trace 是否存在关键不一致
 */
export function validateRuntimeTraceConsistency(
  taskStatus: string,
  lastTraceEventStatus: string | undefined,
  taskId?: string,
): ValidationResult {
  const issues: ValidationIssue[] = []

  if (lastTraceEventStatus && taskStatus !== lastTraceEventStatus) {
    // 以运行态为准，trace 不一致只做 warning
    issues.push(recoveryIssue('index_runtime_mismatch', 'trace',
      `Task status "${taskStatus}" does not match last trace event status "${lastTraceEventStatus}". Task status takes precedence.`, 'warning', taskId))
  }

  return makeValidationResult(issues)
}
