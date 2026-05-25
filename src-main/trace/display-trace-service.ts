// src-main/trace/display-trace-service.ts
// 展示镜像服务：运行证据层，让系统能回答"为什么推进到这里"
// 来源：05-记忆系统/DisplayTrace与AgentMemory分离设计、12-实现落地/运行态真源与展示镜像边界

import fs from 'node:fs/promises'
import path from 'node:path'
import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import { JsonlStore } from '../storage/jsonl-store'
import type { DisplayTraceEvent, DisplayTraceManifest, DisplayTraceEventType } from './display-trace-types'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

const MAX_EVENTS_PER_SEGMENT = 500

/**
 * 展示镜像服务
 *
 * 关键约束：
 * - DisplayTrace 是展示镜像，不是运行态真源
 * - trace 写失败不回滚运行态真源
 * - 不修改旧 event、不重排旧 event
 * - 不以 trace 成败决定主运行态是否回滚
 */
export class DisplayTraceService {
  /**
   * 追加一条 DisplayTrace 事件
   * 来源：模块接口I/O契约 - DisplayTraceService.appendDisplayTraceEvent
   */
  async appendEvent(input: {
    workspaceRootPath: string
    workspaceId: string
    conversationId: string
    taskId?: string | null
    turnId?: string | null
    eventType: DisplayTraceEventType
    dataName: string
    dataId?: string | null
    actorRole?: string | null
    summary: string
    displayPayload?: Record<string, unknown>
  }): Promise<Result<DisplayTraceEvent>> {
    const resolver = new PathResolver(input.workspaceRootPath)

    const event: DisplayTraceEvent = {
      id: `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      taskId: input.taskId ?? null,
      turnId: input.turnId ?? null,
      eventType: input.eventType,
      dataName: input.dataName,
      dataId: input.dataId ?? null,
      actorRole: input.actorRole ?? null,
      summary: input.summary,
      displayPayload: input.displayPayload,
      timestamp: new Date().toISOString(),
    }

    // 读取或创建 manifest
    const manifestResult = await this.readOrCreateManifest(
      input.workspaceRootPath, input.workspaceId, input.conversationId,
    )
    if (!manifestResult.ok) return manifestResult as Result<never>

    const manifest = manifestResult.data

    // 检查是否需要轮转到新 segment
    const segmentPath = resolver.traceSegmentPath(input.conversationId, manifest.currentSegment)
    const segmentDir = path.dirname(segmentPath)
    await fs.mkdir(segmentDir, { recursive: true })

    // 检查当前 segment 的事件数
    let currentEventCount = 0
    try {
      const stat = await fs.stat(segmentPath)
      if (stat.isFile()) {
        const content = await fs.readFile(segmentPath, 'utf-8')
        currentEventCount = content.split('\n').filter(l => l.trim()).length
      }
    } catch {
      // 文件不存在，计数为 0
    }

    if (currentEventCount >= MAX_EVENTS_PER_SEGMENT) {
      manifest.currentSegment++
      manifest.updatedAt = new Date().toISOString()
    }

    // 追加事件到 JSONL
    const appendResult = await JsonlStore.append(segmentPath, event)
    if (!appendResult.ok) {
      // trace 写失败不阻塞主流程，但返回错误让调用方决定是否记录降级日志
      return err(createError('STORAGE_WRITE_FAILED', 'trace',
        `Failed to append trace event: ${appendResult.error.message}`, {
          recoverable: true,
          suggestedAction: 'Trace write failed. Main operation should not be rolled back.',
          detail: appendResult.error,
        }))
    }

    // 更新 manifest
    manifest.totalEvents++
    manifest.updatedAt = new Date().toISOString()
    const manifestPath = path.join(segmentDir, 'manifest.json')
    await JsonStore.write(manifestPath, manifest)

    return ok(event)
  }

  /**
   * 按会话查询 trace 事件
   * 来源：模块接口I/O契约 - DisplayTraceService.queryTraceByConversation
   */
  async queryByConversation(
    workspaceRootPath: string,
    conversationId: string,
    limit: number = 50,
  ): Promise<Result<DisplayTraceEvent[]>> {
    const resolver = new PathResolver(workspaceRootPath)
    const traceDir = path.join(resolver.displayTraceDir, conversationId)

    const events = await this.readEventsFromDir(traceDir, limit)
    return ok(events)
  }

  /**
   * 按任务查询 trace 事件
   * 来源：模块接口I/O契约 - DisplayTraceService.queryTraceByTask
   */
  async queryByTask(
    workspaceRootPath: string,
    conversationId: string,
    taskId: string,
    limit: number = 50,
  ): Promise<Result<DisplayTraceEvent[]>> {
    const allResult = await this.queryByConversation(workspaceRootPath, conversationId, limit * 5)
    if (!allResult.ok) return allResult

    const filtered = allResult.data
      .filter(e => e.taskId === taskId)
      .slice(0, limit)

    return ok(filtered)
  }

  /**
   * 读取 trace 摘要（最近 N 条关键事件）
   */
  async readSummary(
    workspaceRootPath: string,
    conversationId: string,
    limit: number = 10,
  ): Promise<Result<DisplayTraceEvent[]>> {
    const result = await this.queryByConversation(workspaceRootPath, conversationId, limit)
    return result
  }

  // ─── 私有方法 ───

  private async readOrCreateManifest(
    workspaceRootPath: string,
    workspaceId: string,
    conversationId: string,
  ): Promise<Result<DisplayTraceManifest>> {
    const resolver = new PathResolver(workspaceRootPath)
    const segmentDir = path.join(resolver.displayTraceDir, conversationId)
    const manifestPath = path.join(segmentDir, 'manifest.json')

    const exists = await JsonStore.exists(manifestPath)
    if (!exists) {
      const now = new Date().toISOString()
      const manifest: DisplayTraceManifest = {
        workspaceId,
        conversationId,
        currentSegment: 1,
        totalEvents: 0,
        createdAt: now,
        updatedAt: now,
      }
      return ok(manifest)
    }

    const result = await JsonStore.read<DisplayTraceManifest>(manifestPath)
    if (!result.ok) return result
    return ok(result.data)
  }

  private async readEventsFromDir(dirPath: string, limit: number): Promise<DisplayTraceEvent[]> {
    const events: DisplayTraceEvent[] = []

    try {
      const files = await fs.readdir(dirPath)
      // 按 segment 编号排序，从最新的开始读
      const sortedFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .reverse()

      for (const file of sortedFiles) {
        if (events.length >= limit) break

        const filePath = path.join(dirPath, file)
        const readResult = await JsonlStore.readAll<DisplayTraceEvent>(filePath)
        if (!readResult.ok) continue
        for (const event of readResult.data.reverse()) {
          events.push(event)
          if (events.length >= limit) break
        }
      }
    } catch {
      // 目录不存在或读取失败
    }

    // 按时间倒序
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return events.slice(0, limit)
  }
}
