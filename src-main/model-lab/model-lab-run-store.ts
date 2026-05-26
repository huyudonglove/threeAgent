// src-main/model-lab/model-lab-run-store.ts
// 模型实验运行记录 JSONL 存储

import path from 'node:path'
import { JsonlStore } from '../storage/jsonl-store'
import type { AppPathResolver } from '../storage/app-path-resolver'
import type { Result } from '../errors/result'
import { ok } from '../errors/result'
import type { ModelLabRunRecord } from './model-lab-contracts'

export class ModelLabRunStore {
  constructor(private appPathResolver: AppPathResolver) {}

  async append(record: ModelLabRunRecord): Promise<Result<void>> {
    return JsonlStore.append(this.runsPath, record)
  }

  async list(limit = 100): Promise<Result<ModelLabRunRecord[]>> {
    const result = await JsonlStore.readAll<ModelLabRunRecord>(this.runsPath)
    if (!result.ok) return ok([])
    return ok(result.data.slice(-limit).reverse())
  }

  private get runsPath(): string {
    return path.join(this.appPathResolver.appConfigDir, 'model-lab', 'runs.jsonl')
  }
}
