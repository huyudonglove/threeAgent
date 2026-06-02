// tests/model-config/app-model-config.test.ts
// 应用级模型配置测试（ModelConfigManager 的 App 方法）
// 覆盖：readAppConfig、Provider/Model/Binding CRUD、默认设置、密钥、状态、无 AppPathResolver 错误

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ModelConfigManager } from '../../src-main/model-config/model-config-manager'
import { AppPathResolver } from '../../src-main/storage/app-path-resolver'
import { getBuiltinProviderPresets } from '../../src-main/model-config/provider-presets'
import type { ModelProviderConfig, ModelProfileConfig, ModelBindingConfig } from '../../src-main/model-config/contracts'

describe('ModelConfigManager (App-level)', () => {
  let tmpDir: string
  let manager: ModelConfigManager
  let resolver: AppPathResolver

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-app-mc-'))
    resolver = new AppPathResolver({ baseDir: tmpDir })
    resolver.ensureConfigDir()
    manager = new ModelConfigManager(resolver)
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── readAppConfig ───

  it('readAppConfig 空配置返回默认结构', async () => {
    const result = await manager.readAppConfig()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.providers).toEqual([])
      expect(result.data.models).toEqual([])
      expect(result.data.bindings).toEqual([])
    }
  })

  // ─── Provider CRUD ───

  it('addAppProvider + readAppConfig 验证写入', async () => {
    const provider: Omit<ModelProviderConfig, 'createdAt' | 'updatedAt'> = {
      id: 'openai',
      name: 'OpenAI',
      apiBaseUrl: 'https://api.openai.com/v1',
      type: 'openai',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'provider-openai-apiKey' },
      enabled: true,
    }
    const addResult = await manager.addAppProvider(provider)
    expect(addResult.ok).toBe(true)
    if (addResult.ok) {
      expect(addResult.data.id).toBe('openai')
      expect(addResult.data.name).toBe('OpenAI')
      expect(addResult.data.createdAt).toBeTruthy()
      expect(addResult.data.updatedAt).toBeTruthy()
    }

    const readResult = await manager.readAppConfig()
    expect(readResult.ok).toBe(true)
    if (readResult.ok) {
      expect(readResult.data.providers.length).toBe(1)
      expect(readResult.data.providers[0].id).toBe('openai')
    }
  })

  it('addAppProvider 重复 ID 返回错误', async () => {
    const provider: Omit<ModelProviderConfig, 'createdAt' | 'updatedAt'> = {
      id: 'dup-provider',
      name: 'Dup',
      apiBaseUrl: 'https://example.com',
      type: 'custom',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'dup-key' },
      enabled: true,
    }
    await manager.addAppProvider(provider)
    const result = await manager.addAppProvider(provider)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('WS_ALREADY_EXISTS')
    }
  })

  it('updateAppProvider 修改字段', async () => {
    await manager.addAppProvider({
      id: 'provider-up',
      name: 'Old Name',
      apiBaseUrl: 'https://old.example.com',
      type: 'custom',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'old-key' },
      enabled: true,
    })

    const result = await manager.updateAppProvider('provider-up', { name: 'New Name', enabled: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.name).toBe('New Name')
      expect(result.data.enabled).toBe(false)
      expect(result.data.id).toBe('provider-up')  // id 不可覆盖
    }
  })

  it('updateAppProvider 不存在的 Provider 返回错误', async () => {
    const result = await manager.updateAppProvider('non-existent', { name: 'X' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_PROVIDER_NOT_FOUND')
    }
  })

  it('deleteAppProvider 移除并清理关联数据', async () => {
    await manager.addAppProvider({
      id: 'provider-del',
      name: 'To Delete',
      apiBaseUrl: 'https://del.example.com',
      type: 'custom',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'del-key' },
      enabled: true,
    })
    await manager.addAppModel({
      id: 'model-del',
      providerId: 'provider-del',
      modelName: 'gpt-4',
      displayName: 'GPT-4',
      capabilities: ['chat'],
      contextWindow: 8192,
      enabled: true,
    })

    const result = await manager.deleteAppProvider('provider-del')
    expect(result.ok).toBe(true)

    const config = await manager.readAppConfig()
    if (config.ok) {
      expect(config.data.providers.length).toBe(0)
      expect(config.data.models.length).toBe(0)  // 关联 model 也被清理
    }
  })

  // ─── Model CRUD ───

  it('addAppModel 添加模型', async () => {
    const result = await manager.addAppModel({
      id: 'gpt-4o',
      providerId: 'openai',
      modelName: 'gpt-4o',
      displayName: 'GPT-4o',
      capabilities: ['chat', 'completion'],
      contextWindow: 128000,
      enabled: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.id).toBe('gpt-4o')
      expect(result.data.providerId).toBe('openai')
      expect(result.data.createdAt).toBeTruthy()
    }
  })

  it('addAppModel 重复 ID 返回错误', async () => {
    const model: Omit<ModelProfileConfig, 'createdAt' | 'updatedAt'> = {
      id: 'dup-model',
      providerId: 'p1',
      modelName: 'dup',
      displayName: 'Dup Model',
      capabilities: [],
      contextWindow: null,
      enabled: true,
    }
    await manager.addAppModel(model)
    const result = await manager.addAppModel(model)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('WS_ALREADY_EXISTS')
    }
  })

  it('同一服务商可以配置多个不同模型并分别绑定场景', async () => {
    await manager.addAppProvider({
      id: 'mimo',
      name: 'MiMo',
      apiBaseUrl: 'https://token-plan-cn.xiaomimimo.com/v1',
      type: 'openai',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'provider-mimo-apiKey' },
      enabled: true,
    })

    const pro = await manager.addAppModel({
      id: 'model-mimo-pro',
      providerId: 'mimo',
      modelName: 'mimo-v2.5-pro',
      displayName: 'MiMo V2.5 Pro',
      capabilities: ['chat', 'reasoning'],
      contextWindow: 1000000,
      enabled: true,
    })
    const base = await manager.addAppModel({
      id: 'model-mimo-base',
      providerId: 'mimo',
      modelName: 'mimo-v2.5',
      displayName: 'MiMo V2.5',
      capabilities: ['chat', 'reasoning'],
      contextWindow: 1000000,
      enabled: true,
    })

    expect(pro.ok).toBe(true)
    expect(base.ok).toBe(true)

    await manager.addAppBinding({
      id: 'binding-planning',
      role: 'planning',
      modelId: 'model-mimo-pro',
      providerId: 'mimo',
      scope: 'global',
      priority: 1,
      enabled: true,
    })
    await manager.addAppBinding({
      id: 'binding-summary',
      role: 'summary',
      modelId: 'model-mimo-base',
      providerId: 'mimo',
      scope: 'global',
      priority: 1,
      enabled: true,
    })

    const config = await manager.readAppConfig()
    expect(config.ok).toBe(true)
    if (config.ok) {
      expect(config.data.models.filter(m => m.providerId === 'mimo')).toHaveLength(2)
      expect(config.data.bindings.find(b => b.role === 'planning')?.modelId).toBe('model-mimo-pro')
      expect(config.data.bindings.find(b => b.role === 'summary')?.modelId).toBe('model-mimo-base')
    }
  })

  it('MiMo token-plan-cn preset 不推荐 unsupported flash 或 TTS 模型作为普通聊天模型', () => {
    const mimo = getBuiltinProviderPresets().find(p => p.id === 'mimo')
    expect(mimo).toBeTruthy()
    const modelNames = mimo?.recommendedModels.map(model => model.modelName) ?? []

    expect(modelNames).toEqual(['mimo-v2.5-pro', 'mimo-v2.5'])
    expect(modelNames).not.toContain('mimo-v2.5-flash')
    expect(modelNames.some(name => name.includes('-tts'))).toBe(false)
  })

  it('updateAppModel 修改字段', async () => {
    await manager.addAppModel({
      id: 'model-up',
      providerId: 'p1',
      modelName: 'old-name',
      displayName: 'Old Display',
      capabilities: ['chat'],
      contextWindow: 4096,
      enabled: true,
    })

    const result = await manager.updateAppModel('model-up', { displayName: 'New Display', contextWindow: 8192 })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.displayName).toBe('New Display')
      expect(result.data.contextWindow).toBe(8192)
    }
  })

  it('updateAppModel 不存在返回错误', async () => {
    const result = await manager.updateAppModel('non-existent', { displayName: 'X' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_PROFILE_NOT_FOUND')
    }
  })

  it('deleteAppModel 移除并清理关联 Binding', async () => {
    await manager.addAppModel({
      id: 'model-del2',
      providerId: 'p1',
      modelName: 'del',
      displayName: 'Del Model',
      capabilities: [],
      contextWindow: null,
      enabled: true,
    })
    await manager.addAppBinding({
      id: 'binding-for-del',
      role: 'orchestrator',
      modelId: 'model-del2',
      providerId: 'p1',
      scope: 'global',
      priority: 1,
      enabled: true,
    })

    const result = await manager.deleteAppModel('model-del2')
    expect(result.ok).toBe(true)

    const config = await manager.readAppConfig()
    if (config.ok) {
      expect(config.data.models.length).toBe(0)
      expect(config.data.bindings.length).toBe(0)  // 关联 binding 也被清理
    }
  })

  // ─── Binding CRUD ───

  it('addAppBinding 添加绑定', async () => {
    const result = await manager.addAppBinding({
      id: 'binding-1',
      role: 'code',
      modelId: 'gpt-4o',
      providerId: 'openai',
      scope: 'global',
      priority: 1,
      enabled: true,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.id).toBe('binding-1')
      expect(result.data.role).toBe('code')
      expect(result.data.createdAt).toBeTruthy()
    }
  })

  it('updateAppBinding 修改字段', async () => {
    await manager.addAppBinding({
      id: 'binding-up',
      role: 'orchestrator',
      modelId: 'm1',
      providerId: 'p1',
      scope: 'global',
      priority: 1,
      enabled: true,
    })

    const result = await manager.updateAppBinding('binding-up', { priority: 10, enabled: false })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.priority).toBe(10)
      expect(result.data.enabled).toBe(false)
    }
  })

  it('updateAppBinding 不存在返回错误', async () => {
    const result = await manager.updateAppBinding('non-existent', { priority: 5 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_BINDING_NOT_FOUND')
    }
  })

  it('deleteAppBinding 移除绑定', async () => {
    await manager.addAppBinding({
      id: 'binding-del',
      role: 'pm',
      modelId: 'm1',
      providerId: 'p1',
      scope: 'global',
      priority: 1,
      enabled: true,
    })

    const result = await manager.deleteAppBinding('binding-del')
    expect(result.ok).toBe(true)

    const config = await manager.readAppConfig()
    if (config.ok) {
      expect(config.data.bindings.length).toBe(0)
    }
  })

  // ─── 默认设置 ───

  it('setAppDefaultProvider 设置默认 Provider', async () => {
    await manager.addAppProvider({
      id: 'provider-default',
      name: 'Default Provider',
      apiBaseUrl: 'https://default.example.com',
      type: 'openai',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'default-key' },
      enabled: true,
    })

    const result = await manager.setAppDefaultProvider('provider-default')
    expect(result.ok).toBe(true)

    const config = await manager.readAppConfig()
    if (config.ok) {
      expect(config.data.defaultProviderId).toBe('provider-default')
    }
  })

  it('setAppDefaultProvider 不存在返回错误', async () => {
    const result = await manager.setAppDefaultProvider('non-existent')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_PROVIDER_NOT_FOUND')
    }
  })

  it('setAppDefaultModel 设置默认 Model', async () => {
    await manager.addAppModel({
      id: 'model-default',
      providerId: 'p1',
      modelName: 'default-model',
      displayName: 'Default Model',
      capabilities: ['chat'],
      contextWindow: 4096,
      enabled: true,
    })

    const result = await manager.setAppDefaultModel('model-default')
    expect(result.ok).toBe(true)

    const config = await manager.readAppConfig()
    if (config.ok) {
      expect(config.data.defaultModelId).toBe('model-default')
    }
  })

  it('setAppDefaultModel 不存在返回错误', async () => {
    const result = await manager.setAppDefaultModel('non-existent')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MODEL_PROFILE_NOT_FOUND')
    }
  })

  // ─── 密钥 ───

  it('setAppSecret + getAppSecretPreview 设置和预览密钥', async () => {
    const setResult = await manager.setAppSecret('test-key', 'sk-secret123')
    expect(setResult.ok).toBe(true)

    const previewResult = await manager.getAppSecretPreview('test-key')
    expect(previewResult.ok).toBe(true)
    if (previewResult.ok) {
      expect(previewResult.data).toBe('••••••••')
    }
  })

  it('getAppSecretPreview 不存在的 key 返回空字符串', async () => {
    const result = await manager.getAppSecretPreview('non-existent-key')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toBe('')
    }
  })

  it('deleteAppSecret 删除密钥', async () => {
    await manager.setAppSecret('key-to-delete', 'secret-val')
    const result = await manager.deleteAppSecret('key-to-delete')
    expect(result.ok).toBe(true)

    const preview = await manager.getAppSecretPreview('key-to-delete')
    if (preview.ok) {
      expect(preview.data).toBe('')
    }
  })

  it('deleteAppSecret 不存在的 key 不报错', async () => {
    const result = await manager.deleteAppSecret('non-existent')
    expect(result.ok).toBe(true)
  })

  it('listAppSecretKeys 列出密钥 key', async () => {
    await manager.setAppSecret('key-a', 'val-a')
    await manager.setAppSecret('key-b', 'val-b')

    const result = await manager.listAppSecretKeys()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toContain('key-a')
      expect(result.data).toContain('key-b')
    }
  })

  it('listAppSecretKeys 无密钥时返回空数组', async () => {
    const result = await manager.listAppSecretKeys()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toEqual([])
    }
  })

  // ─── 状态 ───

  it('getAppConfigStatus 空配置返回正确状态', async () => {
    const result = await manager.getAppConfigStatus()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.hasProvider).toBe(false)
      expect(result.data.hasModel).toBe(false)
      expect(result.data.hasBinding).toBe(false)
      expect(result.data.defaultProvider).toBeNull()
      expect(result.data.defaultModel).toBeNull()
    }
  })

  it('getAppConfigStatus 有 Provider 时返回 hasProvider: true', async () => {
    await manager.addAppProvider({
      id: 'status-provider',
      name: 'Status Provider',
      apiBaseUrl: 'https://status.example.com',
      type: 'openai',
      apiKeyRef: { type: 'secretRef', store: 'secrets', key: 'status-key' },
      enabled: true,
    })

    const result = await manager.getAppConfigStatus()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.hasProvider).toBe(true)
    }
  })

  // ─── 无 AppPathResolver ───

  it('无 AppPathResolver 时调用 App 方法抛出错误', async () => {
    const noResolverManager = new ModelConfigManager()
    await expect(noResolverManager.readAppConfig()).rejects.toThrow('AppPathResolver not configured')
  })
})
