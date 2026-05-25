// src-main/workflows/workflow-definition-validator.ts
// 领域流程定义校验器
// 来源：12-实现落地/插件正式Schema与校验规则

import type { DomainWorkflowDefinition } from '../contracts/types'
import { validateDomainWorkflowDefinition as validateStructure } from '../validation/structure'
import { validateWorkflowDefinition } from '../validation/reference'
import { validateWorkflowConflict } from '../validation/conflict-validation'
import type { ValidationResult } from '../validation/types'
import { makeValidationResult } from '../validation/types'

/**
 * 校验领域流程定义：结构 + 引用 + 冲突
 */
export function validateDomainWorkflowDefinition(
  definition: DomainWorkflowDefinition,
  existingWorkflows: DomainWorkflowDefinition[] = [],
): ValidationResult {
  // 1. 结构校验
  const structureResult = validateStructure(definition)
  if (!structureResult.ok) return structureResult

  // 2. 引用完整性校验
  const referenceResult = validateWorkflowDefinition(definition)
  if (!referenceResult.ok) {
    // 合并 issues
    const allIssues = [...structureResult.issues, ...referenceResult.issues]
    return makeValidationResult(allIssues)
  }

  // 3. 冲突校验
  const conflictResult = validateWorkflowConflict(definition, existingWorkflows)

  // 合并所有 issues
  const allIssues = [
    ...structureResult.issues,
    ...referenceResult.issues,
    ...conflictResult.issues,
  ]
  return makeValidationResult(allIssues)
}
