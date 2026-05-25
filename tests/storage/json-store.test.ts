// tests/storage/json-store.test.ts
// T19: 存储层基础测试
// 验证：JSON 文件读写、目录自动创建、文件不存在时行为、JSONL 追加写入

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { JsonStore } from '../../src-main/storage/json-store'
import { JsonlStore } from '../../src-main/storage/jsonl-store'

describe('JsonStore 基础存储', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-json-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('JSON 文件写入和读取', async () => {
    const filePath = path.join(tmpDir, 'data.json')
    const data = { id: 'test-001', name: '测试对象', value: 42 }

    const writeResult = await JsonStore.write(filePath, data)
    expect(writeResult.ok).toBe(true)

    const readResult = await JsonStore.read<typeof data>(filePath)
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(readResult.data.id).toBe('test-001')
    expect(readResult.data.name).toBe('测试对象')
    expect(readResult.data.value).toBe(42)
  })

  it('路径不存在时自动创建目录', async () => {
    const deepPath = path.join(tmpDir, 'a', 'b', 'c', 'deep.json')
    const data = { nested: true }

    const writeResult = await JsonStore.write(deepPath, data)
    expect(writeResult.ok).toBe(true)

    const readResult = await JsonStore.read<typeof data>(deepPath)
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(readResult.data.nested).toBe(true)
  })

  it('文件不存在时 read 返回错误', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.json')

    const readResult = await JsonStore.read(filePath)
    expect(readResult.ok).toBe(false)
  })

  it('覆盖写入同一文件', async () => {
    const filePath = path.join(tmpDir, 'overwrite.json')

    await JsonStore.write(filePath, { version: 1 })
    await JsonStore.write(filePath, { version: 2 })

    const readResult = await JsonStore.read<{ version: number }>(filePath)
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(readResult.data.version).toBe(2)
  })

  it('exists 检查文件是否存在', async () => {
    const filePath = path.join(tmpDir, 'check.json')

    expect(await JsonStore.exists(filePath)).toBe(false)

    await JsonStore.write(filePath, { exists: true })

    expect(await JsonStore.exists(filePath)).toBe(true)
  })

  it('delete 删除文件', async () => {
    const filePath = path.join(tmpDir, 'to-delete.json')
    await JsonStore.write(filePath, { delete: true })

    expect(await JsonStore.exists(filePath)).toBe(true)

    const deleteResult = await JsonStore.delete(filePath)
    expect(deleteResult.ok).toBe(true)
    expect(await JsonStore.exists(filePath)).toBe(false)
  })

  it('写入复杂嵌套结构', async () => {
    const filePath = path.join(tmpDir, 'complex.json')
    const data = {
      users: [
        { id: 1, name: 'Alice', tags: ['admin', 'dev'] },
        { id: 2, name: 'Bob', tags: ['dev'] },
      ],
      meta: {
        count: 2,
        createdAt: new Date().toISOString(),
        nested: { deep: { value: null } },
      },
    }

    await JsonStore.write(filePath, data)
    const readResult = await JsonStore.read<typeof data>(filePath)
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(readResult.data.users.length).toBe(2)
    expect(readResult.data.users[0].tags).toContain('admin')
    expect(readResult.data.meta.nested.deep.value).toBeNull()
  })
})

describe('JsonlStore 追加写入', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-jsonl-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('JSONL 追加写入和全量读取', async () => {
    const filePath = path.join(tmpDir, 'records.jsonl')

    await JsonlStore.append(filePath, { seq: 1, msg: 'first' })
    await JsonlStore.append(filePath, { seq: 2, msg: 'second' })
    await JsonlStore.append(filePath, { seq: 3, msg: 'third' })

    const readResult = await JsonlStore.readAll<{ seq: number; msg: string }>(filePath)
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(readResult.data.length).toBe(3)
    expect(readResult.data[0].seq).toBe(1)
    expect(readResult.data[2].msg).toBe('third')
  })

  it('JSONL 路径不存在时自动创建目录', async () => {
    const deepPath = path.join(tmpDir, 'deep', 'nested', 'records.jsonl')

    const appendResult = await JsonlStore.append(deepPath, { auto: true })
    expect(appendResult.ok).toBe(true)

    const readResult = await JsonlStore.readAll<{ auto: boolean }>(deepPath)
    expect(readResult.ok).toBe(true)
    if (!readResult.ok) return
    expect(readResult.data.length).toBe(1)
    expect(readResult.data[0].auto).toBe(true)
  })

  it('JSONL readLast 读取最后 N 条记录', async () => {
    const filePath = path.join(tmpDir, 'last.jsonl')

    for (let i = 1; i <= 10; i++) {
      await JsonlStore.append(filePath, { index: i })
    }

    const last3 = await JsonlStore.readLast<{ index: number }>(filePath, 3)
    expect(last3.ok).toBe(true)
    if (!last3.ok) return
    expect(last3.data.length).toBe(3)
    expect(last3.data[0].index).toBe(8)
    expect(last3.data[1].index).toBe(9)
    expect(last3.data[2].index).toBe(10)
  })

  it('JSONL 文件不存在时 readAll 返回错误', async () => {
    const filePath = path.join(tmpDir, 'nonexistent.jsonl')

    const readResult = await JsonlStore.readAll(filePath)
    expect(readResult.ok).toBe(false)
  })

  it('JSONL 多次追加保持顺序', async () => {
    const filePath = path.join(tmpDir, 'order.jsonl')
    const entries = ['alpha', 'beta', 'gamma', 'delta']

    for (const entry of entries) {
      await JsonlStore.append(filePath, { name: entry })
    }

    const result = await JsonlStore.readAll<{ name: string }>(filePath)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const names = result.data.map(d => d.name)
    expect(names).toEqual(entries)
  })
})
