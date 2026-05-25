// src-main/errors/result.ts
// 统一返回结构 Result<T>

import type { UnifiedError } from './unified-error'

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: UnifiedError }

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function err<T>(error: UnifiedError): Result<T> {
  return { ok: false, error }
}
