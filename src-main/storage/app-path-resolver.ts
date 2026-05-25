// src-main/storage/app-path-resolver.ts
// 应用级路径解析器：将应用级配置从工作区路径中分离出来

import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

export class AppPathResolver {
  private readonly baseDir: string

  constructor(options?: { baseDir?: string }) {
    // 允许测试时注入自定义路径，否则使用 electron userData
    this.baseDir = options?.baseDir ?? path.join(app.getPath('userData'), 'agent-config')
  }

  /** 应用级配置根目录 */
  get appConfigDir(): string {
    return this.baseDir
  }

  /** 模型配置文件路径 */
  get modelConfigPath(): string {
    return path.join(this.baseDir, 'model-config.json')
  }

  /** 密钥存储路径 */
  get secretsPath(): string {
    return path.join(this.baseDir, 'secrets.json')
  }

  /** 应用级插件库路径 */
  get pluginRegistryPath(): string {
    return path.join(this.baseDir, 'plugin-registry.json')
  }

  /** 用户偏好配置路径 */
  get preferencesPath(): string {
    return path.join(this.baseDir, 'preferences.json')
  }

  /** 确保配置目录存在 */
  ensureConfigDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
  }
}
