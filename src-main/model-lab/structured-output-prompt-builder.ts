// src-main/model-lab/structured-output-prompt-builder.ts
// 模型实验请求 PromptBuilder：只机械组装 GUI 中可见、可编辑的 messages。

import type { ChatMessage } from '../model-runtime/contracts'
import type { ModelLabConstraintMode, PromptSlot, PromptSlotChannel } from './model-lab-contracts'

export interface StructuredOutputPromptBuilderInput {
  constraintMode: ModelLabConstraintMode
  promptSlots: PromptSlot[]
  outputContract?: unknown
}

export interface StructuredOutputPromptBuildResult {
  messages: ChatMessage[]
  enabledSlots: PromptSlot[]
  assembledPrompt: string
  contractText?: string
}

export class StructuredOutputPromptBuilder {
  build(input: StructuredOutputPromptBuilderInput): StructuredOutputPromptBuildResult {
    const expectedOutputText = stringifyContract(input.outputContract)
    const enabledSlots = [...input.promptSlots]
      .filter(slot => slot.enabled && slot.content.trim())
      .sort((a, b) => a.order - b.order)

    const messages = buildMessages(enabledSlots)
    const assembledPrompt = enabledSlots
      .map(slot => `## ${slot.title}\n${slot.content.trim()}`)
      .join('\n\n')

    return {
      messages,
      enabledSlots,
      assembledPrompt,
      contractText: expectedOutputText,
    }
  }
}

function buildMessages(slots: PromptSlot[]): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (const channel of promptSlotChannelOrder) {
    const content = slots
      .filter(slot => slot.channel === channel)
      .map(formatSlotContent)
      .join('\n\n')
    if (content) messages.push({ role: channel, content })
  }
  return messages
}

const promptSlotChannelOrder: PromptSlotChannel[] = ['system', 'user', 'assistant', 'tool']

function formatSlotContent(slot: PromptSlot): string {
  return `## ${slot.title}\n${slot.content.trim()}`
}

export function stringifyContract(contract: unknown): string | undefined {
  if (contract === undefined || contract === null || contract === '') return undefined
  if (typeof contract === 'string') return contract
  return JSON.stringify(contract, null, 2)
}
