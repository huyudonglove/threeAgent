// src-main/validation/reference.ts
// 引用完整性校验
// 来源：12-实现落地/系统级校验层约束 - ReferenceValidation

import type { DomainWorkflowDefinition } from '../contracts/types'
import type { ValidationIssue } from './types'
import { makeValidationResult, makeIssue } from './types'
import type { ValidationResult } from './types'

function refIssue(issueCode: string, field: string, message: string, relatedObjectId?: string): ValidationIssue {
  return makeIssue('reference', issueCode, field, message, 'error', relatedObjectId)
}

/**
 * 校验 workspaceId 引用是否存在于已知工作区集合中
 */
export function validateWorkspaceReference(
  workspaceId: string,
  knownWorkspaceIds: string[],
): ValidationResult {
  const issues: ValidationIssue[] = []
  if (!knownWorkspaceIds.includes(workspaceId)) {
    issues.push(refIssue('reference_not_found', 'workspaceId', `Workspace "${workspaceId}" does not exist`, workspaceId))
  }
  return makeValidationResult(issues)
}

/**
 * 校验 conversationId 引用是否存在于已知会话集合中
 */
export function validateConversationReference(
  conversationId: string,
  knownConversationIds: string[],
): ValidationResult {
  const issues: ValidationIssue[] = []
  if (!knownConversationIds.includes(conversationId)) {
    issues.push(refIssue('reference_not_found', 'conversationId', `Conversation "${conversationId}" does not exist`, conversationId))
  }
  return makeValidationResult(issues)
}

/**
 * 校验 taskId 引用是否存在于已知任务集合中
 */
export function validateTaskReference(
  taskId: string,
  knownTaskIds: string[],
): ValidationResult {
  const issues: ValidationIssue[] = []
  if (!knownTaskIds.includes(taskId)) {
    issues.push(refIssue('reference_not_found', 'taskId', `Task "${taskId}" does not exist`, taskId))
  }
  return makeValidationResult(issues)
}

/**
 * 批量校验多个 artifactId 引用
 */
export function validateArtifactReferences(
  artifactIds: string[],
  knownArtifactIds: string[],
): ValidationResult {
  const issues: ValidationIssue[] = []
  for (const id of artifactIds) {
    if (!knownArtifactIds.includes(id)) {
      issues.push(refIssue('reference_not_found', 'artifactIds', `Artifact "${id}" does not exist`, id))
    }
  }
  return makeValidationResult(issues)
}

/**
 * 校验 DomainWorkflowDefinition 中所有节点引用和角色绑定是否闭合
 */
export function validateWorkflowDefinition(
  definition: DomainWorkflowDefinition,
): ValidationResult {
  const issues: ValidationIssue[] = []
  const nodeIds = new Set(definition.nodes.map(n => n.id))

  // 校验节点 ID 唯一性
  const seenNodeIds = new Set<string>()
  for (const node of definition.nodes) {
    if (seenNodeIds.has(node.id)) {
      issues.push(refIssue('duplicate_id', 'nodes', `Duplicate node id: "${node.id}"`, definition.id))
    }
    seenNodeIds.add(node.id)
  }

  // 校验 roleBindings 中的 nodeName 是否在 nodes 中定义
  for (const binding of definition.roleBindings ?? []) {
    if (!nodeIds.has(binding.nodeName)) {
      issues.push(refIssue('workflow_reference_broken', 'roleBindings',
        `roleBinding references nodeName "${binding.nodeName}" which is not defined in nodes`, definition.id))
    }
  }

  // 校验 skillBindings 中的 nodeName 是否在 nodes 中定义
  for (const binding of definition.skillBindings ?? []) {
    if (!nodeIds.has(binding.nodeName)) {
      issues.push(refIssue('workflow_reference_broken', 'skillBindings',
        `skillBinding references nodeName "${binding.nodeName}" which is not defined in nodes`, definition.id))
    }
  }

  // 校验节点 outputs 中引用的 artifactType 是否可解析（占位，T8 完成后接入产物类型注册表）

  return makeValidationResult(issues)
}

/**
 * 校验指定 artifactId 是否存在且（可选）属于指定 taskId
 */
export function validateArtifactReference(
  artifactId: string,
  knownArtifactIds: string[],
  expectedTaskId?: string | null,
  artifactTaskMap?: Map<string, string>,
): ValidationResult {
  const issues: ValidationIssue[] = []
  if (!knownArtifactIds.includes(artifactId)) {
    issues.push(refIssue('reference_not_found', 'artifactId', `Artifact "${artifactId}" does not exist`, artifactId))
  } else if (expectedTaskId && artifactTaskMap) {
    const actualTaskId = artifactTaskMap.get(artifactId)
    if (actualTaskId && actualTaskId !== expectedTaskId) {
      issues.push(refIssue('artifact_scope_conflict', 'artifactId',
        `Artifact "${artifactId}" belongs to task "${actualTaskId}", expected "${expectedTaskId}"`, artifactId))
    }
  }
  return makeValidationResult(issues)
}
