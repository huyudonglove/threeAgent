// tests/integration/artifact-panel.test.ts
// T19a: 产物面板检查
// 验证：产物创建、索引、状态迁移、类型注册等可观察

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ArtifactService } from '../../src-main/artifacts/artifact-service'
import { ArtifactTypeRegistry, createBuiltinArtifactTypeRegistry } from '../../src-main/artifacts/artifact-type-registry'
import type { ArtifactIndexEntry } from '../../src-main/contracts/types'

describe('产物面板检查', () => {
  let tmpDir: string
  let artifactService: ArtifactService
  let typeRegistry: ArtifactTypeRegistry

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-artifact-'))
    typeRegistry = createBuiltinArtifactTypeRegistry()
    artifactService = new ArtifactService(typeRegistry)

    // 创建基础目录结构
    const wsDir = path.join(tmpDir, 'workspace')
    await fs.mkdir(wsDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('内置产物类型全量可枚举', () => {
    const names = typeRegistry.listTypeNames()
    expect(names.length).toBeGreaterThanOrEqual(10)

    // 关键产物类型存在
    expect(names).toContain('ProductSpec')
    expect(names).toContain('TechnicalDesignDocument')
    expect(names).toContain('DevelopmentTaskPlan')
    expect(names).toContain('ImplementationSummary')
    expect(names).toContain('AcceptanceResult')
    expect(names).toContain('SelfCheckResult')
    expect(names).toContain('ResultSummary')
    expect(names).toContain('ChangeImpactAnalysis')
  })

  it('按分类筛选产物类型', () => {
    const planning = typeRegistry.listByCategory('PlanningSpec')
    expect(planning.length).toBeGreaterThan(0)

    const execution = typeRegistry.listByCategory('ExecutionPlan')
    expect(execution.length).toBeGreaterThan(0)

    const evidence = typeRegistry.listByCategory('RuntimeEvidence')
    expect(evidence.length).toBeGreaterThan(0)
  })

  it('创建产物 → 索引可查', async () => {
    const wsRoot = path.join(tmpDir, 'workspace')
    await fs.mkdir(path.join(wsRoot, 'artifacts', 'shared'), { recursive: true })
    await fs.mkdir(path.join(wsRoot, 'logs'), { recursive: true })

    const result = await artifactService.createArtifact({
      workspaceRootPath: wsRoot,
      conversationId: 'conv_test',
      taskId: 'task_test',
      artifactType: 'ProductSpec',
      title: '产品说明书v1',
      format: 'markdown',
      content: '# 产品说明书\n\n## 目标\n实现Agent工作台',
      createdByRole: 'product_manager',
      createdFromNode: 'ProjectKickoffPlanning',
    })

    expect(result.ok).toBe(true)
    const entry = (result as { ok: true; data: ArtifactIndexEntry }).data
    expect(entry.id).toBeTruthy()
    expect(entry.type).toBe('ProductSpec')
    expect(entry.status).toBe('draft')
  })

  it('产物状态迁移 draft → ready → updated', async () => {
    const wsRoot = path.join(tmpDir, 'workspace')
    await fs.mkdir(path.join(wsRoot, 'artifacts', 'shared'), { recursive: true })
    await fs.mkdir(path.join(wsRoot, 'logs'), { recursive: true })

    const createResult = await artifactService.createArtifact({
      workspaceRootPath: wsRoot,
      taskId: 'task_test2',
      artifactType: 'ImplementationSummary',
      title: '实现总结',
      format: 'json',
      content: '{"scope": "all"}',
      createdByRole: 'code',
    })

    expect(createResult.ok).toBe(true)
    const entry = (createResult as any).data

    // draft → ready
    const readyResult = await artifactService.updateArtifactStatus(wsRoot, entry.id, 'ready')
    expect(readyResult.ok).toBe(true)
    expect((readyResult as any).data.status).toBe('ready')

    // ready → updated
    const updatedResult = await artifactService.updateArtifactStatus(wsRoot, entry.id, 'updated')
    expect(updatedResult.ok).toBe(true)
    expect((updatedResult as any).data.status).toBe('updated')
  })

  it('未注册产物类型创建失败', async () => {
    const wsRoot = path.join(tmpDir, 'workspace')
    await fs.mkdir(path.join(wsRoot, 'artifacts', 'shared'), { recursive: true })
    await fs.mkdir(path.join(wsRoot, 'logs'), { recursive: true })

    const result = await artifactService.createArtifact({
      workspaceRootPath: wsRoot,
      taskId: 'task_test3',
      artifactType: 'UnknownArtifactType',
      title: '未知类型',
      format: 'markdown',
      content: 'test',
      createdByRole: 'code',
    })

    expect(result.ok).toBe(false)
  })

  it('按任务列出产物', async () => {
    const wsRoot = path.join(tmpDir, 'workspace')
    await fs.mkdir(path.join(wsRoot, 'artifacts', 'shared'), { recursive: true })
    await fs.mkdir(path.join(wsRoot, 'logs'), { recursive: true })

    const taskId = 'task_list_test'

    await artifactService.createArtifact({
      workspaceRootPath: wsRoot,
      taskId,
      artifactType: 'ProductSpec',
      title: '产物1',
      format: 'json',
      content: '{}',
      createdByRole: 'product_manager',
    })

    await artifactService.createArtifact({
      workspaceRootPath: wsRoot,
      taskId,
      artifactType: 'TechnicalDesignDocument',
      title: '产物2',
      format: 'markdown',
      content: '# 设计',
      createdByRole: 'tech_lead',
    })

    const listResult = await artifactService.listArtifactsByTask(wsRoot, taskId)
    expect(listResult.ok).toBe(true)
    expect((listResult as any).data.length).toBe(2)
  })
})
