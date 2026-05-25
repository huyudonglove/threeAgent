// src-main/model-config/runtime-state-manager.ts
// 模型配置运行时状态管理

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import type { ModelConfigRuntimeState } from './contracts'
import { Result, ok } from '../errors/result'

export class RuntimeStateManager {
  /**
   * 读取运行时状态
   */
  async read(workspaceRootPath: string): Promise<Result<ModelConfigRuntimeState>> {
    const resolver = new PathResolver(workspaceRootPath)
    const result = await JsonStore.read<ModelConfigRuntimeState>(
      resolver.modelConfigDir + '/runtime-state.json',
    )
    if (result.ok) return result

    // 不存在则返回默认状态
    return ok({
      lastHealthCheck: {},
      configState: 'no_provider',
      blockedReason: '尚未连接任何模型服务商',
      updatedAt: new Date().toISOString(),
    })
  }

  /**
   * 写入运行时状态
   */
  async write(workspaceRootPath: string, state: ModelConfigRuntimeState): Promise<Result<void>> {
    const resolver = new PathResolver(workspaceRootPath)
    return JsonStore.write(resolver.modelConfigDir + '/runtime-state.json', {
      ...state,
      updatedAt: new Date().toISOString(),
    })
  }
}
