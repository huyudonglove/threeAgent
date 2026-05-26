// src-main/model-lab/prompt-template-store.ts
// 模型实验提示词模板存储

import path from 'node:path'
import { JsonStore } from '../storage/json-store'
import type { AppPathResolver } from '../storage/app-path-resolver'
import type { Result } from '../errors/result'
import { ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'
import type { PromptTemplateRecord } from './model-lab-contracts'

export class PromptTemplateStore {
  constructor(private appPathResolver: AppPathResolver) {}

  async list(): Promise<Result<PromptTemplateRecord[]>> {
    const result = await JsonStore.read<PromptTemplateRecord[]>(this.templatesPath)
    if (!result.ok) return ok([])
    return ok(result.data)
  }

  async save(input: Omit<PromptTemplateRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<Result<PromptTemplateRecord>> {
    const listResult = await this.list()
    if (!listResult.ok) return listResult as Result<never>

    const now = new Date().toISOString()
    const templates = listResult.data
    const id = input.id ?? `tmpl_${Date.now()}`
    const existingIndex = templates.findIndex(template => template.id === id)
    const record: PromptTemplateRecord = {
      ...input,
      id,
      createdAt: existingIndex >= 0 ? templates[existingIndex].createdAt : now,
      updatedAt: now,
    }

    if (existingIndex >= 0) {
      templates[existingIndex] = record
    } else {
      templates.push(record)
    }

    const writeResult = await JsonStore.write(this.templatesPath, templates)
    if (!writeResult.ok) {
      return err(createError('STORAGE_WRITE_FAILED', 'model-lab',
        `Failed to save prompt template "${record.name}"`, {
          recoverable: true,
          detail: writeResult.error,
        }))
    }

    return ok(record)
  }

  async delete(id: string): Promise<Result<{ deleted: boolean; id: string }>> {
    const listResult = await this.list()
    if (!listResult.ok) return listResult as Result<never>

    const templates = listResult.data
    const nextTemplates = templates.filter(template => template.id !== id)
    if (nextTemplates.length === templates.length) {
      return err(createError('STORAGE_WRITE_FAILED', 'model-lab',
        `Prompt template "${id}" was not found.`, {
          recoverable: true,
        }))
    }

    const writeResult = await JsonStore.write(this.templatesPath, nextTemplates)
    if (!writeResult.ok) {
      return err(createError('STORAGE_WRITE_FAILED', 'model-lab',
        `Failed to delete prompt template "${id}"`, {
          recoverable: true,
          detail: writeResult.error,
        }))
    }

    return ok({ deleted: true, id })
  }

  private get templatesPath(): string {
    return path.join(this.appPathResolver.appConfigDir, 'model-lab', 'prompt-templates.json')
  }
}
