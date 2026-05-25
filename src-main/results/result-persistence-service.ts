// src-main/results/result-persistence-service.ts
// 结果沉淀服务：任务完成后收集最终产物、生成结果摘要、提交记忆、关闭任务
// 遵循设计规范：先写正文→再写ArtifactIndex→再更新TaskRuntime→再写DisplayTrace→按需submitMemorySource

import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import { ArtifactService } from '../artifacts/artifact-service'
import { ArtifactIndexStore } from '../artifacts/artifact-index-store'
import { TaskRuntimeManager } from '../runtime/task-runtime-manager'
import { AgentMemoryService } from '../memory/agent-memory-service'
import { ResultSummaryBuilder, ResultSummary } from './result-summary-builder'
import { ReuseSuggestionService, ReuseSuggestion } from './reuse-suggestion-service'
import { InputUnderstandingService, resolveWorkflowId } from '../runtime/input-understanding-service'
import type { TaskRuntime, ArtifactIndexEntry } from '../contracts/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PathResolver } from '../storage/path-resolver'

// ─── 对外接口类型 ───

export interface CollectAndPersistInput {
  rootPath: string
  taskId: string
  conversationId: string
  /** 操作角色 */
  operatorRole: string
}

export interface ResultPersistenceOutput {
  summary: ResultSummary
  reuseSuggestions: ReuseSuggestion[]
  memorySubmitted: boolean
  taskClosed: boolean
}

/** 基于结果继续的任务草案 */
export interface ContinueTaskDraft {
  title: string
  taskType: string
  taskDomain: string
  workflowId: string
  rawInput: string
}

// ─── ResultPersistenceService ───

export class ResultPersistenceService {
  private artifactService = new ArtifactService()
  private taskManager = new TaskRuntimeManager()
  private memoryService = new AgentMemoryService()
  private summaryBuilder = new ResultSummaryBuilder()
  private reuseService = new ReuseSuggestionService()
  private inputUnderstanding = new InputUnderstandingService()

  /**
   * 任务结果沉淀主流程
   * 1. 读取 TaskRuntime
   * 2. 收集关联产物
   * 3. 构建结果摘要
   * 4. 生成复用建议
   * 5. 提交记忆源
   * 6. 关闭任务（更新状态为 done）
   */
  async collectAndPersist(input: CollectAndPersistInput): Promise<Result<ResultPersistenceOutput>> {
    const { rootPath, taskId, conversationId, operatorRole } = input

    // 1. 读取 TaskRuntime
    const taskResult = await this.taskManager.read(rootPath, taskId)
    if (!taskResult.ok) {
      return err(createError('TASK_NOT_FOUND', `任务 ${taskId} 不存在`, 'result-persistence', {
        recoverable: false,
      }))
    }
    const taskRuntime = taskResult.data

    // 2. 收集关联产物
    const artifactsResult = await this.artifactService.listArtifactsByTask(rootPath, taskId)
    const artifacts: ArtifactIndexEntry[] = artifactsResult.ok ? artifactsResult.data : []

    // 3. 构建结果摘要
    const summary = this.summaryBuilder.buildSummary(taskRuntime, artifacts)

    // 4. 将结果摘要作为产物写入
    const summaryArtifact = await this.artifactService.createArtifact({
      workspaceRootPath: rootPath,
      conversationId,
      taskId,
      artifactType: 'ResultSummary',
      title: `任务结果摘要: ${taskRuntime.title}`,
      format: 'json',
      content: JSON.stringify(summary, null, 2),
      createdByRole: operatorRole,
    })
    // 摘要产物写入失败不阻断主流程
    if (!summaryArtifact.ok) {
      console.error('result-persistence: ResultSummary artifact creation failed', summaryArtifact.error)
    }

    // 5. 生成复用建议
    const reuseResult = await this.reuseService.generateReuseSuggestions(
      rootPath,
      taskRuntime.domainName ?? '',
      taskId,
    )
    const reuseSuggestions = reuseResult.ok ? reuseResult.data : []

    // 6. 提交记忆源
    let memorySubmitted = false
    const memoryInput = this.buildMemoryInput(rootPath, taskRuntime, summary)
    const memoryResult = await this.memoryService.submitMemorySource(memoryInput)
    if (memoryResult.ok && memoryResult.data.decision.action !== 'skip') {
      memorySubmitted = true
    }
    // 记忆提交失败不阻断主流程
    if (!memoryResult.ok) {
      console.error('result-persistence: memory submission failed', memoryResult.error)
    }

    // 7. 关闭任务（更新状态为 done）
    let taskClosed = false
    if (taskRuntime.status !== 'done') {
      const closeResult = await this.taskManager.updateStatus(rootPath, taskId, 'done')
      taskClosed = closeResult.ok
      if (!closeResult.ok) {
        console.error('result-persistence: task close failed', closeResult.error)
      }
    } else {
      taskClosed = true
    }

    return ok({
      summary,
      reuseSuggestions,
      memorySubmitted,
      taskClosed,
    })
  }

  /**
   * 仅构建结果摘要（不执行持久化）
   */
  async buildResultSummary(
    rootPath: string,
    taskId: string,
  ): Promise<Result<ResultSummary>> {
    const taskResult = await this.taskManager.read(rootPath, taskId)
    if (!taskResult.ok) return err(taskResult.error!)

    const artifactsResult = await this.artifactService.listArtifactsByTask(rootPath, taskId)
    const artifacts = artifactsResult.ok ? artifactsResult.data : []

    return ok(this.summaryBuilder.buildSummary(taskResult.data, artifacts))
  }

  /**
   * 基于历史结果生成继续任务草案
   * P2-MAIN-01: 结果继续链路 - 从结果摘要中提取上下文，生成结构化新任务草案
   */
  async generateContinueDraft(
    rootPath: string,
    resultId: string,
  ): Promise<Result<ContinueTaskDraft>> {
    // 1. 加载结果
    const loadResult = await this.load(rootPath, resultId)
    if (!loadResult.ok) return err(loadResult.error!)

    const { content: summary } = loadResult.data

    // 2. 从结果的下步建议中构建 rawInput
    const suggestionText = summary.nextSuggestions.length > 0
      ? summary.nextSuggestions[0]
      : '继续推进任务'
    const rawInput = `基于任务「${summary.taskTitle}」的结果继续: ${suggestionText}`

    // 3. 用 InputUnderstandingService 理解 rawInput 生成结构化草案
    const understandResult = this.inputUnderstanding.understand(rawInput)
    if (!understandResult.ok) {
      // 理解失败时使用默认草案
      return ok({
        title: `继续: ${summary.taskTitle}`,
        taskType: 'development',
        taskDomain: summary.taskDomain || 'general',
        workflowId: resolveWorkflowId(summary.taskDomain || 'general'),
        rawInput,
      })
    }

    // 4. 合并结果上下文到草案
    const draft = understandResult.data
    return ok({
      title: draft.title,
      taskType: draft.taskType,
      taskDomain: summary.taskDomain || draft.taskDomain,
      workflowId: draft.workflowId,
      rawInput,
    })
  }

  /**
   * 仅生成复用建议
   */
  async getReuseSuggestions(
    rootPath: string,
    currentDomain: string,
    currentTaskId: string,
  ): Promise<Result<ReuseSuggestion[]>> {
    return this.reuseService.generateReuseSuggestions(rootPath, currentDomain, currentTaskId)
  }

  // ─── 列表与查询方法 ───

  /**
   * 列出工作区内所有结果摘要产物
   */
  async listByWorkspace(rootPath: string): Promise<Result<ArtifactIndexEntry[]>> {
    const indexStore = new ArtifactIndexStore()
    const indexResult = await indexStore.readIndex(rootPath)
    if (!indexResult.ok) return indexResult as Result<never>

    // 过滤出 ResultSummary 类型的产物
    const results = indexResult.data.filter(e => e.type === 'ResultSummary')
    return ok(results)
  }

  /**
   * 列出指定任务的结果摘要产物
   */
  async listByTask(rootPath: string, taskId: string): Promise<Result<ArtifactIndexEntry[]>> {
    const indexStore = new ArtifactIndexStore()
    const indexResult = await indexStore.readIndex(rootPath)
    if (!indexResult.ok) return indexResult as Result<never>

    const results = indexResult.data.filter(
      e => e.type === 'ResultSummary' && e.taskId === taskId,
    )
    return ok(results)
  }

  /**
   * 加载指定结果的完整内容（索引 + 正文）
   */
  async load(rootPath: string, resultId: string): Promise<Result<{ index: ArtifactIndexEntry; content: ResultSummary }>> {
    const artifactResult = await this.artifactService.getArtifactById(rootPath, resultId, true)
    if (!artifactResult.ok) return artifactResult as Result<never>

    const { index, content: rawContent } = artifactResult.data
    if (!rawContent) {
      return err(createError('RESULT_NOT_FOUND', 'result-persistence',
        `结果 "${resultId}" 正文不存在`, { recoverable: false }))
    }

    let parsed: ResultSummary
    try {
      parsed = JSON.parse(rawContent) as ResultSummary
    } catch {
      return err(createError('RESULT_PARSE_FAILED', 'result-persistence',
        `结果 "${resultId}" 正文解析失败`, { recoverable: false }))
    }

    return ok({ index, content: parsed })
  }

  // ─── 内部方法 ───

  private buildMemoryInput(
    rootPath: string,
    taskRuntime: TaskRuntime,
    summary: ResultSummary,
  ): {
    rootPath: string
    conversationId: string
    turnId: string
    currentAgentRole: string
    sourceText: string
  } {
    // 构建记忆来源文本
    const parts: string[] = []
    parts.push(`任务 "${taskRuntime.title}" 完成。`)
    if (summary.completedScope.length > 0) {
      parts.push(`已完成: ${summary.completedScope.join('; ')}`)
    }
    if (summary.technicalDebt.length > 0) {
      parts.push(`技术债务: ${summary.technicalDebt.join('; ')}`)
    }
    if (summary.nextSuggestions.length > 0) {
      parts.push(`后续建议: ${summary.nextSuggestions.join('; ')}`)
    }

    return {
      rootPath: rootPath,
      conversationId: taskRuntime.conversationId,
      turnId: `result_persist_${Date.now()}`,
      currentAgentRole: taskRuntime.owner,
      sourceText: parts.join(' '),
    }
  }
}
