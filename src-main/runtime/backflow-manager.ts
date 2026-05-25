// src-main/runtime/backflow-manager.ts
// 回流记录最小读写

import { PathResolver } from '../storage/path-resolver'
import { JsonlStore } from '../storage/jsonl-store'
import type { BackflowRecord } from '../contracts/types'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

export class BackflowManager {
  /**
   * 追加一条回流记录
   */
  async append(workspaceRootPath: string, record: BackflowRecord): Promise<Result<void>> {
    const resolver = new PathResolver(workspaceRootPath)
    const filePath = resolver.logsDir + '/backflow.jsonl'
    return JsonlStore.append(filePath, record)
  }

  /**
   * 读取指定任务的所有回流记录
   */
  async listByTask(workspaceRootPath: string, taskId: string): Promise<Result<BackflowRecord[]>> {
    const resolver = new PathResolver(workspaceRootPath)
    const filePath = resolver.logsDir + '/backflow.jsonl'
    const result = await JsonlStore.readAll<BackflowRecord>(filePath)
    if (!result.ok) return result

    return ok(result.data.filter((r) => r.taskId === taskId))
  }
}
