// src-main/results/reuse-suggestion-service.ts
// 复用建议服务：从历史产物和记忆中提取可复用资产建议

import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import { Result, ok, err } from '../errors/result'
import type { ArtifactIndexEntry } from '../contracts/types'

// ─── 复用建议 ───

export interface ReuseSuggestion {
  /** 建议ID */
  id: string
  /** 来源任务ID */
  sourceTaskId: string
  /** 来源产物类型 */
  sourceArtifactType: string
  /** 来源产物标题 */
  sourceArtifactTitle: string
  /** 复用建议描述 */
  suggestion: string
  /** 相似度评估 */
  similarity: 'high' | 'medium' | 'low'
  /** 建议来源 */
  source: 'artifact' | 'memory'
}

// ─── ReuseSuggestionService ───

export class ReuseSuggestionService {
  /**
   * 根据当前任务领域和已有产物，生成复用建议
   */
  async generateReuseSuggestions(
    rootPath: string,
    currentDomain: string,
    currentTaskId: string,
  ): Promise<Result<ReuseSuggestion[]>> {
    const resolver = new PathResolver(rootPath)

    // 读取产物索引
    const indexPath = resolver.artifactIndexPath()
    const exists = await JsonStore.exists(indexPath)
    if (!exists) return ok([])

    const indexResult = await JsonStore.read<ArtifactIndexEntry[]>(indexPath)
    if (!indexResult.ok) return err(indexResult.error!)

    const allArtifacts = indexResult.data
    const suggestions: ReuseSuggestion[] = []

    for (const artifact of allArtifacts) {
      // 排除当前任务自身的产物
      if (artifact.taskId === currentTaskId) continue
      // 只推荐已完成/可用的产物
      if (artifact.status !== 'ready' && artifact.status !== 'updated') continue

      const similarity = this.assessSimilarity(artifact, currentDomain)
      if (similarity !== 'low') {
        suggestions.push({
          id: `reuse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          sourceTaskId: artifact.taskId,
          sourceArtifactType: artifact.type,
          sourceArtifactTitle: artifact.title,
          suggestion: `可参考 "${artifact.title}" (${artifact.type})，来自任务 ${artifact.taskId}`,
          similarity,
          source: 'artifact',
        })
      }
    }

    // 按相似度排序
    const order = { high: 0, medium: 1, low: 2 }
    suggestions.sort((a, b) => order[a.similarity] - order[b.similarity])

    return ok(suggestions)
  }

  /**
   * 评估产物与当前任务的相似度
   */
  private assessSimilarity(
    artifact: ArtifactIndexEntry,
    currentDomain: string,
  ): 'high' | 'medium' | 'low' {
    // 高相似度：相同产物类型且可能相关
    const highSimilarityTypes = ['TechnicalDesignDocument', 'TechnicalPlan', 'ProductSpec']
    if (highSimilarityTypes.includes(artifact.type)) {
      return 'high'
    }

    // 中相似度：通用类型
    const mediumSimilarityTypes = ['DevelopmentTaskPlan', 'RepositoryReviewResult', 'AcceptanceResult']
    if (mediumSimilarityTypes.includes(artifact.type)) {
      return 'medium'
    }

    return 'low'
  }
}
