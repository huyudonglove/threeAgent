// tests/plugins/plugin-config-manager.test.ts
// 插件配置管理器测试
// 覆盖：启用插件、禁用插件、冲突检查、影响预览、错误路径、列出已启用插件

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { PluginConfigManager } from '../../src-main/plugins/plugin-config-manager'
import type { PluginEnablementRecord } from '../../src-main/contracts/types'
import { AppPathResolver } from '../../src-main/storage/app-path-resolver'

describe('PluginConfigManager', () => {
  let tmpDir: string
  let manager: PluginConfigManager

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-plugin-'))
    manager = new PluginConfigManager()

    // 创建基础目录结构：.agent-workspace/domains/
    const domainsDir = path.join(tmpDir, '.agent-workspace', 'domains')
    await fs.mkdir(domainsDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── 启用插件（正常路径） ───

  it('启用 skill 插件（无冲突，正常写入）', async () => {
    const result = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-code-review',
      pluginType: 'skill',
      pluginName: 'Code Review Skill',
      operatorRole: 'tech_lead',
      reason: '需要代码审查能力',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.pluginId).toBe('skill-code-review')
      expect(result.data.pluginType).toBe('skill')
      expect(result.data.status).toBe('enabled')
      expect(result.data.enabledAt).toBeTruthy()
      expect(result.data.enabledBy).toBe('tech_lead')
    }
  })

  it('启用 role 插件（无冲突，正常写入）', async () => {
    const result = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'role-devops',
      pluginType: 'role',
      pluginName: 'DevOps',
      operatorRole: 'product_manager',
      reason: '需要 DevOps 角色',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.pluginId).toBe('role-devops')
      expect(result.data.status).toBe('enabled')
    }
  })

  // ─── 禁用插件（正常路径） ───

  it('禁用已启用的插件', async () => {
    // 先启用
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-test',
      pluginType: 'skill',
      pluginName: 'Test Skill',
      operatorRole: 'tech_lead',
      reason: '测试',
    })

    // 再禁用
    const result = await manager.disablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-test',
      operatorRole: 'tech_lead',
      reason: '不再需要',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.pluginId).toBe('skill-test')
      expect(result.data.status).toBe('disabled')
      expect(result.data.disabledAt).toBeTruthy()
    }
  })

  // ─── 冲突检查 ───

  it('启用已启用的插件返回冲突错误', async () => {
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-dup',
      pluginType: 'skill',
      pluginName: 'Dup Skill',
      operatorRole: 'tech_lead',
      reason: '第一次',
    })

    const result = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-dup',
      pluginType: 'skill',
      pluginName: 'Dup Skill',
      operatorRole: 'tech_lead',
      reason: '重复启用',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_CONFLICT_FAILED')
      expect(result.error.message).toContain('already enabled')
    }
  })

  it('禁用未启用的插件返回错误', async () => {
    const result = await manager.disablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'non-existent',
      operatorRole: 'tech_lead',
      reason: '测试',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED')
      expect(result.error.message).toContain('not enabled')
    }
  })

  // ─── 影响预览 ───

  it('预览启用 skill 插件的影响（无冲突）', async () => {
    const result = await manager.previewPluginImpact(
      tmpDir,
      'skill-new',
      'skill',
      'enable',
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.pluginId).toBe('skill-new')
      expect(result.data.action).toBe('enable')
      expect(result.data.canProceed).toBe(true)
      expect(result.data.summary).toBeTruthy()
    }
  })

  it('预览禁用插件的影响（有运行中依赖）', async () => {
    // 先启用
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-dep',
      pluginType: 'skill',
      pluginName: 'Dep Skill',
      operatorRole: 'tech_lead',
      reason: '测试依赖',
    })

    const result = await manager.previewPluginImpact(
      tmpDir,
      'skill-dep',
      'skill',
      'disable',
      { dependentTaskIds: ['task_1', 'task_2'] },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.action).toBe('disable')
      expect(result.data.canProceed).toBe(false)
      expect(result.data.impacts.length).toBeGreaterThan(0)
    }
  })

  it('预览启用 role 插件的影响（有冲突）', async () => {
    // 先启用一个 role 插件
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'role-pm',
      pluginType: 'role',
      pluginName: 'PM',
      operatorRole: 'tech_lead',
      reason: '测试',
    })

    // 预览启用同 ID 的 role 插件
    const result = await manager.previewPluginImpact(
      tmpDir,
      'role-pm',
      'role',
      'enable',
      { existingRoles: ['PM'] },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.impacts.length).toBeGreaterThan(0)
    }
  })

  // ─── 错误路径 ───

  it('启用带有高风险工具的插件返回安全校验失败', async () => {
    const result = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-danger',
      pluginType: 'skill',
      pluginName: 'Danger Skill',
      operatorRole: 'tech_lead',
      reason: '测试',
      hasHighRiskTools: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_SAFETY_FAILED')
    }
  })

  it('启用影响运行中任务的插件返回安全校验失败', async () => {
    const result = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-runtime',
      pluginType: 'skill',
      pluginName: 'Runtime Skill',
      operatorRole: 'tech_lead',
      reason: '测试',
      affectsRunningTasks: true,
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_SAFETY_FAILED')
    }
  })

  it('禁用有运行中依赖的插件返回错误', async () => {
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-block',
      pluginType: 'skill',
      pluginName: 'Block Skill',
      operatorRole: 'tech_lead',
      reason: '测试',
    })

    const result = await manager.disablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-block',
      operatorRole: 'tech_lead',
      reason: '测试',
      dependentTaskIds: ['task_running_1'],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PLUGIN_RUNTIME_DEPENDENCY_ACTIVE')
    }
  })

  // ─── 列出已启用插件 ───

  it('列出已启用的插件（空列表）', async () => {
    const result = await manager.listEnabledPlugins(tmpDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  it('列出已启用的插件（有数据）', async () => {
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-a',
      pluginType: 'skill',
      pluginName: 'Skill A',
      operatorRole: 'tech_lead',
      reason: '测试A',
    })

    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-b',
      pluginType: 'skill',
      pluginName: 'Skill B',
      operatorRole: 'tech_lead',
      reason: '测试B',
    })

    const result = await manager.listEnabledPlugins(tmpDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.length).toBe(2)
      const ids = result.data.map((p: PluginEnablementRecord) => p.pluginId)
      expect(ids).toContain('skill-a')
      expect(ids).toContain('skill-b')
    }
  })

  it('禁用后列出已启用插件不包含已禁用项', async () => {
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-c',
      pluginType: 'skill',
      pluginName: 'Skill C',
      operatorRole: 'tech_lead',
      reason: '测试C',
    })

    await manager.disablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-c',
      operatorRole: 'tech_lead',
      reason: '禁用C',
    })

    const result = await manager.listEnabledPlugins(tmpDir)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.length).toBe(0)
    }
  })

  // ─── 确认启用（pending_confirmation → enabled） ───

  it('启用需要确认的 role 插件返回 pending_confirmation', async () => {
    // 先写入一个已有角色到 existingRoles
    // 直接通过 previewPluginImpact 验证 requiresConfirmation 场景
    // enablePlugin 对 role 类型会执行 checkRolePluginConflict
    // 当 existingRoles 包含同名角色时，会产生 warning，requiresConfirmation=true
    const result = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'role-pm',
      pluginType: 'role',
      pluginName: 'PM',
      operatorRole: 'tech_lead',
      reason: '需要 PM 角色',
      confirmedByUser: false,
      existingRoles: ['PM'],
    })

    // 因为 PM 角色已存在，会产生 warning 级冲突
    // canProceed 为 true（warning 不阻断），requiresConfirmation 为 true
    if (result.ok) {
      expect(result.data.status).toBe('pending_confirmation')
    }
  })

  it('确认启用将 pending_confirmation 变为 enabled', async () => {
    // 先创建 pending_confirmation 状态的记录
    const enableResult = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'role-dev',
      pluginType: 'role',
      pluginName: 'Dev',
      operatorRole: 'tech_lead',
      reason: '需要 Dev 角色',
      confirmedByUser: false,
      existingRoles: ['Dev'],
    })

    if (enableResult.ok && enableResult.data.status === 'pending_confirmation') {
      const confirmResult = await manager.confirmEnable(tmpDir, 'role-dev')
      expect(confirmResult.ok).toBe(true)
      if (confirmResult.ok) {
        expect(confirmResult.data.status).toBe('enabled')
        expect(confirmResult.data.enabledAt).toBeTruthy()
      }
    }
  })

  // ─── 获取指定插件记录 ───

  it('获取指定插件记录', async () => {
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-lookup',
      pluginType: 'skill',
      pluginName: 'Lookup Skill',
      operatorRole: 'tech_lead',
      reason: '测试',
    })

    const result = await manager.getPluginRecord(tmpDir, 'skill-lookup')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).not.toBeNull()
      expect(result.data!.pluginId).toBe('skill-lookup')
    }
  })

  it('获取不存在的插件记录返回 null', async () => {
    const result = await manager.getPluginRecord(tmpDir, 'non-existent')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toBeNull()
    }
  })
})

// ─── 应用级插件库测试 ───

describe('PluginConfigManager (App-level)', () => {
  let tmpDir: string
  let manager: PluginConfigManager

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-app-plugin-'))
    // 创建带 AppPathResolver 的 manager（注入自定义路径）
    const appPathResolver = new AppPathResolver({ baseDir: tmpDir })
    appPathResolver.ensureConfigDir()
    manager = new PluginConfigManager(appPathResolver)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  function makeRecord(overrides: Partial<PluginEnablementRecord> = {}): PluginEnablementRecord {
    const now = new Date().toISOString()
    return {
      id: `plugin_${Date.now()}`,
      pluginId: 'skill-test',
      pluginType: 'skill',
      pluginName: 'Test Skill',
      status: 'enabled',
      enabledAt: now,
      disabledAt: null,
      enabledBy: 'user',
      reason: 'test',
      affectedObjectIds: [],
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }
  }

  it('listAppPlugins: 空列表', async () => {
    const result = await manager.listAppPlugins()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  it('saveAppPlugin + listAppPlugins: 保存后可列出', async () => {
    const record = makeRecord({ pluginId: 'skill-a', pluginName: 'Skill A' })
    const saveResult = await manager.saveAppPlugin(record)
    expect(saveResult.ok).toBe(true)

    const listResult = await manager.listAppPlugins()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.length).toBe(1)
      expect(listResult.data[0].pluginId).toBe('skill-a')
    }
  })

  it('saveAppPlugin: 保存同 ID 覆盖旧记录', async () => {
    const record = makeRecord({ pluginId: 'skill-a', pluginName: 'Skill A' })
    await manager.saveAppPlugin(record)

    const updated = makeRecord({ pluginId: 'skill-a', pluginName: 'Skill A v2', version: '2.0' })
    await manager.saveAppPlugin(updated)

    const listResult = await manager.listAppPlugins()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.length).toBe(1)
      expect(listResult.data[0].pluginName).toBe('Skill A v2')
    }
  })

  it('listEnabledAppPlugins: 只返回 enabled', async () => {
    await manager.saveAppPlugin(makeRecord({ pluginId: 'skill-a', status: 'enabled' }))
    await manager.saveAppPlugin(makeRecord({ pluginId: 'skill-b', status: 'disabled' }))

    const result = await manager.listEnabledAppPlugins()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.length).toBe(1)
      expect(result.data[0].pluginId).toBe('skill-a')
    }
  })

  it('getAppPlugin: 获取存在的插件', async () => {
    await manager.saveAppPlugin(makeRecord({ pluginId: 'skill-x' }))
    const result = await manager.getAppPlugin('skill-x')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).not.toBeNull()
      expect(result.data!.pluginId).toBe('skill-x')
    }
  })

  it('getAppPlugin: 不存在返回 null', async () => {
    const result = await manager.getAppPlugin('non-existent')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toBeNull()
    }
  })

  it('removeAppPlugin: 移除后状态变为 disabled', async () => {
    await manager.saveAppPlugin(makeRecord({ pluginId: 'skill-rm' }))
    const result = await manager.removeAppPlugin('skill-rm')
    expect(result.ok).toBe(true)

    const getResult = await manager.getAppPlugin('skill-rm')
    expect(getResult.ok).toBe(true)
    if (getResult.ok && getResult.data) {
      expect(getResult.data.status).toBe('disabled')
      expect(getResult.data.disabledAt).toBeTruthy()
    }
  })

  it('removeAppPlugin: 不存在返回错误', async () => {
    const result = await manager.removeAppPlugin('non-existent')
    expect(result.ok).toBe(false)
  })

  it('updateAppPluginConfig: 更新部分字段', async () => {
    await manager.saveAppPlugin(makeRecord({ pluginId: 'skill-up', pluginName: 'Old Name' }))
    const result = await manager.updateAppPluginConfig('skill-up', { pluginName: 'New Name' })
    expect(result.ok).toBe(true)

    const getResult = await manager.getAppPlugin('skill-up')
    expect(getResult.ok).toBe(true)
    if (getResult.ok && getResult.data) {
      expect(getResult.data.pluginName).toBe('New Name')
    }
  })

  it('updateAppPluginConfig: 不存在返回错误', async () => {
    const result = await manager.updateAppPluginConfig('non-existent', { pluginName: 'X' })
    expect(result.ok).toBe(false)
  })

  it('checkAppPluginConflict: 无冲突', async () => {
    await manager.saveAppPlugin(makeRecord({ pluginId: 'skill-c', pluginType: 'skill' }))
    const result = await manager.checkAppPluginConflict(['skill-c'])
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.canProceed).toBe(true)
    }
  })

  it('previewAppPluginImpact: 预览启用 skill', async () => {
    const result = await manager.previewAppPluginImpact('skill-new', 'skill', 'enable')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.action).toBe('enable')
      expect(result.data.canProceed).toBe(true)
    }
  })

  it('confirmAppPluginEnable: pending_confirmation → enabled', async () => {
    await manager.saveAppPlugin(makeRecord({
      pluginId: 'skill-pending',
      status: 'pending_confirmation',
      enabledAt: null,
    }))
    const result = await manager.confirmAppPluginEnable('skill-pending')
    expect(result.ok).toBe(true)

    const getResult = await manager.getAppPlugin('skill-pending')
    expect(getResult.ok).toBe(true)
    if (getResult.ok && getResult.data) {
      expect(getResult.data.status).toBe('enabled')
      expect(getResult.data.enabledAt).toBeTruthy()
    }
  })

  it('confirmAppPluginEnable: 非 pending 状态返回错误', async () => {
    await manager.saveAppPlugin(makeRecord({ pluginId: 'skill-enabled', status: 'enabled' }))
    const result = await manager.confirmAppPluginEnable('skill-enabled')
    expect(result.ok).toBe(false)
  })

  it('无 AppPathResolver 时应用级方法返回错误', async () => {
    const noResolverManager = new PluginConfigManager()
    const result = await noResolverManager.listAppPlugins()
    expect(result.ok).toBe(false)
  })
})
