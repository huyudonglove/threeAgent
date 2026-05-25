// src-main/workflows/workflow-registry.ts
// 领域流程注册表
// 来源：10-领域工作流/DomainWorkflow领域流程插件设计、模块接口I/O契约

import type { DomainWorkflowDefinition } from '../contracts/types'
import { validateDomainWorkflowDefinition } from './workflow-definition-validator'
import { WorkflowLoader } from './workflow-loader'
import { Result, ok, err } from '../errors/result'
import { createError } from '../errors/unified-error'

/**
 * 领域流程注册表
 * 管理所有已注册的 workflow 定义，提供按 taskDomain 解析能力
 */
export class WorkflowRegistry {
  private workflows = new Map<string, DomainWorkflowDefinition>()
  private loader: WorkflowLoader

  constructor() {
    this.loader = new WorkflowLoader()
  }

  /**
   * 加载并注册内置领域流程
   */
  async loadBuiltinDomainWorkflows(workspaceRootPath: string): Promise<Result<DomainWorkflowDefinition[]>> {
    const result = await this.loader.loadBuiltinDomainWorkflows(workspaceRootPath)
    if (!result.ok) return result

    for (const workflow of result.data) {
      this.registerDomainWorkflow(workflow)
    }

    return ok(result.data)
  }

  /**
   * 加载并注册自定义领域流程
   */
  async loadCustomDomainWorkflows(workspaceRootPath: string): Promise<Result<DomainWorkflowDefinition[]>> {
    const result = await this.loader.loadCustomDomainWorkflows(workspaceRootPath)
    if (!result.ok) return result

    const existingWorkflows = Array.from(this.workflows.values())
    const validWorkflows: DomainWorkflowDefinition[] = []

    for (const workflow of result.data) {
      // 自定义 workflow 需要完整校验
      const validation = validateDomainWorkflowDefinition(workflow, existingWorkflows)
      if (validation.ok) {
        this.registerDomainWorkflow(workflow)
        validWorkflows.push(workflow)
      }
      // 校验不通过的自定义 workflow 跳过但不中断
    }

    return ok(validWorkflows)
  }

  /**
   * 注册一个领域流程
   */
  registerDomainWorkflow(workflow: DomainWorkflowDefinition): void {
    this.workflows.set(workflow.id, workflow)
  }

  /**
   * 按 taskDomain 解析 workflow
   * 来源：模块接口I/O契约 - WorkflowRegistry.resolveWorkflowByTaskDomain
   */
  resolveWorkflowByTaskDomain(taskDomain: string): Result<DomainWorkflowDefinition> {
    for (const workflow of this.workflows.values()) {
      if (workflow.taskDomain === taskDomain) {
        return ok(workflow)
      }
    }
    return err(createError('ARTIFACT_NOT_FOUND', 'workflow',
      `No workflow found for taskDomain "${taskDomain}"`, {
        recoverable: true,
        suggestedAction: 'Check if the domain workflow is registered.',
      }))
  }

  /**
   * 按 ID 获取 workflow
   */
  getById(workflowId: string): DomainWorkflowDefinition | undefined {
    return this.workflows.get(workflowId)
  }

  /**
   * 列出所有已注册的 workflow
   */
  listAll(): DomainWorkflowDefinition[] {
    return Array.from(this.workflows.values())
  }

  /**
   * 列出内置 workflow
   */
  listBuiltin(): DomainWorkflowDefinition[] {
    return this.listAll().filter(w => w.status === 'builtin')
  }

  /**
   * 列出自定义 workflow
   */
  listCustom(): DomainWorkflowDefinition[] {
    return this.listAll().filter(w => w.status === 'custom')
  }
}
