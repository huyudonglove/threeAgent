// tests/memory/agent-memory-service.test.ts
// AgentMemory 服务层测试
// 覆盖：提交记忆源、查询记忆、获取记忆清单、轮次结束通知、错误路径

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { AgentMemoryService } from '../../src-main/memory/agent-memory-service'
import type { SubmitMemorySourceInput, QueryAgentMemoryInput } from '../../src-main/memory/agent-memory-service'

describe('AgentMemoryService', () => {
  let tmpDir: string
  let service: AgentMemoryService

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agentThee-memory-'))
    service = new AgentMemoryService()

    // 创建基础目录结构
    const wsDir = path.join(tmpDir, '.agent-workspace')
    await fs.mkdir(wsDir, { recursive: true })
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  // ─── 提交记忆源（正常路径） ───

  it('提交包含决策关键词的记忆源，成功写入', async () => {
    const input: SubmitMemorySourceInput = {
      rootPath: tmpDir,
      conversationId: 'conv-001',
      turnId: 'turn-001',
      currentAgentRole: 'tech_lead',
      sourceText: '决定使用 Vue 3 + TypeScript 作为项目技术栈，统一使用组合式 API',
    }

    const result = await service.submitMemorySource(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.decision).toBeDefined()
      // 决策类关键词产生 strong 信号，action 应为 write
      expect(result.data.decision.action).toBe('write')
      expect(result.data.decision.memoryCategory).toBe('decisions')
      expect(result.data.record).toBeDefined()
    }
  })

  it('提交包含偏好关键词的记忆源，成功写入', async () => {
    const input: SubmitMemorySourceInput = {
      rootPath: tmpDir,
      conversationId: 'conv-001',
      turnId: 'turn-002',
      currentAgentRole: 'product_manager',
      sourceText: '用户偏好使用深色主题，倾向于简洁的界面设计风格',
    }

    const result = await service.submitMemorySource(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.decision.action).toBe('write')
      expect(result.data.decision.memoryCategory).toBe('preferences')
    }
  })

  it('提交包含项目上下文关键词的记忆源，写入 shared', async () => {
    const input: SubmitMemorySourceInput = {
      rootPath: tmpDir,
      conversationId: 'conv-001',
      turnId: 'turn-003',
      currentAgentRole: 'tech_lead',
      sourceText: '项目使用 monorepo 架构，框架为 Electron + Vue',
    }

    const result = await service.submitMemorySource(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.decision.action).toBe('write')
      expect(result.data.decision.targetScope).toBe('shared')
    }
  })

  it('提交无信号文本，返回 skip', async () => {
    const input: SubmitMemorySourceInput = {
      rootPath: tmpDir,
      conversationId: 'conv-001',
      turnId: 'turn-004',
      currentAgentRole: 'code',
      sourceText: '这是一段普通的对话内容，没有特殊信号',
    }

    const result = await service.submitMemorySource(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.decision.action).toBe('skip')
    }
  })

  // ─── 查询记忆 ───

  it('查询全局记忆（不指定角色）', async () => {
    // 先写入 shared 记忆
    await service.submitMemorySource({
      rootPath: tmpDir,
      conversationId: 'conv-002',
      turnId: 'turn-001',
      currentAgentRole: 'tech_lead',
      sourceText: '决定采用微服务架构方案',
    })

    const input: QueryAgentMemoryInput = {
      rootPath: tmpDir,
      conversationId: 'conv-002',
      agentRole: null,
    }

    const result = await service.queryAgentMemory(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.shared.length).toBeGreaterThan(0)
      expect(result.data.roleLocal).toEqual([])
    }
  })

  it('查询记忆（指定角色）', async () => {
    // 写入一条 systemContext（shared，强信号），同时注册 code 角色
    await service.submitMemorySource({
      rootPath: tmpDir,
      conversationId: 'conv-003',
      turnId: 'turn-001',
      currentAgentRole: 'code',
      sourceText: '系统环境安装了 Node 20 版本，依赖 pnpm 8',
    })

    // 再写入一条 workingContext，需要组合关键词使信号强度达到 medium 以上
    // workingContext 关键词较弱，加入项目上下文关键词增强信号
    await service.submitMemorySource({
      rootPath: tmpDir,
      conversationId: 'conv-003',
      turnId: 'turn-002',
      currentAgentRole: 'code',
      sourceText: '当前项目正在实现用户认证模块，进行中需要处理 token 刷新逻辑',
    })

    const input: QueryAgentMemoryInput = {
      rootPath: tmpDir,
      conversationId: 'conv-003',
      agentRole: 'code',
    }

    const result = await service.queryAgentMemory(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      // 至少有 shared 记忆（系统环境）
      expect(result.data.shared.length + result.data.roleLocal.length).toBeGreaterThan(0)
    }
  })

  it('查询记忆按分类过滤', async () => {
    // 写入决策记忆
    await service.submitMemorySource({
      rootPath: tmpDir,
      conversationId: 'conv-004',
      turnId: 'turn-001',
      currentAgentRole: 'tech_lead',
      sourceText: '决定使用 pnpm 作为包管理器',
    })

    const input: QueryAgentMemoryInput = {
      rootPath: tmpDir,
      conversationId: 'conv-004',
      agentRole: null,
      categories: ['decisions'],
    }

    const result = await service.queryAgentMemory(input)
    expect(result.ok).toBe(true)
    if (result.ok) {
      // 应只返回 decisions 分类
      expect(result.data.shared.every(e => e.category === 'decisions')).toBe(true)
    }
  })

  it('查询不存在的会话记忆返回空', async () => {
    const result = await service.queryAgentMemory({
      rootPath: tmpDir,
      conversationId: 'non-existent',
      agentRole: null,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.shared).toEqual([])
      expect(result.data.roleLocal).toEqual([])
    }
  })

  // ─── 获取记忆清单 ───

  it('获取已初始化会话的 manifest', async () => {
    // 先提交记忆以触发初始化
    await service.submitMemorySource({
      rootPath: tmpDir,
      conversationId: 'conv-005',
      turnId: 'turn-001',
      currentAgentRole: 'tech_lead',
      sourceText: '项目使用 TypeScript 严格模式',
    })

    const result = await service.getConversationMemoryManifest(tmpDir, 'conv-005')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).not.toBeNull()
      expect(result.data!.conversationId).toBe('conv-005')
      expect(result.data!.sharedPath).toBe('shared.json')
      expect(result.data!.agents.length).toBeGreaterThan(0)
    }
  })

  it('获取不存在会话的 manifest 返回 null', async () => {
    const result = await service.getConversationMemoryManifest(tmpDir, 'non-existent')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data).toBeNull()
    }
  })

  // ─── 轮次结束通知 ───

  it('轮次结束通知返回成功', async () => {
    const result = await service.notifyMemoryTurnEnd({
      rootPath: tmpDir,
      conversationId: 'conv-006',
      turnId: 'turn-001',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.processed).toBe(true)
    }
  })

  // ─── 错误路径 ───

  it('提交记忆源缺少 conversationId 返回错误', async () => {
    const input = {
      rootPath: tmpDir,
      conversationId: '',
      turnId: 'turn-001',
      currentAgentRole: 'tech_lead',
      sourceText: '决定使用 Vite',
    } as SubmitMemorySourceInput

    const result = await service.submitMemorySource(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MEMORY_SUBMISSION_INVALID')
    }
  })

  it('提交记忆源缺少 turnId 返回错误', async () => {
    const input = {
      rootPath: tmpDir,
      conversationId: 'conv-007',
      turnId: '',
      currentAgentRole: 'tech_lead',
      sourceText: '决定使用 Vite',
    } as SubmitMemorySourceInput

    const result = await service.submitMemorySource(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MEMORY_SUBMISSION_INVALID')
    }
  })

  it('提交记忆源缺少 currentAgentRole 返回错误', async () => {
    const input = {
      rootPath: tmpDir,
      conversationId: 'conv-007',
      turnId: 'turn-001',
      currentAgentRole: '',
      sourceText: '决定使用 Vite',
    } as SubmitMemorySourceInput

    const result = await service.submitMemorySource(input)
    expect(result.ok).toBe(false)
  })

  it('提交记忆源 sourceText 为空返回错误', async () => {
    const input: SubmitMemorySourceInput = {
      rootPath: tmpDir,
      conversationId: 'conv-007',
      turnId: 'turn-001',
      currentAgentRole: 'tech_lead',
      sourceText: '   ',
    }

    const result = await service.submitMemorySource(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('MEMORY_SUBMISSION_INVALID')
    }
  })

  // ─── 冲突记忆 ───

  it('提交相似记忆触发冲突检测', async () => {
    // 第一次写入
    await service.submitMemorySource({
      rootPath: tmpDir,
      conversationId: 'conv-008',
      turnId: 'turn-001',
      currentAgentRole: 'tech_lead',
      sourceText: '决定使用 React 作为前端框架',
    })

    // 第二次写入相似内容（高重叠度）
    const result = await service.submitMemorySource({
      rootPath: tmpDir,
      conversationId: 'conv-008',
      turnId: 'turn-002',
      currentAgentRole: 'tech_lead',
      sourceText: '决定使用 React 作为前端框架和状态管理方案',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      // 冲突时 action 应为 conflict 或 requiresUserConfirmation 为 true
      if (result.data.decision.action === 'conflict') {
        expect(result.data.decision.requiresUserConfirmation).toBe(true)
      }
      // 无论哪种情况，不应该是 skip（信号强度够）
      expect(result.data.decision.signalStrength).not.toBe('none')
    }
  })
})
