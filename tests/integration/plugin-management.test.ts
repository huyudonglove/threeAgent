// tests/integration/plugin-management.test.ts
// T28: 插件管理闭环集成测试
// 验证：启用/禁用闭环、冲突检测、影响预览

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { PluginConfigManager } from '../../src-main/plugins/plugin-config-manager'
import { checkWorkflowPluginConflict, checkRolePluginConflict, checkDisableConflict } from '../../src-main/plugins/plugin-conflict-check'
import { previewEnableImpact, previewDisableImpact } from '../../src-main/plugins/plugin-impact-preview'
import type { DomainWorkflowDefinition, PluginEnablementRecord } from '../../src-main/contracts/types'
import { JsonStore } from '../../src-main/storage/json-store'

// ─── 测试辅助 ───

function makeWorkflow(overrides: Partial<DomainWorkflowDefinition> = {}): DomainWorkflowDefinition {
  return {
    id: 'wf-custom-1',
    name: '自定义工作流',
    taskDomain: 'custom-domain',
    version: '1.0.0',
    status: 'custom',
    nodes: [],
    roleBindings: [],
    skillBindings: [],
    ...overrides,
  }
}

function makeEnabledPlugin(overrides: Partial<PluginEnablementRecord> = {}): PluginEnablementRecord {
  return {
    id: `plugin_${Date.now()}`,
    pluginId: 'test-plugin-1',
    pluginType: 'workflow',
    pluginName: '测试插件',
    status: 'enabled',
    domain: 'custom-domain',
    version: '1.0.0',
    enabledAt: new Date().toISOString(),
    disabledAt: null,
    enabledBy: 'tech_lead',
    reason: '测试启用',
    affectedObjectIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('插件管理闭环', () => {
  let tmpDir: string
  let manager: PluginConfigManager

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-plugin-'))
    manager = new PluginConfigManager()

    // 创建目录结构
    const wsDir = path.join(tmpDir, '.agent-workspace')
    await fs.mkdir(path.join(wsDir, 'domains'), { recursive: true })
    await fs.mkdir(path.join(wsDir, 'conversations'), { recursive: true })
    await fs.mkdir(path.join(wsDir, 'logs'), { recursive: true })

    // 写入 manifest
    const manifestPath = path.join(wsDir, 'workspace-manifest.json')
    await JsonStore.write(manifestPath, { id: 'ws-test' })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── 启用闭环 ───

  it('enablePlugin → listAllPlugins 可见', async () => {
    const enableResult = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'wf-research',
      pluginType: 'workflow',
      pluginName: '研究工作流',
      domain: 'research',
      version: '1.0.0',
      operatorRole: 'tech_lead',
      reason: '需要研究工作流',
    })

    expect(enableResult.ok).toBe(true)
    if (enableResult.ok) {
      expect(enableResult.data.pluginId).toBe('wf-research')
      expect(enableResult.data.status).toBe('enabled')
    }

    // listAll 验证
    const listResult = await manager.listAllPlugins(tmpDir)
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      const found = listResult.data.find(p => p.pluginId === 'wf-research')
      expect(found).toBeDefined()
      expect(found!.status).toBe('enabled')
    }
  })

  it('启用 skill 插件 → 无冲突直接启用', async () => {
    const result = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'skill-code-review',
      pluginType: 'skill',
      pluginName: '代码审查技能',
      operatorRole: 'tech_lead',
      reason: '新增审查能力',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.status).toBe('enabled')
    }
  })

  it('重复启用同一插件 → 返回错误', async () => {
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'wf-dup',
      pluginType: 'skill',
      pluginName: '重复插件',
      operatorRole: 'tech_lead',
      reason: '首次',
    })

    const dupResult = await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'wf-dup',
      pluginType: 'skill',
      pluginName: '重复插件',
      operatorRole: 'tech_lead',
      reason: '重复',
    })

    expect(dupResult.ok).toBe(false)
    if (!dupResult.ok) {
      expect(dupResult.error.code).toBe('VALIDATION_CONFLICT_FAILED')
    }
  })

  // ─── 禁用闭环 ───

  it('disablePlugin → listEnabledPlugins 移除', async () => {
    // 先启用
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'wf-disable-test',
      pluginType: 'skill',
      pluginName: '待禁用插件',
      operatorRole: 'tech_lead',
      reason: '临时启用',
    })

    // 禁用
    const disableResult = await manager.disablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'wf-disable-test',
      operatorRole: 'tech_lead',
      reason: '不再需要',
    })

    expect(disableResult.ok).toBe(true)
    if (disableResult.ok) {
      expect(disableResult.data.status).toBe('disabled')
      expect(disableResult.data.disabledAt).toBeTruthy()
    }

    // listEnabledPlugins 不应包含
    const listResult = await manager.listEnabledPlugins(tmpDir)
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      const found = listResult.data.find(p => p.pluginId === 'wf-disable-test')
      expect(found).toBeUndefined()
    }

    // listAllPlugins 仍可见（disabled 状态）
    const allResult = await manager.listAllPlugins(tmpDir)
    expect(allResult.ok).toBe(true)
    if (allResult.ok) {
      const found = allResult.data.find(p => p.pluginId === 'wf-disable-test')
      expect(found).toBeDefined()
      expect(found!.status).toBe('disabled')
    }
  })

  it('禁用不存在的插件 → 返回错误', async () => {
    const result = await manager.disablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'non-existent',
      operatorRole: 'tech_lead',
      reason: '测试',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_FAILED')
    }
  })

  it('禁用有运行中依赖的插件 → 返回错误', async () => {
    // 先启用
    await manager.enablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'wf-with-deps',
      pluginType: 'skill',
      pluginName: '有依赖插件',
      operatorRole: 'tech_lead',
      reason: '测试',
    })

    const result = await manager.disablePlugin({
      workspaceRootPath: tmpDir,
      pluginId: 'wf-with-deps',
      operatorRole: 'tech_lead',
      reason: '有依赖',
      dependentTaskIds: ['task_001', 'task_002'],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('PLUGIN_RUNTIME_DEPENDENCY_ACTIVE')
    }
  })
})

describe('插件冲突检查', () => {
  it('workflow 域冲突检测 → canProceed 仍为 true（warning 不阻断）', () => {
    const newWorkflow = makeWorkflow({ taskDomain: 'research' })
    const existingWorkflows = [makeWorkflow({ id: 'wf-existing', taskDomain: 'research', status: 'builtin' })]
    const enabledPlugins = [makeEnabledPlugin({ pluginId: 'wf-existing', pluginType: 'workflow', domain: 'research' })]

    const result = checkWorkflowPluginConflict(newWorkflow, existingWorkflows, enabledPlugins)

    expect(result.impacts.length).toBeGreaterThan(0)
    expect(result.requiresConfirmation).toBe(true)
    // warning 不阻断
    expect(result.canProceed).toBe(true)
  })

  it('无冲突 workflow → canProceed 为 true', () => {
    const newWorkflow = makeWorkflow({ taskDomain: 'brand-new-domain' })
    const result = checkWorkflowPluginConflict(newWorkflow, [], [])

    expect(result.canProceed).toBe(true)
    expect(result.impacts.length).toBe(0)
  })

  it('角色冲突检测 → 已有同名角色产生 warning', () => {
    const result = checkRolePluginConflict('tech_lead', ['tech_lead'], [])

    expect(result.impacts.length).toBeGreaterThan(0)
    expect(result.impacts[0].impactType).toBe('overridden')
    expect(result.impacts[0].severity).toBe('warning')
    expect(result.requiresConfirmation).toBe(true)
  })

  it('禁用冲突检测 → 运行中依赖产生 error', () => {
    const result = checkDisableConflict('test-plugin', 'workflow', ['task_001'], [])

    expect(result.canProceed).toBe(false)
    const errorImpact = result.impacts.find(i => i.severity === 'error')
    expect(errorImpact).toBeDefined()
    expect(errorImpact!.impactType).toBe('removed')
  })

  it('禁用冲突检测 → 其他插件依赖产生 warning', () => {
    const enabledPlugins = [
      makeEnabledPlugin({
        pluginId: 'dependent-plugin',
        pluginType: 'skill',
        pluginName: '依赖插件',
        affectedObjectIds: ['target-plugin'],
      }),
    ]

    const result = checkDisableConflict('target-plugin', 'workflow', [], enabledPlugins)

    const warnImpact = result.impacts.find(i => i.severity === 'warning')
    expect(warnImpact).toBeDefined()
    expect(warnImpact!.impactType).toBe('conflicted')
    expect(result.requiresConfirmation).toBe(true)
  })
})

describe('插件影响预览', () => {
  it('previewEnableImpact workflow 类型 → 返回预览结果', () => {
    const workflow = makeWorkflow({ taskDomain: 'test-domain' })
    const result = previewEnableImpact('wf-1', 'workflow', '测试工作流', {
      workflow,
      existingWorkflows: [],
      enabledPlugins: [],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.pluginId).toBe('wf-1')
      expect(result.data.action).toBe('enable')
      expect(result.data.canProceed).toBe(true)
    }
  })

  it('previewEnableImpact role 类型 → 检测角色冲突', () => {
    const result = previewEnableImpact('role-1', 'role', 'tech_lead', {
      existingRoles: ['tech_lead'],
      enabledPlugins: [],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.requiresConfirmation).toBe(true)
      expect(result.data.impacts.length).toBeGreaterThan(0)
    }
  })

  it('previewEnableImpact skill 类型 → 无冲突', () => {
    const result = previewEnableImpact('skill-1', 'skill', '代码审查', {
      enabledPlugins: [],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.canProceed).toBe(true)
      expect(result.data.impacts.length).toBe(0)
    }
  })

  it('previewDisableImpact 有运行中依赖 → canProceed 为 false', () => {
    const result = previewDisableImpact('wf-1', 'workflow', '测试工作流', {
      dependentTaskIds: ['task_001'],
      enabledPlugins: [],
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.canProceed).toBe(false)
      expect(result.data.action).toBe('disable')
    }
  })
})
