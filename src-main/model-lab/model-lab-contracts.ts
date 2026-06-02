// src-main/model-lab/model-lab-contracts.ts
// 模型输出实验面板的数据契约

import type { ModelStreamEvent, ToolChoice, ToolDefinition } from '../model-runtime/contracts'
import type { UnifiedError } from '../errors/unified-error'

export type ModelLabMode = 'blocking' | 'stream'
export type ModelLabConstraintMode = 'loose_text' | 'prompt_json' | 'api_json' | 'legacy_text'
export type PromptSlotType =
  | 'task'
  | 'output_schema'
  | 'skill'
  | 'agent'
  | 'tool'
  | 'constraint'
  | 'example'
  | 'memory'
  | 'custom'
export type PromptSlotSource = 'manual' | 'built_in' | 'saved_template' | 'generated'
export type PromptSlotChannel = 'system' | 'user' | 'assistant' | 'tool'

export interface PromptSlot {
  id: string
  type: PromptSlotType
  title: string
  enabled: boolean
  order: number
  content: string
  source: PromptSlotSource
  channel: PromptSlotChannel
}

export interface ModelLabParams {
  temperature?: number
  top_p?: number
  max_tokens?: number
  timeout_ms?: number
  retry_count?: number
  reasoning_effort?: string
  seed?: number | null
  presence_penalty?: number
  frequency_penalty?: number
  stop?: string[]
  tool_calling?: boolean
  tool_choice?: ToolChoice
  enabled_tools?: string[]
  native_web_search?: boolean
  custom_tools?: ModelLabToolDefinition[]
  provider_specific?: ModelLabProviderSpecificParams
}

export interface ModelLabProviderSpecificParams {
  thinkingType?: 'default' | 'enabled' | 'disabled'
}

export interface ModelLabToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  mockResult?: unknown
  builtin?: boolean
}

export interface ModelLabRequestPreview {
  messages: Array<{ role: string; content: string; name?: string }>
  promptSlots: PromptSlot[]
  assembledPrompt: string
  params: Record<string, unknown>
  responseFormat?: 'json_object' | 'legacy_text'
  tools?: ToolDefinition[]
  toolChoice?: ToolChoice
  providerSpecific?: Record<string, unknown>
  inactiveParams?: string[]
  constraintSources: string[]
  finalRequestJson: Record<string, unknown>
}

export interface ModelLabInputSnapshot {
  providerId?: string
  modelId?: string
  mode: ModelLabMode
  constraintMode: ModelLabConstraintMode
  promptSlots: PromptSlot[]
  params: ModelLabParams
}

export interface ModelLabInvokeInput {
  providerId?: string
  modelId?: string
  mode: ModelLabMode
  constraintMode: ModelLabConstraintMode
  promptSlots: PromptSlot[]
  outputContract?: unknown
  params?: ModelLabParams
  persistRun?: boolean
}

export interface ModelLabStreamEvent {
  index: number
  timestamp: string
  event: ModelStreamEvent
}

export interface ModelLabValidationResult {
  jsonParseOk: boolean
  jsonObjectOk: boolean
  schemaOk: boolean
  missingFields: string[]
  extraFields: string[]
  typeMismatches: Array<{
    path: string
    expected: string
    actual: string
  }>
  parseError?: string | null
}

export interface ModelLabMetrics {
  latencyMs: number
  firstTokenMs?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  estimatedCost?: number | null
  finishReason?: string | null
}

export interface ModelLabInvokeResult {
  runId: string
  rawOutput: string
  parsedJson?: unknown
  toolCalls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
    mockResult?: unknown
  }>
  validation: ModelLabValidationResult
  streamEvents?: ModelLabStreamEvent[]
  metrics: ModelLabMetrics
  requestPreview?: ModelLabRequestPreview
  inputSnapshot?: ModelLabInputSnapshot
  error?: UnifiedError | null
  warnings?: string[]
}

export interface ModelLabParameterSweepInput {
  baseInput: ModelLabInvokeInput
  temperatures?: number[]
  topPs?: number[]
  constraintModes?: ModelLabConstraintMode[]
  streamModes?: boolean[]
  seeds?: Array<number | null>
}

export interface ModelLabParameterSweepResult {
  runId: string
  results: ModelLabInvokeResult[]
}

export interface ModelLabConsistencyInput {
  input: ModelLabInvokeInput
  runCount: number
  fixedSeed?: boolean
  stopOnFirstFailure?: boolean
  delayMs?: number
}

export interface ModelLabConsistencySummary {
  jsonParseSuccessRate: number
  schemaSuccessRate: number
  averageLatencyMs: number
  averageTotalTokens: number | null
  fieldStabilityScore: number
  contentDriftSummary: string
}

export interface ModelLabConsistencyResult {
  runId: string
  results: ModelLabInvokeResult[]
  summary: ModelLabConsistencySummary
}

export interface PromptTemplateRecord {
  id: string
  name: string
  scenario: 'task_understanding' | 'research' | 'implementation' | 'review' | 'custom'
  promptSlots: PromptSlot[]
  outputContract: unknown
  responseFormat: 'json_object' | 'legacy_text'
  defaultParams: ModelLabParams
  status: 'draft' | 'candidate' | 'approved'
  createdAt: string
  updatedAt: string
}

export interface ModelLabRunRecord extends ModelLabInvokeResult {
  providerId?: string
  modelId?: string
  mode: ModelLabMode
  constraintMode: ModelLabConstraintMode
  params: ModelLabParams
  createdAt: string
}
