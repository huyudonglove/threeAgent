// tests/results/result-persistence-service.test.ts
// 结果沉淀服务测试
// 覆盖：收集并持久化结果、构建结果摘要、获取复用建议、错误路径

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ResultPersistenceService } from '../../src-main/results/result-persistence-service'
import { ResultSummaryBuilder } from '../../src-main/results/result-summary-builder'
import { ReuseSuggestionService } from '../../src-main/results/reuse-suggestion-service'
import type { TaskRuntime, ArtifactIndexEntry } from '../../src-main/contracts/types'
import { JsonStore } from '../../src-main/storage/json-store'

// ─── 测试辅助：构造 TaskRuntime ───

function makeTaskRuntime(overrides: Partial<TaskRuntime> = {}): TaskRuntime {
  return {
    id: 'task_test_001',
    workspaceId: 'ws-001',
    conversationId: 'conv-001',
    title: '测试任务',
    owner: 'tech_lead',
    status: 'running',
    currentNodeName: 'ImplementationNode',
    workflowId: null,
    domainName: 'development',
    blockedReason: null,
    waitingFor: null,
    backflowCount: 0,
    confirmationCount: 0,
    artifactIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

// ─── 测试辅助：构造 ArtifactIndexEntry ───

function makeArtifact(overrides: Partial<ArtifactIndexEntry> = {}): ArtifactIndexEntry {
  return {
    id: 'artifact_001',
    title: '产物1',
    type: 'ProductSpec',
    node: 'PlanningNode',
    taskId: 'task_test_001',
    status: 'draft',
    path: 'artifacts/content/artifact_001.json',
    relatedArtifactIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('ResultSummaryBuilder', () => {
  it('构建 done 状态任务的结果摘要', () => {
    const builder = new ResultSummaryBuilder()
    const task = makeTaskRuntime({ status: 'done' })
    const artifacts = [
      makeArtifact({ status: 'ready', title: '产品设计' }),
      makeArtifact({ id: 'artifact_002', status: 'draft', title: '实现计划', type: 'DevelopmentTaskPlan' }),
    ]

    const summary = builder.buildSummary(task, artifacts)

    expect(summary.taskId).toBe('task_test_001')
    expect(summary.taskTitle).toBe('测试任务')
    expect(summary.status).toBe('done')
    expect(summary.completedScope.length).toBeGreaterThan(0)
    expect(summary.completedScope).toContain('任务整体已完成')
    expect(summary.technicalDebt.length).toBeGreaterThan(0) // draft 产物产生技术债务
    expect(summary.nextSuggestions).toContain('可以将本任务结果沉淀为长期记忆')
    expect(summary.artifactSummaries.length).toBe(2)
    expect(summary.generatedAt).toBeTruthy()
  })

  it('构建 blocked 状态任务的结果摘要', () => {
    const builder = new ResultSummaryBuilder()
    const task = makeTaskRuntime({
      status: 'blocked',
      blockedReason: '等待设计审批',
    })
    const artifacts: ArtifactIndexEntry[] = []

    const summary = builder.buildSummary(task, artifacts)

    expect(summary.unfinishedScope.length).toBeGreaterThan(0)
    expect(summary.unfinishedScope[0]).toContain('阻塞中')
    expect(summary.nextSuggestions).toContain('解决阻塞后重新推进任务')
  })

  it('构建 running 状态任务的结果摘要', () => {
    const builder = new ResultSummaryBuilder()
    const task = makeTaskRuntime({ status: 'running' })
    const artifacts: ArtifactIndexEntry[] = []

    const summary = builder.buildSummary(task, artifacts)

    expect(summary.unfinishedScope).toContain('当前节点: ImplementationNode')
    expect(summary.nextSuggestions).toContain('继续推进当前任务流程')
  })

  it('构建 cancelled 状态任务的结果摘要', () => {
    const builder = new ResultSummaryBuilder()
    const task = makeTaskRuntime({ status: 'cancelled' })
    const artifacts: ArtifactIndexEntry[] = []

    const summary = builder.buildSummary(task, artifacts)

    expect(summary.nextSuggestions).toContain('分析取消原因，考虑回流到合适节点')
  })

  it('草稿产物产生技术债务', () => {
    const builder = new ResultSummaryBuilder()
    const task = makeTaskRuntime({ status: 'running' })
    const artifacts = [
      makeArtifact({ status: 'draft', title: '草稿产物', type: 'TechnicalDesignDocument' }),
    ]

    const summary = builder.buildSummary(task, artifacts)

    expect(summary.technicalDebt.length).toBe(1)
    expect(summary.technicalDebt[0]).toContain('草稿状态')
    expect(summary.nextSuggestions).toContain('有 1 个草稿产物需要完善')
  })
})

describe('ReuseSuggestionService', () => {
  let tmpDir: string
  let service: ReuseSuggestionService

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-reuse-'))
    service = new ReuseSuggestionService()

    // 创建基础目录结构
    const artifactsDir = path.join(tmpDir, '.agent-workspace', 'artifacts')
    await fs.mkdir(artifactsDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('无产物索引时返回空建议', async () => {
    const result = await service.generateReuseSuggestions(tmpDir, 'development', 'task_current')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  it('有可复用产物时返回建议', async () => {
    // 写入产物索引
    const artifacts: ArtifactIndexEntry[] = [
      makeArtifact({
        id: 'artifact_old_1',
        taskId: 'task_other',
        type: 'TechnicalDesignDocument',
        title: '技术设计文档',
        status: 'ready',
      }),
      makeArtifact({
        id: 'artifact_old_2',
        taskId: 'task_other_2',
        type: 'DevelopmentTaskPlan',
        title: '开发任务计划',
        status: 'updated',
      }),
    ]

    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, artifacts)

    const result = await service.generateReuseSuggestions(tmpDir, 'development', 'task_current')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.length).toBeGreaterThan(0)
      // 按相似度排序，高相似度在前
      const highSuggestions = result.data.filter(s => s.similarity === 'high')
      expect(highSuggestions.length).toBeGreaterThan(0)
    }
  })

  it('排除当前任务自身的产物', async () => {
    const currentTaskId = 'task_current'
    const artifacts: ArtifactIndexEntry[] = [
      makeArtifact({
        id: 'artifact_self',
        taskId: currentTaskId,
        type: 'TechnicalDesignDocument',
        title: '自己的文档',
        status: 'ready',
      }),
    ]

    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, artifacts)

    const result = await service.generateReuseSuggestions(tmpDir, 'development', currentTaskId)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  it('排除 draft 状态的产物', async () => {
    const artifacts: ArtifactIndexEntry[] = [
      makeArtifact({
        id: 'artifact_draft',
        taskId: 'task_other',
        type: 'TechnicalDesignDocument',
        title: '草稿文档',
        status: 'draft',
      }),
    ]

    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, artifacts)

    const result = await service.generateReuseSuggestions(tmpDir, 'development', 'task_current')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  it('低相似度产物不返回', async () => {
    const artifacts: ArtifactIndexEntry[] = [
      makeArtifact({
        id: 'artifact_low',
        taskId: 'task_other',
        type: 'SomeUnknownType',
        title: '未知类型产物',
        status: 'ready',
      }),
    ]

    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, artifacts)

    const result = await service.generateReuseSuggestions(tmpDir, 'development', 'task_current')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })
})

describe('ResultPersistenceService', () => {
  let tmpDir: string
  let service: ResultPersistenceService

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-result-'))
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

  // ─── 错误路径 ───

  it('收集并持久化不存在的任务返回错误', async () => {
    const result = await service.collectAndPersist({
      rootPath: tmpDir,
      taskId: 'non_existent_task',
      conversationId: 'conv-001',
      operatorRole: 'tech_lead',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('TASK_NOT_FOUND')
    }
  })

  it('构建不存在任务的结果摘要返回错误', async () => {
    const result = await service.buildResultSummary(tmpDir, 'non_existent_task')
    expect(result.ok).toBe(false)
  })

  it('获取复用建议（无产物索引）', async () => {
    const result = await service.getReuseSuggestions(tmpDir, 'development', 'task_current')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  // ─── 正常路径 ───

  it('收集并持久化已完成的任务', async () => {
    // 准备任务运行态文件
    const task = makeTaskRuntime({ status: 'done' })
    const taskPath = path.join(tmpDir, '.agent-workspace', 'conversations', 'tasks', `${task.id}.json`)
    await JsonStore.write(taskPath, task)

    // 准备 workspace manifest
    const manifestPath = path.join(tmpDir, '.agent-workspace', 'workspace-manifest.json')
    await JsonStore.write(manifestPath, { id: 'ws-001' })

    const result = await service.collectAndPersist({
      rootPath: tmpDir,
      taskId: task.id,
      conversationId: 'conv-001',
      operatorRole: 'tech_lead',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.summary).toBeDefined()
      expect(result.data.summary.taskId).toBe(task.id)
      expect(result.data.summary.status).toBe('done')
      expect(result.data.reuseSuggestions).toBeDefined()
      expect(result.data.taskClosed).toBe(true) // already done
    }
  })

  it('收集并持久化 running 任务后自动关闭', async () => {
    const task = makeTaskRuntime({ status: 'running' })
    const taskPath = path.join(tmpDir, '.agent-workspace', 'conversations', 'tasks', `${task.id}.json`)
    await JsonStore.write(taskPath, task)

    const manifestPath = path.join(tmpDir, '.agent-workspace', 'workspace-manifest.json')
    await JsonStore.write(manifestPath, { id: 'ws-001' })

    const result = await service.collectAndPersist({
      rootPath: tmpDir,
      taskId: task.id,
      conversationId: 'conv-001',
      operatorRole: 'tech_lead',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskClosed).toBe(true)
      expect(result.data.summary.unfinishedScope.length).toBeGreaterThan(0)
    }
  })

  it('构建已有任务的结果摘要', async () => {
    const task = makeTaskRuntime({ status: 'done' })
    const taskPath = path.join(tmpDir, '.agent-workspace', 'conversations', 'tasks', `${task.id}.json`)
    await JsonStore.write(taskPath, task)

    const result = await service.buildResultSummary(tmpDir, task.id)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskId).toBe(task.id)
      expect(result.data.completedScope).toContain('任务整体已完成')
    }
  })

  it('构建有产物关联任务的结果摘要', async () => {
    const task = makeTaskRuntime({ status: 'done' })
    const taskPath = path.join(tmpDir, '.agent-workspace', 'conversations', 'tasks', `${task.id}.json`)
    await JsonStore.write(taskPath, task)

    // 写入产物索引
    const artifacts: ArtifactIndexEntry[] = [
      makeArtifact({
        id: 'artifact_1',
        taskId: task.id,
        type: 'ProductSpec',
        title: '产品规格',
        status: 'ready',
      }),
    ]
    const indexPath = path.join(tmpDir, '.agent-workspace', 'artifacts', 'index.json')
    await JsonStore.write(indexPath, artifacts)

    const result = await service.buildResultSummary(tmpDir, task.id)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.artifactSummaries.length).toBe(1)
      expect(result.data.artifactSummaries[0].artifactType).toBe('ProductSpec')
    }
  })
})
