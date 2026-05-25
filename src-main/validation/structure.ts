// src-main/validation/structure.ts
// 结构校验：检查核心对象的必填字段、类型、枚举值、ID格式
// 来源：12-实现落地/系统级校验层约束 - StructureValidation

import type {
  WorkspaceManifest,
  ConversationRuntime,
  TaskRuntime,
  ArtifactIndexEntry,
  DomainWorkflowDefinition,
  BackflowRecord,
  ChangeRequest,
} from '../contracts/types'
import {
  WORKSPACE_STATUSES,
  CONVERSATION_STATUSES,
  TASK_STATUSES,
  ARTIFACT_STATUSES,
} from '../contracts/status'
import type { ValidationIssue, ValidationSeverity } from './types'
import { makeValidationResult, makeIssue } from './types'
import type { ValidationResult } from './types'

function structIssue(
  issueCode: string,
  field: string,
  message: string,
  severity: ValidationSeverity = 'error',
): ValidationIssue {
  return makeIssue('structure', issueCode, field, message, severity)
}

function requireString(obj: Record<string, unknown>, field: string, issues: ValidationIssue[]): void {
  const val = obj[field]
  if (val === undefined || val === null || val === '') {
    issues.push(structIssue('missing_required_field', field, `${field} is required`))
  } else if (typeof val !== 'string') {
    issues.push(structIssue('invalid_field_type', field, `${field} must be a string, got ${typeof val}`))
  }
}

function requireEnum(
  value: unknown,
  field: string,
  allowed: readonly string[],
  issues: ValidationIssue[],
): void {
  if (value === undefined || value === null || value === '') {
    issues.push(structIssue('missing_required_field', field, `${field} is required`))
  } else if (typeof value !== 'string') {
    issues.push(structIssue('invalid_field_type', field, `${field} must be a string`))
  } else if (!allowed.includes(value)) {
    issues.push(structIssue('invalid_enum_value', field, `${field} "${value}" is not in allowed values: ${allowed.join(', ')}`))
  }
}

// ─── WorkspaceManifest ───

export function validateWorkspaceManifest(obj: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  if (obj === null || typeof obj !== 'object') {
    return makeValidationResult([structIssue('invalid_object_type', 'root', 'WorkspaceManifest must be an object', 'critical')])
  }
  const m = obj as Record<string, unknown>
  requireString(m, 'id', issues)
  requireString(m, 'name', issues)
  requireString(m, 'rootPath', issues)
  requireEnum(m.status, 'status', WORKSPACE_STATUSES, issues)
  requireString(m, 'createdAt', issues)
  if (!m.components || typeof m.components !== 'object') {
    issues.push(structIssue('missing_required_field', 'components', 'components is required and must be an object'))
  }
  return makeValidationResult(issues)
}

// ─── ConversationRuntime ───

export function validateConversationRuntime(obj: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  if (obj === null || typeof obj !== 'object') {
    return makeValidationResult([structIssue('invalid_object_type', 'root', 'ConversationRuntime must be an object', 'critical')])
  }
  const c = obj as Record<string, unknown>
  requireString(c, 'id', issues)
  requireString(c, 'workspaceId', issues)
  requireEnum(c.status, 'status', CONVERSATION_STATUSES, issues)
  requireString(c, 'createdAt', issues)
  return makeValidationResult(issues)
}

// ─── TaskRuntime ───

export function validateTaskRuntime(obj: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  if (obj === null || typeof obj !== 'object') {
    return makeValidationResult([structIssue('invalid_object_type', 'root', 'TaskRuntime must be an object', 'critical')])
  }
  const t = obj as Record<string, unknown>
  requireString(t, 'id', issues)
  requireString(t, 'workspaceId', issues)
  requireString(t, 'conversationId', issues)
  requireEnum(t.status, 'status', TASK_STATUSES, issues)
  requireString(t, 'currentNodeName', issues)
  if (t.artifactIds !== undefined && !Array.isArray(t.artifactIds)) {
    issues.push(structIssue('invalid_field_type', 'artifactIds', 'artifactIds must be an array'))
  }
  return makeValidationResult(issues)
}

// ─── ArtifactIndexEntry ───

export function validateArtifactIndexEntry(obj: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  if (obj === null || typeof obj !== 'object') {
    return makeValidationResult([structIssue('invalid_object_type', 'root', 'ArtifactIndexEntry must be an object', 'critical')])
  }
  const a = obj as Record<string, unknown>
  requireString(a, 'id', issues)
  requireString(a, 'title', issues)
  requireString(a, 'type', issues)
  requireEnum(a.status, 'status', ARTIFACT_STATUSES, issues)
  requireString(a, 'path', issues)
  return makeValidationResult(issues)
}

// ─── DomainWorkflowDefinition ───

export function validateDomainWorkflowDefinition(obj: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  if (obj === null || typeof obj !== 'object') {
    return makeValidationResult([structIssue('invalid_object_type', 'root', 'DomainWorkflowDefinition must be an object', 'critical')])
  }
  const d = obj as Record<string, unknown>
  requireString(d, 'id', issues)
  requireString(d, 'name', issues)
  requireString(d, 'taskDomain', issues)
  if (!d.nodes || !Array.isArray(d.nodes) || (d.nodes as unknown[]).length === 0) {
    issues.push(structIssue('missing_required_field', 'nodes', 'nodes is required and must be a non-empty array'))
  }
  if (d.roleBindings !== undefined && !Array.isArray(d.roleBindings)) {
    issues.push(structIssue('invalid_field_type', 'roleBindings', 'roleBindings must be an array'))
  }
  if (d.skillBindings !== undefined && !Array.isArray(d.skillBindings)) {
    issues.push(structIssue('invalid_field_type', 'skillBindings', 'skillBindings must be an array'))
  }
  return makeValidationResult(issues)
}

// ─── BackflowRecord ───

export function validateBackflowRecord(obj: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  if (obj === null || typeof obj !== 'object') {
    return makeValidationResult([structIssue('invalid_object_type', 'root', 'BackflowRecord must be an object', 'critical')])
  }
  const b = obj as Record<string, unknown>
  requireString(b, 'id', issues)
  requireString(b, 'taskId', issues)
  requireString(b, 'fromNode', issues)
  requireString(b, 'toNode', issues)
  requireString(b, 'reason', issues)
  return makeValidationResult(issues)
}

// ─── ChangeRequest ───

export function validateChangeRequest(obj: unknown): ValidationResult {
  const issues: ValidationIssue[] = []
  if (obj === null || typeof obj !== 'object') {
    return makeValidationResult([structIssue('invalid_object_type', 'root', 'ChangeRequest must be an object', 'critical')])
  }
  const c = obj as Record<string, unknown>
  requireString(c, 'id', issues)
  requireString(c, 'taskId', issues)
  requireString(c, 'requestedBy', issues)
  requireString(c, 'field', issues)
  requireEnum(c.status, 'status', ['pending', 'approved', 'rejected'], issues)
  return makeValidationResult(issues)
}
