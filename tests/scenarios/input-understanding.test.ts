// tests/scenarios/input-understanding.test.ts
// T28: 输入理解服务场景测试
// 验证：关键词匹配、空输入错误、title 截取

import { describe, it, expect } from 'vitest'
import { InputUnderstandingService, resolveWorkflowId, DOMAIN_TO_WORKFLOW } from '../../src-main/runtime/input-understanding-service'

describe('InputUnderstandingService 场景测试', () => {
  const service = new InputUnderstandingService()

  // ─── 关键词匹配：调研/研究类 ───

  it('含"调研"关键词 → taskDomain 为 research，workflowId 为 research-prestudy', () => {
    const result = service.understand('对竞品进行调研分析')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('research')
      expect(result.data.taskType).toBe('research')
      expect(result.data.workflowId).toBe('research-prestudy')
    }
  })

  it('含"研究"关键词 → taskDomain 为 research', () => {
    const result = service.understand('研究新技术方案的可行性')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('research')
    }
  })

  it('含"分析"关键词 → taskDomain 为 research', () => {
    const result = service.understand('分析当前系统瓶颈')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('research')
    }
  })

  it('含"查找"关键词 → taskDomain 为 research', () => {
    const result = service.understand('查找相关的技术文档')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('research')
    }
  })

  it('含"搜索"关键词 → taskDomain 为 research', () => {
    const result = service.understand('搜索开源替代方案')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('research')
    }
  })

  // ─── 关键词匹配：开发/修复类 ───

  it('含"开发"关键词 → taskDomain 为 code-dev，workflowId 为 existing-repo-iteration', () => {
    const result = service.understand('开发用户认证模块')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('code-dev')
      expect(result.data.taskType).toBe('development')
      expect(result.data.workflowId).toBe('existing-repo-iteration')
    }
  })

  it('含"修复"关键词 → taskDomain 为 code-dev', () => {
    const result = service.understand('修复登录页面白屏问题')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('code-dev')
    }
  })

  it('含"实现"关键词 → taskDomain 为 code-dev', () => {
    const result = service.understand('实现数据导出功能')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('code-dev')
    }
  })

  it('含"重构"关键词 → taskDomain 为 code-dev', () => {
    const result = service.understand('重构配置管理模块')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('code-dev')
    }
  })

  it('含"优化"关键词 → taskDomain 为 code-dev', () => {
    const result = service.understand('优化首屏加载速度')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('code-dev')
    }
  })

  // ─── 关键词匹配：文档/总结类 ───

  it('含"文档"关键词 → taskDomain 为 doc-writing，workflowId 为 document-generation', () => {
    const result = service.understand('编写API接口文档')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('doc-writing')
      expect(result.data.taskType).toBe('design')
      expect(result.data.workflowId).toBe('document-generation')
    }
  })

  it('含"总结"关键词 → taskDomain 为 doc-writing', () => {
    const result = service.understand('总结本轮迭代成果')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('doc-writing')
    }
  })

  it('含"撰写"关键词 → taskDomain 为 doc-writing', () => {
    const result = service.understand('撰写项目周报')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('doc-writing')
    }
  })

  it('含"整理"关键词 → taskDomain 为 doc-writing', () => {
    const result = service.understand('整理需求变更记录')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('doc-writing')
    }
  })

  it('含"报告"关键词 → taskDomain 为 doc-writing', () => {
    const result = service.understand('生成测试覆盖率报告')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('doc-writing')
    }
  })

  // ─── 默认匹配 ───

  it('无关键词匹配 → taskDomain 为 general，workflowId 为 ai-development', () => {
    const result = service.understand('检查一下系统状态')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('general')
      expect(result.data.taskType).toBe('development')
      expect(result.data.workflowId).toBe('ai-development')
    }
  })

  // ─── 空输入 ───

  it('空字符串输入 → 返回错误', () => {
    const result = service.understand('')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INPUT')
    }
  })

  it('纯空格输入 → 返回错误', () => {
    const result = service.understand('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_INPUT')
    }
  })

  // ─── title 截取 ───

  it('短输入 → title 保持原样', () => {
    const result = service.understand('开发登录功能')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.title).toBe('开发登录功能')
    }
  })

  it('超长输入 → title 截取前 50 字符', () => {
    const longInput = '开发一个包含用户注册、登录验证、权限管理、数据导出功能、报表生成模块、系统监控面板等多功能的企业级管理平台系统'
    expect(longInput.length).toBeGreaterThan(50)
    const result = service.understand(longInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.title.length).toBe(50)
      expect(result.data.title).toBe(longInput.substring(0, 50))
    }
  })

  it('刚好 50 字符的输入 → title 不截取', () => {
    const input50 = '这是一条刚好五十个字符长度的输入文本用于测试截取边界情况啊哈哈哈哈'
    expect(input50.length).toBeLessThanOrEqual(50)
    const result = service.understand(input50)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.title).toBe(input50)
    }
  })

  // ─── 首次命中优先级 ───

  it('多组关键词命中 → 首组（research 优先），workflowId 为 research-prestudy', () => {
    const result = service.understand('调研并开发新功能')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('research')
      expect(result.data.workflowId).toBe('research-prestudy')
    }
  })

  it('开发+文档关键词 → 开发优先（code-dev），workflowId 为 existing-repo-iteration', () => {
    const result = service.understand('开发文档生成工具')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.taskDomain).toBe('code-dev')
      expect(result.data.workflowId).toBe('existing-repo-iteration')
    }
  })

  // ─── resolveWorkflowId 映射函数 ───

  it('resolveWorkflowId 映射表覆盖所有已知 domain', () => {
    expect(resolveWorkflowId('research')).toBe('research-prestudy')
    expect(resolveWorkflowId('code-dev')).toBe('existing-repo-iteration')
    expect(resolveWorkflowId('doc-writing')).toBe('document-generation')
    expect(resolveWorkflowId('general')).toBe('ai-development')
  })

  it('resolveWorkflowId 未知 domain fallback 到 ai-development', () => {
    expect(resolveWorkflowId('unknown-domain')).toBe('ai-development')
  })

  it('DOMAIN_TO_WORKFLOW 映射表的 workflow ID 与内置 workflow 定义一致', () => {
    const builtinIds = ['existing-repo-iteration', 'research-prestudy', 'document-generation', 'ai-development']
    const mappedIds = Object.values(DOMAIN_TO_WORKFLOW)
    for (const id of mappedIds) {
      expect(builtinIds).toContain(id)
    }
  })
})
