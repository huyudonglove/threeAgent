// src-main/storage/jsonl-store.ts
// JSONL 追加写入（用于 trace 和 memory records）

import fs from 'node:fs/promises'
import path from 'node:path'
import { Result, ok, err } from '../errors/result'
import { fromStorageError } from '../errors/from-storage'

export class JsonlStore {
  /**
   * 向 JSONL 文件追加一条记录
   */
  static async append<T>(filePath: string, record: T): Promise<Result<void>> {
    try {
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      const line = JSON.stringify(record) + '\n'
      await fs.appendFile(filePath, line, 'utf-8')
      return ok(undefined)
    } catch (e) {
      return err(fromStorageError(e, 'storage'))
    }
  }

  /**
   * 读取 JSONL 文件的所有记录
   */
  static async readAll<T>(filePath: string): Promise<Result<T[]>> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const lines = raw.split('\n').filter((line) => line.trim().length > 0)
      const records = lines.map((line) => JSON.parse(line) as T)
      return ok(records)
    } catch (e) {
      return err(fromStorageError(e, 'storage'))
    }
  }

  /**
   * 读取 JSONL 文件的最后 N 条记录
   */
  static async readLast<T>(filePath: string, count: number): Promise<Result<T[]>> {
    const result = await this.readAll<T>(filePath)
    if (!result.ok) return result
    return ok(result.data.slice(-count))
  }
}
