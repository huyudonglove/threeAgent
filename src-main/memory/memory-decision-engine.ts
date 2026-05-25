// src-main/memory/memory-decision-engine.ts
// 记忆决策引擎：从 sourceText 识别信号强度、候选记忆、目标角色和分类
// 遵循设计规范：外层不提交 signalKind/signalStrength，全部由内部判断

import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

// ─── 信号强度 ───

export type SignalStrength = 'none' | 'weak' | 'medium' | 'strong'

// ─── 记忆分类 ───

export type MemoryCategory =
  | 'decisions'
  | 'preferences'
  | 'projectContext'
  | 'workingContext'
  | 'systemContext'
  | 'userProfile'

export const MEMORY_CATEGORIES: MemoryCategory[] = [
  'decisions',
  'preferences',
  'projectContext',
  'workingContext',
  'systemContext',
  'userProfile',
]

// ─── 记忆目标范围 ───

export type MemoryScope = 'shared' | 'role_local'

// ─── MemorySourceCheckResult (内部识别结果) ───

export interface MemoryCandidate {
  candidateText: string
  targetMemoryScope: MemoryScope
  targetAgentRoles: string[]
  memoryCategory: MemoryCategory
}

export interface MemorySourceCheckResult {
  signalStrength: SignalStrength
  candidates: MemoryCandidate[]
}

// ─── MemoryDecision (内部写入决策) ───

export type MemoryAction = 'write' | 'skip' | 'merge' | 'replace' | 'conflict' | 'ask_user'

export interface MemoryDecision {
  decisionId: string
  conversationId: string
  turnId: string
  sourceRole: string
  signalStrength: SignalStrength
  action: MemoryAction
  targetScope: MemoryScope
  targetRole: string | null
  memoryCategory: MemoryCategory
  memoryText: string
  conflict: boolean
  requiresUserConfirmation: boolean
}

// ─── 关键词映射表（第一版基于规则，后续可替换为模型判断） ───

const DECISION_KEYWORDS = [
  '决定', '确认', '选择', '方案', '改为', '改为使用', '不再', '统一', '规范',
  'decided', 'confirmed', 'chose', 'switched', 'agreed',
]

const PREFERENCE_KEYWORDS = [
  '喜欢', '偏好', '更喜欢', '倾向于', '习惯', '更喜欢些',
  'prefer', 'like', 'rather', 'favor',
]

const PROJECT_CONTEXT_KEYWORDS = [
  '项目', '工程', '仓库', '工作区', '架构', '技术栈', '框架', '模块',
  'project', 'repo', 'workspace', 'architecture', 'framework',
]

const WORKING_CONTEXT_KEYWORDS = [
  '当前', '现在', '正在', '进行中', '今天', '本轮',
  'current', 'now', 'ongoing', 'today',
]

const SYSTEM_CONTEXT_KEYWORDS = [
  '系统', '配置', '环境', '安装', '版本', '依赖',
  'system', 'config', 'environment', 'installed', 'version',
]

const USER_PROFILE_KEYWORDS = [
  '我叫', '我是', '我的', '我是做', '团队',
  'my name', 'I am', 'I work', 'team',
]

// ─── 决策引擎 ───

export class MemoryDecisionEngine {
  /**
   * 从 sourceText 执行 MemorySourceCheck
   * 识别信号强度、候选记忆、目标角色和分类
   */
  performSourceCheck(
    sourceText: string,
    currentAgentRole: string,
  ): MemorySourceCheckResult {
    const text = sourceText.trim()
    if (!text) {
      return { signalStrength: 'none', candidates: [] }
    }

    // 第一版基于规则判断信号强度
    const signalStrength = this.assessSignalStrength(text)
    if (signalStrength === 'none') {
      return { signalStrength: 'none', candidates: [] }
    }

    // 提纯候选记忆
    const candidates = this.extractCandidates(text, currentAgentRole)

    return { signalStrength, candidates }
  }

  /**
   * 判断信号强度
   */
  private assessSignalStrength(text: string): SignalStrength {
    let score = 0

    // 检查各类关键词命中
    if (this.containsKeywords(text, DECISION_KEYWORDS)) score += 3
    if (this.containsKeywords(text, PREFERENCE_KEYWORDS)) score += 3
    if (this.containsKeywords(text, PROJECT_CONTEXT_KEYWORDS)) score += 2
    if (this.containsKeywords(text, SYSTEM_CONTEXT_KEYWORDS)) score += 2
    if (this.containsKeywords(text, WORKING_CONTEXT_KEYWORDS)) score += 1
    if (this.containsKeywords(text, USER_PROFILE_KEYWORDS)) score += 2

    // 文本长度越长越可能有价值
    if (text.length > 100) score += 1
    if (text.length > 200) score += 1

    if (score >= 4) return 'strong'
    if (score >= 2) return 'medium'
    if (score >= 1) return 'weak'
    return 'none'
  }

  /**
   * 从文本中提纯候选记忆
   */
  private extractCandidates(
    text: string,
    currentAgentRole: string,
  ): MemoryCandidate[] {
    const candidates: MemoryCandidate[] = []

    // 按优先级匹配分类
    const categoryChecks: Array<{ keywords: string[]; category: MemoryCategory }> = [
      { keywords: DECISION_KEYWORDS, category: 'decisions' },
      { keywords: PREFERENCE_KEYWORDS, category: 'preferences' },
      { keywords: USER_PROFILE_KEYWORDS, category: 'userProfile' },
      { keywords: PROJECT_CONTEXT_KEYWORDS, category: 'projectContext' },
      { keywords: SYSTEM_CONTEXT_KEYWORDS, category: 'systemContext' },
      { keywords: WORKING_CONTEXT_KEYWORDS, category: 'workingContext' },
    ]

    let matched = false
    for (const check of categoryChecks) {
      if (this.containsKeywords(text, check.keywords)) {
        candidates.push(this.createCandidate(text, check.category, currentAgentRole))
        matched = true
      }
    }

    // 如果没有明确分类命中，但文本有一定长度，作为 workingContext
    if (!matched && text.length > 50) {
      candidates.push(this.createCandidate(text, 'workingContext', currentAgentRole))
    }

    return candidates
  }

  /**
   * 创建候选记忆
   */
  private createCandidate(
    text: string,
    category: MemoryCategory,
    currentAgentRole: string,
  ): MemoryCandidate {
    // 判断目标范围：decisions/preferences/projectContext/systemContext/userProfile → shared
    // workingContext → role_local
    const sharedCategories: MemoryCategory[] = [
      'decisions', 'preferences', 'projectContext', 'systemContext', 'userProfile',
    ]
    const targetMemoryScope: MemoryScope = sharedCategories.includes(category)
      ? 'shared'
      : 'role_local'

    const targetAgentRoles = targetMemoryScope === 'role_local' ? [currentAgentRole] : []

    return {
      candidateText: text,
      targetMemoryScope,
      targetAgentRoles,
      memoryCategory: category,
    }
  }

  /**
   * 根据候选和冲突情况生成 MemoryDecision
   */
  makeDecision(
    candidate: MemoryCandidate,
    conversationId: string,
    turnId: string,
    sourceRole: string,
    signalStrength: SignalStrength,
    hasConflict: boolean,
  ): MemoryDecision {
    const decisionId = `mem_decision_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    let action: MemoryAction = 'write'
    let conflict = false
    let requiresUserConfirmation = false

    if (signalStrength === 'none' || signalStrength === 'weak') {
      action = 'skip'
    } else if (hasConflict) {
      action = 'conflict'
      conflict = true
      requiresUserConfirmation = true
    }

    return {
      decisionId,
      conversationId,
      turnId,
      sourceRole,
      signalStrength,
      action,
      targetScope: candidate.targetMemoryScope,
      targetRole: candidate.targetAgentRoles[0] ?? null,
      memoryCategory: candidate.memoryCategory,
      memoryText: candidate.candidateText,
      conflict,
      requiresUserConfirmation,
    }
  }

  /**
   * 用户确认冲突后更新决策
   */
  resolveConflictDecision(
    originalDecision: MemoryDecision,
    userChoice: 'keep' | 'update',
  ): MemoryDecision {
    return {
      ...originalDecision,
      action: userChoice === 'update' ? 'replace' : 'skip',
      conflict: false,
      requiresUserConfirmation: false,
    }
  }

  /**
   * 检查文本是否包含指定关键词列表中的任一项
   */
  private containsKeywords(text: string, keywords: string[]): boolean {
    const lower = text.toLowerCase()
    return keywords.some((kw) => lower.includes(kw.toLowerCase()))
  }
}
