// src-main/validation/types.ts
// 校验层的公共类型定义
// 来源：12-实现落地/系统级校验层约束

/**
 * 校验问题统一结构
 */
export interface ValidationIssue {
  issueCode: string
  field: string
  message: string
  severity: ValidationSeverity
  source: ValidationSource
  relatedObjectId?: string
}

export type ValidationSeverity = 'info' | 'warning' | 'error' | 'critical'

export type ValidationSource =
  | 'structure'
  | 'state'
  | 'reference'
  | 'conflict'
  | 'safety'
  | 'recovery'

/**
 * 校验结果统一结构
 *
 * result 字段表达总体判断：
 * - passed: 无任何问题
 * - passed_with_notes: 只有 info/warning
 * - failed: 存在 error/critical
 */
export interface ValidationResult {
  ok: boolean
  result: ValidationResultType
  issues: ValidationIssue[]
}

export type ValidationResultType = 'passed' | 'passed_with_notes' | 'failed'

/**
 * 从 issues 列表推断 ValidationResultType
 */
export function deriveResultType(issues: ValidationIssue[]): ValidationResultType {
  if (issues.length === 0) return 'passed'
  const hasBlocking = issues.some(i => i.severity === 'error' || i.severity === 'critical')
  return hasBlocking ? 'failed' : 'passed_with_notes'
}

/**
 * 构造校验结果的便捷函数
 */
export function makeValidationResult(issues: ValidationIssue[]): ValidationResult {
  const resultType = deriveResultType(issues)
  return {
    ok: resultType !== 'failed',
    result: resultType,
    issues,
  }
}

/**
 * 创建 ValidationIssue 的便捷函数
 */
export function makeIssue(
  source: ValidationSource,
  issueCode: string,
  field: string,
  message: string,
  severity: ValidationSeverity = 'error',
  relatedObjectId?: string,
): ValidationIssue {
  return { issueCode, field, message, severity, source, relatedObjectId }
}
