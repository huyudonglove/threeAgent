// src-main/model-config/secret-store.ts
// 密钥独立存储（仅主进程访问）

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

export class SecretStore {
  private resolver: PathResolver

  constructor(workspaceRootPath: string) {
    this.resolver = new PathResolver(workspaceRootPath)
  }

  /**
   * 读取密钥（仅主进程调用）
   */
  async get(key: string): Promise<Result<string>> {
    const result = await JsonStore.read<Record<string, string>>(this.resolver.secretsPath)
    if (!result.ok) {
      return err(createError('SECRET_NOT_FOUND', 'secret-store', `Secret "${key}" not found`, {
        recoverable: true,
        suggestedAction: 'Configure the API key first.',
        detail: result.error,
      }))
    }
    const value = result.data[key]
    if (value === undefined) {
      return err(createError('SECRET_NOT_FOUND', 'secret-store', `Secret key "${key}" does not exist`, {
        recoverable: true,
        suggestedAction: 'Add the API key in model configuration.',
      }))
    }
    return ok(value)
  }

  /**
   * 写入密钥
   */
  async set(key: string, value: string): Promise<Result<void>> {
    // 读取现有 secrets 或创建空的
    const existing = await JsonStore.read<Record<string, string>>(this.resolver.secretsPath)
    const secrets = existing.ok ? existing.data : {}
    secrets[key] = value
    return JsonStore.write(this.resolver.secretsPath, secrets)
  }

  /**
   * 删除密钥
   */
  async delete(key: string): Promise<Result<void>> {
    const existing = await JsonStore.read<Record<string, string>>(this.resolver.secretsPath)
    if (!existing.ok) {
      return err(createError('SECRET_DELETE_FAILED', 'secret-store', 'Cannot read secrets file', {
        detail: existing.error,
      }))
    }
    const secrets = { ...existing.data }
    if (!(key in secrets)) {
      return ok(undefined) // 不存在视为删除成功
    }
    delete secrets[key]
    return JsonStore.write(this.resolver.secretsPath, secrets)
  }

  /**
   * 检查密钥是否存在
   */
  async has(key: string): Promise<boolean> {
    const result = await this.get(key)
    return result.ok
  }

  /**
   * 列出所有密钥的 key（不含值）
   */
  async listKeys(): Promise<Result<string[]>> {
    const result = await JsonStore.read<Record<string, string>>(this.resolver.secretsPath)
    if (!result.ok) return ok([]) // 无文件视为空
    return ok(Object.keys(result.data))
  }
}
