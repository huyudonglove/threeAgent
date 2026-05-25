// src-main/errors/unified-error.ts
// 统一错误类型

import type { ErrorCode } from './error-codes'

export interface UnifiedError {
  code: ErrorCode
  module: string
  message: string
  recoverable: boolean
  suggestedAction?: string
  detail?: unknown
}

export function createError(
  code: ErrorCode,
  module: string,
  message: string,
  options?: {
    recoverable?: boolean
    suggestedAction?: string
    detail?: unknown
  },
): UnifiedError {
  return {
    code,
    module,
    message,
    recoverable: options?.recoverable ?? false,
    suggestedAction: options?.suggestedAction,
    detail: options?.detail,
  }
}
