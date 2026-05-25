// src-main/errors/from-storage.ts
// 将存储层错误转换为 UnifiedError

import { createError } from './unified-error'
import type { UnifiedError } from './unified-error'

export function fromStorageError(
  error: unknown,
  module: string,
): UnifiedError {
  if (error instanceof Error) {
    // 区分常见 Node.js 文件系统错误
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return createError('STORAGE_READ_FAILED', module, `File not found: ${error.message}`, {
        recoverable: true,
        suggestedAction: 'Check if the workspace has been initialized.',
      })
    }
    if (code === 'EACCES') {
      return createError('STORAGE_READ_FAILED', module, `Permission denied: ${error.message}`, {
        recoverable: false,
        suggestedAction: 'Check file system permissions.',
      })
    }
    if (code === 'EEXIST') {
      return createError('WS_ALREADY_EXISTS', module, `Already exists: ${error.message}`, {
        recoverable: true,
        suggestedAction: 'Use a different workspace path or read the existing one.',
      })
    }
    if (error.message.includes('JSON')) {
      return createError('STORAGE_CORRUPTED', module, `Corrupted JSON: ${error.message}`, {
        recoverable: true,
        suggestedAction: 'Try recovering from backup or re-initializing.',
      })
    }
    return createError('STORAGE_WRITE_FAILED', module, error.message, {
      recoverable: false,
      detail: error,
    })
  }
  return createError('UNKNOWN', module, String(error), { detail: error })
}
