// tests/integration/app-level-access.test.ts
// 应用级访问集成测试
// 覆盖：无工作区时应用级方法可用、配置后状态正确

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ModelConfigManager } from '../../src-main/model-config/model-config-manager'
import { PluginConfigManager } from '../../src-main/plugins/plugin-config-manager'
import { AppPathResolver } from '../../src-main/storage/app-path-resolver'
import type { PluginEnablementRecord } from '../../src-main/contracts/types'

describe('App-level access integration', () => {
  let tmpDir: string
  let resolver: AppPathResolver
  let modelManager: ModelConfigManager
  let pluginManager: PluginConfigManager

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-app-int-'))
    resolver = new AppPathResolver({ baseDir: tmpDir })
    resolver.ensureConfigDir()
    modelManager = new ModelConfigManager(resolver)
    pluginManager = new PluginConfigManager(resolver)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── 无工作区时 ModelConfigManager 应用级方法可正常工作 ───

  it('无工作区时 readAppConfig 正常工作', async () => {
    const result = await modelManager.readAppConfig()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.providers).toEqual([])
      expect(result.data.models).toEqual([])
      expect(result.data.bindings).toEqual([])
    }
  })

  it('无工作区时 addAppProvider 正常工作', async () => {
    const result = await modelManager.addAppProvider({
      id: 'int-provider',
      name: 'Integration Provider',
      apiBaseUrl: 'https://int.example.com',
      type: 'openai',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'int-key' },
      enabled: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.id).toBe('int-provider')
    }
  })

  it('无工作区时 addAppModel 正常工作', async () => {
    const result = await modelManager.addAppModel({
      id: 'int-model',
      providerId: 'int-provider',
      modelName: 'int-model',
      displayName: 'Integration Model',
      capabilities: ['chat'],
      contextWindow: 4096,
      enabled: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.id).toBe('int-model')
    }
  })

  // ─── 无工作区时 PluginConfigManager 应用级方法可正常工作 ───

  it('无工作区时 listAppPlugins 正常工作', async () => {
    const result = await pluginManager.listAppPlugins()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  it('无工作区时 saveAppPlugin 正常工作', async () => {
    const now = new Date().toISOString()
    const record: PluginEnablementRecord = {
      id: `plugin_${Date.now()}`,
      pluginId: 'int-plugin',
      pluginType: 'skill',
      pluginName: 'Integration Plugin',
      status: 'enabled',
      enabledAt: now,
      disabledAt: null,
      enabledBy: 'user',
      reason: 'integration test',
      affectedObjectIds: [],
      createdAt: now,
      updatedAt: now,
    }

    const result = await pluginManager.saveAppPlugin(record)
    expect(result.ok).toBe(true)

    // 验证保存后可读取
    const listResult = await pluginManager.listAppPlugins()
    expect(listResult.ok).toBe(true)
    if (listResult.ok) {
      expect(listResult.data.length).toBe(1)
      expect(listResult.data[0].pluginId).toBe('int-plugin')
    }
  })

  // ─── 配置应用级模型后 getAppConfigStatus 返回 hasProvider: true ───

  it('配置应用级模型后 getAppConfigStatus 返回 hasProvider: true', async () => {
    // 初始状态
    const statusBefore = await modelManager.getAppConfigStatus()
    expect(statusBefore.ok).toBe(true)
    if (statusBefore.ok) {
      expect(statusBefore.data.hasProvider).toBe(false)
    }

    // 添加 Provider
    await modelManager.addAppProvider({
      id: 'status-provider',
      name: 'Status Provider',
      apiBaseUrl: 'https://status.example.com',
      type: 'openai',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'status-key' },
      enabled: true,
    })

    // 验证状态
    const statusAfter = await modelManager.getAppConfigStatus()
    expect(statusAfter.ok).toBe(true)
    if (statusAfter.ok) {
      expect(statusAfter.data.hasProvider).toBe(true)
      expect(statusAfter.data.hasModel).toBe(false)
      expect(statusAfter.data.hasBinding).toBe(false)
    }
  })

  it('完整配置后 getAppConfigStatus 返回正确状态', async () => {
    // 添加 Provider
    await modelManager.addAppProvider({
      id: 'full-provider',
      name: 'Full Provider',
      apiBaseUrl: 'https://full.example.com',
      type: 'openai',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'full-key' },
      enabled: true,
    })

    // 添加 Model
    await modelManager.addAppModel({
      id: 'full-model',
      providerId: 'full-provider',
      modelName: 'full-model',
      displayName: 'Full Model',
      capabilities: ['chat'],
      contextWindow: 8192,
      enabled: true,
    })

    // 添加 Binding
    await modelManager.addAppBinding({
      id: 'full-binding',
      role: 'code',
      modelId: 'full-model',
      providerId: 'full-provider',
      scope: 'global',
      priority: 1,
      enabled: true,
    })

    // 设置默认
    await modelManager.setAppDefaultProvider('full-provider')
    await modelManager.setAppDefaultModel('full-model')

    const status = await modelManager.getAppConfigStatus()
    expect(status.ok).toBe(true)
    if (status.ok) {
      expect(status.data.hasProvider).toBe(true)
      expect(status.data.hasModel).toBe(true)
      expect(status.data.hasBinding).toBe(true)
      expect(status.data.defaultProvider).toBe('full-provider')
      expect(status.data.defaultModel).toBe('full-model')
      expect(status.data.defaultProviderName).toBe('Full Provider')
      expect(status.data.defaultModelName).toBe('Full Model')
    }
  })

  it('ModelConfigManager 和 PluginConfigManager 可同时使用同一 AppPathResolver', async () => {
    // 同时操作模型和插件配置
    await modelManager.addAppProvider({
      id: 'dual-provider',
      name: 'Dual Provider',
      apiBaseUrl: 'https://dual.example.com',
      type: 'custom',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'dual-key' },
      enabled: true,
    })

    const now = new Date().toISOString()
    await pluginManager.saveAppPlugin({
      id: `plugin_${Date.now()}`,
      pluginId: 'dual-plugin',
      pluginType: 'skill',
      pluginName: 'Dual Plugin',
      status: 'enabled',
      enabledAt: now,
      disabledAt: null,
      enabledBy: 'user',
      reason: 'dual test',
      affectedObjectIds: [],
      createdAt: now,
      updatedAt: now,
    })

    // 验证两者独立正常
    const modelConfig = await modelManager.readAppConfig()
    expect(modelConfig.ok).toBe(true)
    if (modelConfig.ok) {
      expect(modelConfig.data.providers.length).toBe(1)
    }

    const pluginList = await pluginManager.listAppPlugins()
    expect(pluginList.ok).toBe(true)
    if (pluginList.ok) {
      expect(pluginList.data.length).toBe(1)
    }
  })
})
