// src-main/results/result-summary-builder.ts
// 结果摘要构建器：从任务运行态和产物中构建结构化结果摘要

import type { TaskRuntime, TaskStatus, ArtifactIndexEntry, ArtifactStatus } from '../contracts/types'

// ─── 结果摘要 ───

export interface ResultSummary {
  taskId: string
  taskTitle: string
  taskDomain: string
  status: string
  /** 已完成范围 */
  completedScope: string[]
  /** 未完成范围 */
  unfinishedScope: string[]
  /** 技术债务 */
  technicalDebt: string[]
  /** 后续建议 */
  nextSuggestions: string[]
  /** 关联产物摘要 */
  artifactSummaries: Array<{
    artifactId: string
    artifactType: string
    title: string
    status: string
  }>
  /** 生成时间 */
  generatedAt: string
}

// ─── ResultSummaryBuilder ───

export class ResultSummaryBuilder {
  /**
   * 从 TaskRuntime 和产物列表构建结果摘要
   */
  buildSummary(
    taskRuntime: TaskRuntime,
    artifacts: ArtifactIndexEntry[],
  ): ResultSummary {
    const completedScope = this.extractCompletedScope(taskRuntime, artifacts)
    const unfinishedScope = this.extractUnfinishedScope(taskRuntime)
    const technicalDebt = this.extractTechnicalDebt(artifacts)
    const nextSuggestions = this.generateNextSuggestions(taskRuntime, artifacts)

    return {
      taskId: taskRuntime.id,
      taskTitle: taskRuntime.title,
      taskDomain: taskRuntime.domainName ?? '',
      status: taskRuntime.status,
      completedScope,
      unfinishedScope,
      technicalDebt,
      nextSuggestions,
      artifactSummaries: artifacts.map((a) => ({
        artifactId: a.id,
        artifactType: a.type,
        title: a.title,
        status: a.status as string,
      })),
      generatedAt: new Date().toISOString(),
    }
  }

  /**
   * 提取已完成范围
   */
  private extractCompletedScope(
    taskRuntime: TaskRuntime,
    artifacts: ArtifactIndexEntry[],
  ): string[] {
    const scope: string[] = []

    // 从已完成的产物中提取
    for (const artifact of artifacts) {
      if (artifact.status === 'ready' || artifact.status === 'draft') {
        scope.push(`${artifact.type}: ${artifact.title}`)
      }
    }

    // 从任务状态推断
    if (taskRuntime.status === 'done') {
      scope.push('任务整体已完成')
    }

    return scope
  }

  /**
   * 提取未完成范围
   */
  private extractUnfinishedScope(taskRuntime: TaskRuntime): string[] {
    const scope: string[] = []

    if (taskRuntime.status === 'blocked') {
      scope.push(`阻塞中: ${taskRuntime.blockedReason ?? '原因未知'}`)
    }
    if (taskRuntime.status === 'running') {
      scope.push(`当前节点: ${taskRuntime.currentNodeName}`)
    }
    if (taskRuntime.waitingFor) {
      scope.push('等待用户确认或输入')
    }

    return scope
  }

  /**
   * 提取技术债务
   */
  private extractTechnicalDebt(artifacts: ArtifactIndexEntry[]): string[] {
    const debt: string[] = []

    for (const artifact of artifacts) {
      if (artifact.status === 'draft') {
        debt.push(`${artifact.type} "${artifact.title}" 仍为草稿状态`)
      }
    }

    return debt
  }

  /**
   * 生成后续建议
   */
  private generateNextSuggestions(
    taskRuntime: TaskRuntime,
    artifacts: ArtifactIndexEntry[],
  ): string[] {
    const suggestions: string[] = []

    if (taskRuntime.status === 'done') {
      suggestions.push('可以将本任务结果沉淀为长期记忆')
      suggestions.push('检查是否有可复用的产物模板')
    }

    if (taskRuntime.status === 'blocked') {
      suggestions.push('解决阻塞后重新推进任务')
    }

    if (taskRuntime.status === 'cancelled') {
      suggestions.push('分析取消原因，考虑回流到合适节点')
    }

    // 检查是否有草稿产物需要完善
    const drafts = artifacts.filter((a) => a.status === 'draft')
    if (drafts.length > 0) {
      suggestions.push(`有 ${drafts.length} 个草稿产物需要完善`)
    }

    if (suggestions.length === 0) {
      suggestions.push('继续推进当前任务流程')
    }

    return suggestions
  }
}
