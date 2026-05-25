// tests/integration/result-persistence.test.ts
// T28: 结果沉淀集成测试
// 验证：listByWorkspace、listByTask、load、load 不存在结果

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ResultPersistenceService } from '../../src-main/results/result-persistence-service'
import { JsonStore } from '../../src-main/storage/json-store'
import type { ArtifactIndexEntry } from '../../src-main/contracts/types'

// ─── 测试辅助 ───

function makeArtifactEntry(overrides: Partial<ArtifactIndexEntry> = {}): ArtifactIndexEntry {
  return {
    id: 'artifact_001',
    title: '结果摘要',
    type: 'ResultSummary',
    node: 'CompletionNode',
    taskId: 'task_001',
    status: 'ready',
    path: 'artifacts/content/artifact_001.json',
    relatedArtifactIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ResultPersistenceService 集成测试', () => {
  let tmpDir: string
  let service: ResultPersistenceService

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-result-int-'))
    service = new ResultPersistenceService()

    // 创建完整目录结构
    const wsDir = path.join(tmpDir, '.agent-workspace')
    const dirs = [
      path.join(wsDir, 'conversations', 'tasks'),
      path.join(wsDir, 'artifacts', 'shared'),
      path.join(wsDir, 'artifacts', 'content'),
      path.join(wsDir, 'agent-memory', 'conversations'),
      path.join(wsDir, 'logs'),
      path.join(wsDir, 'domains'),
    ]
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true })
    }
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── listByWorkspace ───

  it('listByWorkspace 无结果 → 返回空数组', async () => {
    const result = await service.listByWorkspace(tmpDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  it('listByWorkspace 返回工作区所有 ResultSummary 产物', async () => {
    // 写入产物索引（含混合类型）
    const artifacts = [
      makeArtifactEntry({ id: 'rs-1', type: 'ResultSummary', taskId: 'task_001', title: '结果1' }),
      makeArtifactEntry({ id: 'rs-2', type: 'ResultSummary', taskId: 'task_002', title: '结果2' }),
      makeArtifactEntry({ id: 'other-1', type: 'ProductSpec', taskId: 'task_003', title: '非结果产物' }),
    ]
    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, artifacts)

    const result = await service.listByWorkspace(tmpDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.length).toBe(2)
      expect(result.data.every(a => a.type === 'ResultSummary')).toBe(true)
    }
  })

  // ─── listByTask ───

  it('listByTask 按任务过滤结果', async () => {
    const artifacts = [
      makeArtifactEntry({ id: 'rs-task1-1', type: 'ResultSummary', taskId: 'task_001' }),
      makeArtifactEntry({ id: 'rs-task1-2', type: 'ResultSummary', taskId: 'task_001' }),
      makeArtifactEntry({ id: 'rs-task2-1', type: 'ResultSummary', taskId: 'task_002' }),
      makeArtifactEntry({ id: 'ps-task1-1', type: 'ProductSpec', taskId: 'task_001' }),
    ]
    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, artifacts)

    const result = await service.listByTask(tmpDir, 'task_001')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.length).toBe(2)
      expect(result.data.every(a => a.taskId === 'task_001' && a.type === 'ResultSummary')).toBe(true)
    }
  })

  it('listByTask 无匹配 → 返回空数组', async () => {
    const artifacts = [
      makeArtifactEntry({ id: 'rs-1', type: 'ResultSummary', taskId: 'task_001' }),
    ]
    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, artifacts)

    const result = await service.listByTask(tmpDir, 'task_999')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  // ─── load ───

  it('load 加载结果详情（索引 + 正文）', async () => {
    // 写入产物索引
    const summaryContent = {
      taskId: 'task_001',
      taskTitle: '测试任务',
      status: 'done',
      completedScope: ['任务整体已完成'],
      unfinishedScope: [],
      technicalDebt: [],
      nextSuggestions: [],
      artifactSummaries: [],
      generatedAt: new Date().toISOString(),
    }

    const entry = makeArtifactEntry({
      id: 'rs-load-1',
      type: 'ResultSummary',
      taskId: 'task_001',
      path: 'artifacts/content/task_001/rs-load-1.json',
    })

    // 写索引
    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, [entry])

    // 写正文
    const contentDir = path.join(tmpDir, '.agent-workspace', 'artifacts', 'content', 'task_001')
    await fs.mkdir(contentDir, { recursive: true })
    const contentPath = path.join(contentDir, 'rs-load-1.json')
    await fs.writeFile(contentPath, JSON.stringify(summaryContent, null, 2), 'utf-8')

    const result = await service.load(tmpDir, 'rs-load-1')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.index.id).toBe('rs-load-1')
      expect(result.data.content.taskId).toBe('task_001')
      expect(result.data.content.status).toBe('done')
    }
  })

  it('load 不存在的 resultId → 返回错误', async () => {
    // 空索引
    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, [])

    const result = await service.load(tmpDir, 'non-existent-id')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('ARTIFACT_NOT_FOUND')
    }
  })

  it('load 结果正文缺失 → 返回错误', async () => {
    const entry = makeArtifactEntry({
      id: 'rs-no-content',
      type: 'ResultSummary',
      taskId: 'task_001',
      path: 'artifacts/content/task_001/rs-no-content.json',
    })

    // 写索引但不写正文
    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, [entry])

    const result = await service.load(tmpDir, 'rs-no-content')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RESULT_NOT_FOUND')
    }
  })

  it('load 结果正文格式错误 → 返回解析错误', async () => {
    const entry = makeArtifactEntry({
      id: 'rs-bad-json',
      type: 'ResultSummary',
      taskId: 'task_001',
      path: 'artifacts/content/task_001/rs-bad-json.json',
    })

    // 写索引
    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, [entry])

    // 写非法 JSON 正文
    const contentDir = path.join(tmpDir, '.agent-workspace', 'artifacts', 'content', 'task_001')
    await fs.mkdir(contentDir, { recursive: true })
    const contentPath = path.join(contentDir, 'rs-bad-json.json')
    await fs.writeFile(contentPath, 'this is not json{{{', 'utf-8')

    const result = await service.load(tmpDir, 'rs-bad-json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RESULT_PARSE_FAILED')
    }
  })
})
