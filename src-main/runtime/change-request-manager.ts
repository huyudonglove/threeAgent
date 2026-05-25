// src-main/runtime/change-request-manager.ts
// 变更请求最小读写

import { PathResolver } from '../storage/path-resolver'
import { JsonlStore } from '../storage/jsonl-store'
import { JsonStore } from '../storage/json-store'
import type { ChangeRequest } from '../contracts/types'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

export class ChangeRequestManager {
  /**
   * 创建变更请求
   */
  async create(workspaceRootPath: string, request: Omit<ChangeRequest, 'id' | 'createdAt' | 'resolvedAt' | 'status'>): Promise<Result<ChangeRequest>> {
    const record: ChangeRequest = {
      ...request,
      id: `cr_${Date.now()}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    }
    const resolver = new PathResolver(workspaceRootPath)
    const filePath = resolver.logsDir + '/change-requests.jsonl'
    const appendResult = await JsonlStore.append(filePath, record)
    if (!appendResult.ok) return appendResult as Result<never>
    return ok(record)
  }

  /**
   * 读取指定任务的所有变更请求
   */
  async listByTask(workspaceRootPath: string, taskId: string): Promise<Result<ChangeRequest[]>> {
    const resolver = new PathResolver(workspaceRootPath)
    const filePath = resolver.logsDir + '/change-requests.jsonl'
    const result = await JsonlStore.readAll<ChangeRequest>(filePath)
    if (!result.ok) return result

    return ok(result.data.filter((r) => r.taskId === taskId))
  }
}
