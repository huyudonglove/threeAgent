// tests/storage/app-path-resolver.test.ts
// AppPathResolver 测试
// 覆盖：默认路径、自定义 baseDir、各路径属性、ensureConfigDir

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// mock electron 模块，避免在测试环境中依赖 electron
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userData'),
  },
}))

import { AppPathResolver } from '../../src-main/storage/app-path-resolver'

describe('AppPathResolver', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-apr-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── 默认路径 ───

  it('默认路径包含 agent-config 子目录', () => {
    const resolver = new AppPathResolver()
    expect(resolver.appConfigDir).toContain('agent-config')
  })

  // ─── 自定义 baseDir 注入 ───

  it('自定义 baseDir 注入正确', () => {
    const resolver = new AppPathResolver({ baseDir: tmpDir })
    expect(resolver.appConfigDir).toBe(tmpDir)
  })

  // ─── 各路径属性 ───

  it('modelConfigPath 返回正确的路径', () => {
    const resolver = new AppPathResolver({ baseDir: tmpDir })
    expect(resolver.modelConfigPath).toBe(path.join(tmpDir, 'model-config.json'))
  })

  it('secretsPath 返回正确的路径', () => {
    const resolver = new AppPathResolver({ baseDir: tmpDir })
    expect(resolver.secretsPath).toBe(path.join(tmpDir, 'secrets.json'))
  })

  it('pluginRegistryPath 返回正确的路径', () => {
    const resolver = new AppPathResolver({ baseDir: tmpDir })
    expect(resolver.pluginRegistryPath).toBe(path.join(tmpDir, 'plugin-registry.json'))
  })

  it('preferencesPath 返回正确的路径', () => {
    const resolver = new AppPathResolver({ baseDir: tmpDir })
    expect(resolver.preferencesPath).toBe(path.join(tmpDir, 'preferences.json'))
  })

  // ─── ensureConfigDir ───

  it('ensureConfigDir 创建目录', async () => {
    const newDir = path.join(tmpDir, 'new-config-dir')
    const resolver = new AppPathResolver({ baseDir: newDir })
    resolver.ensureConfigDir()

    const stat = await fs.stat(newDir)
    expect(stat.isDirectory()).toBe(true)
  })

  it('ensureConfigDir 目录已存在时不报错', async () => {
    const resolver = new AppPathResolver({ baseDir: tmpDir })
    // tmpDir 已存在
    expect(() => resolver.ensureConfigDir()).not.toThrow()
  })
})
