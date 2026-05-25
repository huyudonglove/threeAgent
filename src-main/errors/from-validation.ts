// src-main/errors/from-validation.ts
// 将校验结果转换为 UnifiedError

import type { ValidationIssue, ValidationResult } from '../validation/types'
import { createError } from './unified-error'
import type { UnifiedError } from './unified-error'

export function fromValidation(
  result: ValidationResult,
  module: string,
): UnifiedError {
  return createError(
    result.issues[0]?.source === 'state'
      ? 'VALIDATION_STATE_FAILED'
      : result.issues[0]?.source === 'reference'
        ? 'VALIDATION_REFERENCE_FAILED'
        : 'VALIDATION_STRUCTURE_FAILED',
    module,
    result.issues.map((i: ValidationIssue) => `${i.field}: ${i.message}`).join('; '),
    {
      recoverable: false,
      detail: result.issues,
    },
  )
}
