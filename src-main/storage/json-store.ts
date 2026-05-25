// src-main/storage/json-store.ts
// JSON 文件原子读写（write-to-temp + rename）

import fs from 'node:fs/promises'
import path from 'node:path'
import { Result, ok, err } from '../errors/result'
import { fromStorageError } from '../errors/from-storage'

export class JsonStore {
  /**
   * 读取 JSON 文件，解析并返回
   */
  static async read<T>(filePath: string): Promise<Result<T>> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8')
      const data = JSON.parse(raw) as T
      return ok(data)
    } catch (e) {
      return err(fromStorageError(e, 'storage'))
    }
  }

  /**
   * 原子写入 JSON 文件：先写临时文件，再 rename
   */
  static async write<T>(filePath: string, data: T): Promise<Result<void>> {
    try {
      const dir = path.dirname(filePath)
      await fs.mkdir(dir, { recursive: true })
      const tmpPath = filePath + '.tmp'
      const raw = JSON.stringify(data, null, 2) + '\n'
      await fs.writeFile(tmpPath, raw, 'utf-8')
      await fs.rename(tmpPath, filePath)
      return ok(undefined)
    } catch (e) {
      return err(fromStorageError(e, 'storage'))
    }
  }

  /**
   * 检查文件是否存在
   */
  static async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * 删除文件
   */
  static async delete(filePath: string): Promise<Result<void>> {
    try {
      await fs.unlink(filePath)
      return ok(undefined)
    } catch (e) {
      return err(fromStorageError(e, 'storage'))
    }
  }
}
