// src-main/model-lab/structured-output-prompt-builder.ts
// 模型实验请求 PromptBuilder：只机械组装 GUI 中可见、可编辑的 messages。

import type { ChatMessage } from '../model-runtime/contracts'
import type { ModelLabConstraintMode } from './model-lab-contracts'

export interface StructuredOutputPromptBuilderInput {
  constraintMode: ModelLabConstraintMode
  systemPrompt: string
  userPrompt: string
  outputContract?: unknown
}

export interface StructuredOutputPromptBuildResult {
  messages: ChatMessage[]
  contractText?: string
}

export class StructuredOutputPromptBuilder {
  build(input: StructuredOutputPromptBuilderInput): StructuredOutputPromptBuildResult {
    const expectedOutputText = stringifyContract(input.outputContract)

    const messages: ChatMessage[] = []
    if (input.systemPrompt.trim()) {
      messages.push({ role: 'system', content: input.systemPrompt.trim() })
    }
    messages.push({ role: 'user', content: input.userPrompt.trim() })

    return {
      messages,
      contractText: expectedOutputText,
    }
  }
}

export function stringifyContract(contract: unknown): string | undefined {
  if (contract === undefined || contract === null || contract === '') return undefined
  if (typeof contract === 'string') return contract
  return JSON.stringify(contract, null, 2)
}
