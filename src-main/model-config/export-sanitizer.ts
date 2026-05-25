// src-main/model-config/export-sanitizer.ts
// 导出脱敏：确保导出的工作区不含明文密钥

import fs from 'node:fs/promises'
import path from 'node:path'
import { PathResolver } from '../storage/path-resolver'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

export class ExportSanitizer {
  /**
   * 导出工作区时，复制除 secrets.json 之外的所有文件
   * 同时扫描 JSON 文件，移除可能包含明文密钥的字段
   */
  async exportSanitized(workspaceRootPath: string, exportDir: string): Promise<Result<void>> {
    const resolver = new PathResolver(workspaceRootPath)

    try {
      // 复制整个 .agent-workspace 目录
      await copyDirRecursive(resolver.workspaceDir, exportDir, [resolver.secretsPath])

      // 扫描导出目录中所有 JSON 文件，移除明文密钥字段
      await this.sanitizeJsonFiles(exportDir)

      return ok(undefined)
    } catch (e) {
      return err(createError('STORAGE_WRITE_FAILED', 'export', `Export failed: ${e}`, {
        recoverable: false,
      }))
    }
  }

  /**
   * 检查工作区内是否存在 secrets.json
   */
  async hasSecrets(workspaceRootPath: string): Promise<boolean> {
    const resolver = new PathResolver(workspaceRootPath)
    try {
      await fs.access(resolver.secretsPath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 扫描 JSON 文件，移除常见的密钥字段
   */
  private async sanitizeJsonFiles(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await this.sanitizeJsonFiles(fullPath)
      } else if (entry.name.endsWith('.json')) {
        try {
          const raw = await fs.readFile(fullPath, 'utf-8')
          const obj = JSON.parse(raw)
          let modified = false

          // 移除常见密钥字段
          const secretFieldPatterns = ['apiKey', 'secretKey', 'password', 'token', 'accessToken']
          for (const field of secretFieldPatterns) {
            if (field in obj && typeof obj[field] === 'string') {
              obj[field] = '[REDACTED]'
              modified = true
            }
          }

          if (modified) {
            await fs.writeFile(fullPath, JSON.stringify(obj, null, 2) + '\n', 'utf-8')
          }
        } catch {
          // 跳过无法解析的文件
        }
      }
    }
  }
}

/**
 * 递归复制目录，排除指定路径
 */
async function copyDirRecursive(src: string, dest: string, excludePaths: string[]): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (excludePaths.includes(srcPath)) continue

    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath, excludePaths)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}
