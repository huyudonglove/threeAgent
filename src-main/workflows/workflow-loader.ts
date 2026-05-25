// src-main/workflows/workflow-loader.ts
// 领域流程定义加载
// 来源：10-领域工作流/DomainWorkflow领域流程插件设计、BuiltinCandidateDomainRegistry

import fs from 'node:fs/promises'
import path from 'node:path'
import { PathResolver } from '../storage/path-resolver'
import { JsonStore } from '../storage/json-store'
import type { DomainWorkflowDefinition } from '../contracts/types'
import { validateDomainWorkflowDefinition } from '../validation/structure'
import { validateWorkflowDefinition } from '../validation/reference'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

/**
 * 内置候选领域流程定义
 * 来源：10-领域工作流/BuiltinCandidateDomainRegistry内置候选领域清单
 */
const BUILTIN_DOMAIN_WORKFLOWS: DomainWorkflowDefinition[] = [
  {
    id: 'existing-repo-iteration',
    name: '已有仓库迭代',
    taskDomain: 'existing-repo-iteration',
    version: '1.1.0',
    status: 'builtin',
    nodes: [
      { id: 'repo-review', name: '仓库现状审查', role: 'tech_lead', status: 'queued', summary: '读取仓库现状，识别技术栈和结构', reason: '', outputs: ['RepositoryReviewResult'], confirmations: [], tools: ['file-reader', 'project-analyzer'], expectedOutputs: [{ artifactType: 'RepositoryReviewResult', title: '仓库现状审查报告' }] },
      { id: 'requirement-analysis', name: '迭代需求分析', role: 'product_manager', status: 'queued', summary: '分析迭代需求和范围', reason: '', outputs: ['ProductSpec', 'ProductSpecOutline'], confirmations: [], tools: ['requirement-collector'], expectedOutputs: [{ artifactType: 'ProductSpec', title: '迭代产品说明书' }, { artifactType: 'ProductSpecOutline', title: '产品说明书大纲' }] },
      { id: 'change-impact-analysis', name: '变更影响分析', role: 'tech_lead', status: 'queued', summary: '评估变更影响范围和技术风险', reason: '', outputs: ['ChangeImpactAnalysis'], confirmations: [], tools: ['code-analyzer', 'dependency-checker'], expectedOutputs: [{ artifactType: 'ChangeImpactAnalysis', title: '变更影响分析报告' }] },
      { id: 'iteration-technical-plan', name: '迭代技术方案', role: 'tech_lead', status: 'queued', summary: '制定迭代技术方案', reason: '', outputs: ['IterationTechnicalPlan', 'TechnicalDesignDocument'], confirmations: [], tools: ['architecture-designer'], expectedOutputs: [{ artifactType: 'IterationTechnicalPlan', title: '迭代技术方案' }, { artifactType: 'TechnicalDesignDocument', title: '技术设计文档' }] },
      { id: 'task-planning', name: '任务拆分', role: 'project_manager', status: 'queued', summary: '拆分开发任务并排序', reason: '', outputs: ['DevelopmentTaskPlan', 'TechnicalTaskBreakdown'], confirmations: [], tools: ['task-decomposer'], expectedOutputs: [{ artifactType: 'DevelopmentTaskPlan', title: '开发任务计划' }, { artifactType: 'TechnicalTaskBreakdown', title: '技术任务拆解' }] },
      { id: 'implementation', name: '开发实现', role: 'code', status: 'queued', summary: '按计划实现功能', reason: '', outputs: ['ImplementationSummary'], confirmations: [], tools: ['code-generator', 'test-runner', 'file-writer'], expectedOutputs: [{ artifactType: 'ImplementationSummary', title: '开发实现总结' }] },
      { id: 'self-check', name: '自检', role: 'code', status: 'queued', summary: '开发自检', reason: '', outputs: ['SelfCheckResult'], confirmations: [], tools: ['test-runner', 'lint-checker'], expectedOutputs: [{ artifactType: 'SelfCheckResult', title: '自检结果' }] },
      { id: 'acceptance', name: '验收确认', role: 'product_manager', status: 'queued', summary: '确认实现是否符合预期', reason: '', outputs: ['AcceptanceResult'], confirmations: [], tools: ['acceptance-checker'], expectedOutputs: [{ artifactType: 'AcceptanceResult', title: '产品验收结果' }] },
    ],
    roleBindings: [
      { nodeName: 'repo-review', role: 'tech_lead', description: '负责仓库现状审查' },
      { nodeName: 'requirement-analysis', role: 'product_manager', description: '负责迭代需求分析' },
      { nodeName: 'change-impact-analysis', role: 'tech_lead', description: '负责变更影响分析' },
      { nodeName: 'iteration-technical-plan', role: 'tech_lead', description: '负责迭代技术方案' },
      { nodeName: 'task-planning', role: 'project_manager', description: '负责任务拆分和排期' },
      { nodeName: 'implementation', role: 'code', description: '负责功能实现' },
      { nodeName: 'self-check', role: 'code', description: '负责开发自检' },
      { nodeName: 'acceptance', role: 'product_manager', description: '负责验收确认' },
    ],
    skillBindings: [],
  },
  {
    id: 'research-prestudy',
    name: '调研预研',
    taskDomain: 'research-prestudy',
    version: '1.1.0',
    status: 'builtin',
    nodes: [
      { id: 'requirement-frame', name: '需求框定', role: 'product_manager', status: 'queued', summary: '明确调研目标和范围', reason: '', outputs: ['ResearchRequirementFrame'], confirmations: [], tools: ['requirement-collector'], expectedOutputs: [{ artifactType: 'ResearchRequirementFrame', title: '调研需求框定' }] },
      { id: 'source-review', name: '信息源审查', role: 'tech_lead', status: 'queued', summary: '收集和评估信息源', reason: '', outputs: ['SourceReviewMatrix'], confirmations: [], tools: ['search-engine', 'doc-reader'], expectedOutputs: [{ artifactType: 'SourceReviewMatrix', title: '信息源审查矩阵' }] },
      { id: 'analysis', name: '分析整理', role: 'tech_lead', status: 'queued', summary: '整理分析调研结果', reason: '', outputs: ['ResearchReport'], confirmations: [], tools: ['data-analyzer', 'report-writer'], expectedOutputs: [{ artifactType: 'ResearchReport', title: '调研报告' }] },
      { id: 'recommendation', name: '建议输出', role: 'tech_lead', status: 'queued', summary: '输出技术建议和后续行动', reason: '', outputs: ['TechnicalRecommendation', 'NextActionProposal'], confirmations: [], tools: ['recommendation-builder'], expectedOutputs: [{ artifactType: 'TechnicalRecommendation', title: '技术建议' }, { artifactType: 'NextActionProposal', title: '下一步建议' }] },
    ],
    roleBindings: [
      { nodeName: 'requirement-frame', role: 'product_manager', description: '负责调研需求框定' },
      { nodeName: 'source-review', role: 'tech_lead', description: '负责信息源审查' },
      { nodeName: 'analysis', role: 'tech_lead', description: '负责分析整理' },
      { nodeName: 'recommendation', role: 'tech_lead', description: '负责建议输出' },
    ],
    skillBindings: [],
  },
  {
    id: 'document-generation',
    name: '文档整理生成',
    taskDomain: 'document-generation',
    version: '1.1.0',
    status: 'builtin',
    nodes: [
      { id: 'doc-requirement', name: '文档需求确认', role: 'product_manager', status: 'queued', summary: '确认文档目标和受众', reason: '', outputs: ['ProductSpecOutline'], confirmations: [], tools: ['requirement-collector'], expectedOutputs: [{ artifactType: 'ProductSpecOutline', title: '文档需求大纲' }] },
      { id: 'doc-outline', name: '大纲生成', role: 'tech_lead', status: 'queued', summary: '生成文档大纲和结构', reason: '', outputs: ['TechnicalDesignDocument'], confirmations: [], tools: ['outline-generator'], expectedOutputs: [{ artifactType: 'TechnicalDesignDocument', title: '文档大纲设计' }] },
      { id: 'doc-draft', name: '正文撰写', role: 'code', status: 'queued', summary: '撰写文档正文', reason: '', outputs: ['ImplementationSummary'], confirmations: [], tools: ['doc-writer', 'content-generator'], expectedOutputs: [{ artifactType: 'ImplementationSummary', title: '文档正文初稿' }] },
      { id: 'doc-review', name: '审阅确认', role: 'product_manager', status: 'queued', summary: '审阅文档质量', reason: '', outputs: ['AcceptanceResult'], confirmations: [], tools: ['acceptance-checker'], expectedOutputs: [{ artifactType: 'AcceptanceResult', title: '文档审阅结果' }] },
    ],
    roleBindings: [
      { nodeName: 'doc-requirement', role: 'product_manager', description: '负责文档需求确认' },
      { nodeName: 'doc-outline', role: 'tech_lead', description: '负责大纲生成' },
      { nodeName: 'doc-draft', role: 'code', description: '负责正文撰写' },
      { nodeName: 'doc-review', role: 'product_manager', description: '负责审阅确认' },
    ],
    skillBindings: [],
  },
  {
    id: 'ai-development',
    name: 'AI开发工作流',
    taskDomain: 'ai-development',
    version: '1.0.0',
    status: 'candidate',
    nodes: [
      { id: 'product-goal', name: '产品目标确认', role: 'product_manager', status: 'queued', summary: '确认产品目标和用户价值', reason: '', outputs: ['ProductSpec'], confirmations: [], tools: [], expectedOutputs: [{ artifactType: 'ProductSpec', title: '产品目标说明' }] },
      { id: 'technical-design', name: '技术设计', role: 'tech_lead', status: 'queued', summary: '制定技术方案和架构设计', reason: '', outputs: ['TechnicalDesignDocument', 'TechnicalPlan'], confirmations: [], tools: [], expectedOutputs: [{ artifactType: 'TechnicalDesignDocument', title: '技术设计文档' }] },
      { id: 'task-breakdown', name: '任务拆解', role: 'project_manager', status: 'queued', summary: '拆解开发任务', reason: '', outputs: ['DevelopmentTaskPlan', 'TechnicalTaskBreakdown'], confirmations: [], tools: [], expectedOutputs: [{ artifactType: 'DevelopmentTaskPlan', title: '开发任务计划' }, { artifactType: 'TechnicalTaskBreakdown', title: '技术任务拆解' }] },
      { id: 'code-implementation', name: '代码实现', role: 'code', status: 'queued', summary: '编码实现', reason: '', outputs: ['ImplementationSummary'], confirmations: [], tools: [], expectedOutputs: [{ artifactType: 'ImplementationSummary', title: '代码实现总结' }] },
      { id: 'self-check-and-acceptance', name: '自检与验收', role: 'product_manager', status: 'queued', summary: '自检和产品验收', reason: '', outputs: ['SelfCheckResult', 'AcceptanceResult'], confirmations: [], tools: [], expectedOutputs: [{ artifactType: 'SelfCheckResult', title: '自检结果' }, { artifactType: 'AcceptanceResult', title: '验收结果' }] },
    ],
    roleBindings: [
      { nodeName: 'product-goal', role: 'product_manager', description: '负责产品目标确认' },
      { nodeName: 'technical-design', role: 'tech_lead', description: '负责技术设计' },
      { nodeName: 'task-breakdown', role: 'project_manager', description: '负责任务拆解' },
      { nodeName: 'code-implementation', role: 'code', description: '负责代码实现' },
      { nodeName: 'self-check-and-acceptance', role: 'product_manager', description: '负责自检与验收' },
    ],
    skillBindings: [],
  },
]

export class WorkflowLoader {
  /**
   * 加载内置领域流程
   */
  async loadBuiltinDomainWorkflows(_workspaceRootPath: string): Promise<Result<DomainWorkflowDefinition[]>> {
    // 内置 workflow 直接返回硬编码定义
    return ok(BUILTIN_DOMAIN_WORKFLOWS)
  }

  /**
   * 加载自定义领域流程
   */
  async loadCustomDomainWorkflows(workspaceRootPath: string): Promise<Result<DomainWorkflowDefinition[]>> {
    const resolver = new PathResolver(workspaceRootPath)
    const customDir = path.join(resolver.domainsDir, 'custom')

    const workflows: DomainWorkflowDefinition[] = []

    try {
      const files = await fs.readdir(customDir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const filePath = path.join(customDir, file)
        const result = await JsonStore.read<DomainWorkflowDefinition>(filePath)
        if (result.ok) {
          workflows.push(result.data)
        }
      }
    } catch {
      // custom 目录不存在，返回空列表
    }

    return ok(workflows)
  }
}
