// tests/integration/workspace-index.test.ts
// T28: 工作区索引集成测试
// 验证：listRecentWorkspaces、saveRecentWorkspace 去重、getWorkspaceStats

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { WorkspaceManager, RecentWorkspaceEntry, WorkspaceStats } from '../../src-main/storage/workspace-manager'
import { JsonStore } from '../../src-main/storage/json-store'

describe('工作区索引集成测试', () => {
  let tmpDir: string
  let userDataDir: string
  let manager: WorkspaceManager

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-ws-index-'))
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-userdata-'))
    manager = new WorkspaceManager({ userDataPath: userDataDir })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    await fs.rm(userDataDir, { recursive: true, force: true })
  })

  // ─── listRecentWorkspaces ───

  it('listRecentWorkspaces 无文件 → 返回空列表', async () => {
    const result = await manager.listRecentWorkspaces()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  it('listRecentWorkspaces 有数据 → 返回列表', async () => {
    // 手动写入 recent-workspaces.json
    const entries: RecentWorkspaceEntry[] = [
      { path: '/path/to/ws1', name: '工作区1', lastOpened: new Date().toISOString() },
      { path: '/path/to/ws2', name: '工作区2', lastOpened: new Date().toISOString() },
    ]
    const filePath = path.join(userDataDir, 'recent-workspaces.json')
    await JsonStore.write(filePath, { entries })

    const result = await manager.listRecentWorkspaces()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.length).toBe(2)
      expect(result.data[0].name).toBe('工作区1')
    }
  })

  // ─── saveRecentWorkspace ───

  it('saveRecentWorkspace → listRecentWorkspaces 验证', async () => {
    // 先创建一个工作区
    const wsDir = path.join(tmpDir, 'my-workspace')
    await manager.initWorkspace(wsDir, '测试工作区')

    const saveResult = await manager.saveRecentWorkspace(wsDir)
    expect(saveResult.ok).toBe(true)

    const listResult = await manager.listRecentWorkspaces()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.length).toBe(1)
      expect(listResult.data[0].path).toBe(wsDir)
      expect(listResult.data[0].name).toBe('测试工作区')
      expect(listResult.data[0].lastOpened).toBeTruthy()
    }
  })

  it('saveRecentWorkspace 去重 → 同路径不重复', async () => {
    // 创建工作区
    const wsDir = path.join(tmpDir, 'dedup-workspace')
    await manager.initWorkspace(wsDir, '去重工作区')

    // 连续保存两次
    await manager.saveRecentWorkspace(wsDir)
    await manager.saveRecentWorkspace(wsDir)

    const listResult = await manager.listRecentWorkspaces()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.length).toBe(1)
      expect(listResult.data[0].path).toBe(wsDir)
    }
  })

  it('saveRecentWorkspace 多个工作区 → 按最近排序', async () => {
    const ws1 = path.join(tmpDir, 'ws1')
    const ws2 = path.join(tmpDir, 'ws2')
    await manager.initWorkspace(ws1, '工作区1')
    await manager.initWorkspace(ws2, '工作区2')

    await manager.saveRecentWorkspace(ws1)
    // 稍微延迟保证时间不同
    await new Promise(r => setTimeout(r, 10))
    await manager.saveRecentWorkspace(ws2)

    const listResult = await manager.listRecentWorkspaces()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.length).toBe(2)
      // 最近保存的排前面
      expect(listResult.data[0].path).toBe(ws2)
      expect(listResult.data[1].path).toBe(ws1)
    }
  })

  it('saveRecentWorkspace 重新保存 → 移到列表头部', async () => {
    const ws1 = path.join(tmpDir, 'ws1')
    const ws2 = path.join(tmpDir, 'ws2')
    await manager.initWorkspace(ws1, '工作区1')
    await manager.initWorkspace(ws2, '工作区2')

    await manager.saveRecentWorkspace(ws1)
    await manager.saveRecentWorkspace(ws2)
    // 重新保存 ws1 → ws1 应回到头部
    await manager.saveRecentWorkspace(ws1)

    const listResult = await manager.listRecentWorkspaces()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.length).toBe(2)
      expect(listResult.data[0].path).toBe(ws1)
    }
  })

  it('saveRecentWorkspace 限制最多 20 条', async () => {
    // 创建 22 个工作区
    for (let i = 0; i < 22; i++) {
      const wsDir = path.join(tmpDir, `ws-${i}`)
      await manager.initWorkspace(wsDir, `工作区${i}`)
      await manager.saveRecentWorkspace(wsDir)
    }

    const listResult = await manager.listRecentWorkspaces()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.length).toBe(20)
    }
  })

  // ─── getWorkspaceStats ───

  it('getWorkspaceStats 返回统计信息', async () => {
    const wsDir = path.join(tmpDir, 'stats-workspace')
    await manager.initWorkspace(wsDir, '统计工作区')

    const result = await manager.getWorkspaceStats(wsDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.conversationCount).toBe(0)
      expect(result.data.taskCount).toBe(0)
      expect(result.data.lastActivityAt).toBeTruthy()
    }
  })

  it('getWorkspaceStats 有会话时统计正确', async () => {
    const wsDir = path.join(tmpDir, 'stats-with-conv')
    await manager.initWorkspace(wsDir, '会话统计工作区')

    // 手动创建会话文件
    const convDir = path.join(wsDir, '.agent-workspace', 'conversations')
    await fs.writeFile(
      path.join(convDir, 'conv-001.json'),
      JSON.stringify({ id: 'conv-001', status: 'active' }),
      'utf-8',
    )
    await fs.writeFile(
      path.join(convDir, 'conv-002.json'),
      JSON.stringify({ id: 'conv-002', status: 'active' }),
      'utf-8',
    )

    const result = await manager.getWorkspaceStats(wsDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.conversationCount).toBe(2)
    }
  })

  it('getWorkspaceStats 不存在的工作区 → 仍返回默认统计', async () => {
    const result = await manager.getWorkspaceStats('/non/existent/path')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.conversationCount).toBe(0)
      expect(result.data.taskCount).toBe(0)
      expect(result.data.lastActivityAt).toBeNull()
    }
  })
})
