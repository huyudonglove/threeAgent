// src-main/runtime/input-understanding-service.ts
// 输入理解服务：将用户原始输入解析为结构化任务信息
// 当前版本为纯规则匹配，不调用 LLM

import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

export interface InputUnderstandingResult {
  title: string
  taskType: string
  taskDomain: string
  workflowId: string
}

// 关键词规则表
interface KeywordRule {
  keywords: string[]
  taskType: string
  taskDomain: string
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    keywords: ['调研', '预研', '研究', '分析', '查找', '搜索'],
    taskType: 'research',
    taskDomain: 'research',
  },
  {
    keywords: ['开发', '实现', '修复', '重构', '优化', '代码'],
    taskType: 'development',
    taskDomain: 'code-dev',
  },
  {
    keywords: ['文档', '整理', '撰写', '总结', '报告'],
    taskType: 'design',
    taskDomain: 'doc-writing',
  },
]

const DEFAULT_RULE: KeywordRule = {
  keywords: [],
  taskType: 'development',
  taskDomain: 'general',
}

/**
 * 输入理解 taskDomain → 内置 workflow ID 映射表
 * InputUnderstandingService 输出的 taskDomain 与 WorkflowRegistry 注册的 taskDomain 不一致，
 * 需要映射层将理解域转换为真实 workflow ID。
 * 找不到映射时 fallback 到 ai-development。
 */
export const DOMAIN_TO_WORKFLOW: Record<string, string> = {
  'research': 'research-prestudy',
  'code-dev': 'existing-repo-iteration',
  'doc-writing': 'document-generation',
  'general': 'ai-development',
}

const DEFAULT_WORKFLOW_ID = 'ai-development'

/**
 * 将输入理解 taskDomain 解析为真实 workflow ID
 */
export function resolveWorkflowId(domain: string): string {
  return DOMAIN_TO_WORKFLOW[domain] ?? DEFAULT_WORKFLOW_ID
}

const MAX_TITLE_LENGTH = 50

export class InputUnderstandingService {
  /**
   * 理解用户原始输入，返回结构化任务信息
   * 使用最小关键词匹配规则
   */
  understand(rawInput: string): Result<InputUnderstandingResult> {
    const input = rawInput.trim()
    if (!input) {
      return err(createError('INVALID_INPUT', 'input-understanding', 'Input cannot be empty'))
    }

    // 按规则顺序匹配，首个命中即返回
    let matchedRule = DEFAULT_RULE
    for (const rule of KEYWORD_RULES) {
      if (rule.keywords.some((kw) => input.includes(kw))) {
        matchedRule = rule
        break
      }
    }

    // title: 取 rawInput 前 50 个字符
    const title = input.length > MAX_TITLE_LENGTH
      ? input.substring(0, MAX_TITLE_LENGTH)
      : input

    return ok({
      title,
      taskType: matchedRule.taskType,
      taskDomain: matchedRule.taskDomain,
      workflowId: resolveWorkflowId(matchedRule.taskDomain),
    })
  }
}
