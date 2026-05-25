// tests/storage/config-migration.test.ts
// 配置迁移服务测试
// 覆盖：跳过迁移、成功迁移、无工作区、插件格式转换、密钥迁移、重复执行

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ConfigMigrationService } from '../../src-main/storage/config-migration'
import { AppPathResolver } from '../../src-main/storage/app-path-resolver'
import { WorkspaceManager } from '../../src-main/storage/workspace-manager'
import { JsonStore } from '../../src-main/storage/json-store'
import type { RecentWorkspaceEntry } from '../../src-main/storage/workspace-manager'

describe('ConfigMigrationService', () => {
  let tmpDir: string
  let appDir: string
  let resolver: AppPathResolver
  let recentWorkspacesPath: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-migration-'))
    appDir = path.join(tmpDir, 'app-config')
    await fs.mkdir(appDir, { recursive: true })
    resolver = new AppPathResolver({ baseDir: appDir })
    resolver.ensureConfigDir()

    // recent-workspaces.json 存放路径
    recentWorkspacesPath = path.join(tmpDir, 'recent-workspaces.json')
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  /**
   * 创建 mock WorkspaceManager，使用本地文件系统存储
   */
  function createWorkspaceManager(): WorkspaceManager {
    // WorkspaceManager 使用 app.getPath('userData')，这里通过注入 indexPath 来绕过
    // 但 WorkspaceManager.recentWorkspacesPath 也用了 app.getPath('userData')
    // 所以需要 mock electron 模块
    return new WorkspaceManager({ indexPath: path.join(tmpDir, 'workspace-index.json') })
  }

  /**
   * 写入最近工作区列表
   */
  async function writeRecentWorkspaces(entries: RecentWorkspaceEntry[]): Promise<void> {
    await JsonStore.write(recentWorkspacesPath, { entries })
  }

  /**
   * 创建 mock WorkspaceManager（替换 listRecentWorkspaces）
   */
  function createMockWorkspaceManager(entries: RecentWorkspaceEntry[]): WorkspaceManager {
    const wm = createWorkspaceManager()
    // 在测试中直接写入最近工作区文件
    // WorkspaceManager.listRecentWorkspaces 读取 app.getPath('userData')/recent-workspaces.json
    // 我们通过 mock electron 来让它读到我们的临时目录
    return wm
  }

  // ─── 应用级配置已存在 → 跳过迁移 ───

  it('应用级模型配置已存在 → 跳过模型迁移', async () => {
    // 写入已有应用级配置
    await JsonStore.write(resolver.modelConfigPath, {
      providers: [{ id: 'existing', name: 'Existing' }],
      models: [],
      bindings: [],
    })
    // 同时写入已有应用级插件库，避免插件迁移报错
    await JsonStore.write(resolver.pluginRegistryPath, {
      installedPlugins: [{ pluginId: 'existing-plugin' }],
      lastModifiedAt: new Date().toISOString(),
    })

    const wm = createWorkspaceManager()
    const service = new ConfigMigrationService(resolver, wm)
    const result = await service.migrate()

    expect(result.modelConfigMigrated).toBe(false)
    expect(result.pluginConfigMigrated).toBe(false)
    expect(result.errors.length).toBe(0)
  })

  it('应用级插件配置已存在 → 跳过插件迁移', async () => {
    // 写入已有应用级插件库
    await JsonStore.write(resolver.pluginRegistryPath, {
      installedPlugins: [{ pluginId: 'existing-plugin' }],
      lastModifiedAt: new Date().toISOString(),
    })
    // 同时写入已有应用级模型配置，避免模型迁移报错
    await JsonStore.write(resolver.modelConfigPath, {
      providers: [{ id: 'existing' }],
      models: [],
      bindings: [],
    })

    const wm = createWorkspaceManager()
    const service = new ConfigMigrationService(resolver, wm)
    const result = await service.migrate()

    expect(result.pluginConfigMigrated).toBe(false)
    expect(result.modelConfigMigrated).toBe(false)
    expect(result.errors.length).toBe(0)
  })

  // ─── 应用级配置不存在 + 工作区有旧配置 → 成功迁移 ───

  it('应用级模型配置不存在 + 工作区有旧配置 → 成功迁移', async () => {
    // 创建旧工作区目录和配置
    const wsDir = path.join(tmpDir, 'old-ws')
    const modelConfigDir = path.join(wsDir, '.agent-workspace', 'model-config')
    await fs.mkdir(modelConfigDir, { recursive: true })

    const oldConfig = {
      providers: [{ id: 'openai', name: 'OpenAI', apiBaseUrl: 'https://api.openai.com', type: 'openai', apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'k1' }, enabled: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      models: [],
      bindings: [],
    }
    await JsonStore.write(path.join(modelConfigDir, 'global-config.json'), oldConfig)

    // 写入最近工作区列表
    await writeRecentWorkspaces([{ path: wsDir, name: 'old-ws', lastOpened: new Date().toISOString() }])

    // 使用 mock WorkspaceManager
    const wm = createMockWorkspaceManager([
      { path: wsDir, name: 'old-ws', lastOpened: new Date().toISOString() },
    ])
    // 因为 WorkspaceManager.listRecentWorkspaces 依赖 electron，我们需要直接注入
    // 替代方案：直接创建 ConfigMigrationService 的子类或修改 workspaceManager 的行为
    // 最简方案：直接在测试中 mock listRecentWorkspaces
    const origListRecent = wm.listRecentWorkspaces.bind(wm)
    wm.listRecentWorkspaces = async () => ({
      ok: true as const,
      data: [{ path: wsDir, name: 'old-ws', lastOpened: new Date().toISOString() }],
    })

    const service = new ConfigMigrationService(resolver, wm)
    const result = await service.migrate()

    expect(result.modelConfigMigrated).toBe(true)

    // 验证应用级配置内容
    const readResult = await JsonStore.read(resolver.modelConfigPath)
    expect(readResult.ok).toBe(true)
    if (readResult.ok) {
      expect(readResult.data.providers.length).toBe(1)
      expect(readResult.data.providers[0].id).toBe('openai')
    }
  })

  // ─── 应用级配置不存在 + 无工作区 → 返回未迁移 ───

  it('无最近工作区 → 返回未迁移', async () => {
    const wm = createWorkspaceManager()
    wm.listRecentWorkspaces = async () => ({ ok: true as const, data: [] })

    const service = new ConfigMigrationService(resolver, wm)
    const result = await service.migrate()

    expect(result.modelConfigMigrated).toBe(false)
    expect(result.pluginConfigMigrated).toBe(false)
  })

  // ─── 插件配置格式转换（enabledPlugins → installedPlugins） ───

  it('插件配置格式转换 enabledPlugins → installedPlugins', async () => {
    const wsDir = path.join(tmpDir, 'ws-plugin')
    const domainsDir = path.join(wsDir, '.agent-workspace', 'domains')
    await fs.mkdir(domainsDir, { recursive: true })

    const oldPluginConfig = {
      workspaceId: 'ws-001',
      enabledPlugins: [
        { pluginId: 'skill-a', pluginType: 'skill', pluginName: 'Skill A', status: 'enabled' },
        { pluginId: 'skill-b', pluginType: 'skill', pluginName: 'Skill B', status: 'disabled' },
      ],
      lastModifiedAt: new Date().toISOString(),
    }
    await JsonStore.write(path.join(domainsDir, 'plugin-config.json'), oldPluginConfig)

    const wm = createWorkspaceManager()
    wm.listRecentWorkspaces = async () => ({
      ok: true as const,
      data: [{ path: wsDir, name: 'ws-plugin', lastOpened: new Date().toISOString() }],
    })

    const service = new ConfigMigrationService(resolver, wm)
    const result = await service.migrate()

    expect(result.pluginConfigMigrated).toBe(true)

    // 验证格式转换
    const readResult = await JsonStore.read(resolver.pluginRegistryPath)
    expect(readResult.ok).toBe(true)
    if (readResult.ok) {
      expect(readResult.data.installedPlugins.length).toBe(2)
      expect(readResult.data.installedPlugins[0].pluginId).toBe('skill-a')
    }
  })

  // ─── 密钥文件同步迁移 ───

  it('密钥文件同步迁移', async () => {
    const wsDir = path.join(tmpDir, 'ws-secrets')
    const modelConfigDir = path.join(wsDir, '.agent-workspace', 'model-config')
    await fs.mkdir(modelConfigDir, { recursive: true })

    // 写入旧模型配置
    await JsonStore.write(path.join(modelConfigDir, 'global-config.json'), {
      providers: [{ id: 'p1', name: 'P1' }],
      models: [],
      bindings: [],
    })

    // 写入旧密钥文件
    await JsonStore.write(path.join(modelConfigDir, 'secrets.json'), {
      'provider-p1-apiKey': 'sk-old-secret-key',
    })

    const wm = createWorkspaceManager()
    wm.listRecentWorkspaces = async () => ({
      ok: true as const,
      data: [{ path: wsDir, name: 'ws-secrets', lastOpened: new Date().toISOString() }],
    })

    const service = new ConfigMigrationService(resolver, wm)
    const result = await service.migrate()

    expect(result.modelConfigMigrated).toBe(true)

    // 验证密钥已迁移
    const secretsResult = await JsonStore.read<Record<string, string>>(resolver.secretsPath)
    expect(secretsResult.ok).toBe(true)
    if (secretsResult.ok) {
      expect(secretsResult.data['provider-p1-apiKey']).toBe('sk-old-secret-key')
    }
  })

  // ─── 重复执行不重复导入 ───

  it('重复执行不重复导入', async () => {
    const wsDir = path.join(tmpDir, 'ws-idempotent')
    const modelConfigDir = path.join(wsDir, '.agent-workspace', 'model-config')
    await fs.mkdir(modelConfigDir, { recursive: true })

    await JsonStore.write(path.join(modelConfigDir, 'global-config.json'), {
      providers: [{ id: 'p1', name: 'P1' }],
      models: [],
      bindings: [],
    })

    const wm = createWorkspaceManager()
    wm.listRecentWorkspaces = async () => ({
      ok: true as const,
      data: [{ path: wsDir, name: 'ws-idempotent', lastOpened: new Date().toISOString() }],
    })

    const service = new ConfigMigrationService(resolver, wm)

    // 第一次迁移
    const result1 = await service.migrate()
    expect(result1.modelConfigMigrated).toBe(true)

    // 第二次迁移 → 应跳过（应用级配置已存在）
    const result2 = await service.migrate()
    expect(result2.modelConfigMigrated).toBe(false)

    // 验证数据只有一份
    const readResult = await JsonStore.read(resolver.modelConfigPath)
    expect(readResult.ok).toBe(true)
    if (readResult.ok) {
      expect(readResult.data.providers.length).toBe(1)
    }
  })
})
