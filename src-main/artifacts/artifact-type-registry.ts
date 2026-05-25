// src-main/artifacts/artifact-type-registry.ts
// 产物类型注册表
// 来源：12-实现落地/产物类型注册表

export type ArtifactCategory = 'PlanningSpec' | 'ExecutionPlan' | 'RuntimeEvidence' | 'ReviewAcceptance' | 'ResultPersistence'
export type ArtifactScopeLevel = 'workspace' | 'conversation' | 'task' | 'node'
export type ArtifactFormat = 'markdown' | 'json' | 'jsonl'

export interface ArtifactTypeRegistration {
  artifactType: string
  category: ArtifactCategory
  displayName: string
  formatCandidates: ArtifactFormat[]
  scopeLevel: ArtifactScopeLevel
  requiredBodyFields: string[]
  createdByRoles: string[]
  typicalSourceNodes: string[]
  requiredForCompletion: boolean
  summaryRequired: boolean
}

/**
 * 产物类型注册表
 * 管理所有已注册的产物类型，提供查询和校验能力
 */
export class ArtifactTypeRegistry {
  private registry = new Map<string, ArtifactTypeRegistration>()

  /**
   * 注册一个产物类型
   */
  register(registration: ArtifactTypeRegistration): void {
    this.registry.set(registration.artifactType, registration)
  }

  /**
   * 批量注册
   */
  registerAll(registrations: ArtifactTypeRegistration[]): void {
    for (const r of registrations) {
      this.register(r)
    }
  }

  /**
   * 查询产物类型是否已注册
   */
  isRegistered(artifactType: string): boolean {
    return this.registry.has(artifactType)
  }

  /**
   * 获取产物类型注册信息
   */
  get(artifactType: string): ArtifactTypeRegistration | undefined {
    return this.registry.get(artifactType)
  }

  /**
   * 列出所有已注册的产物类型
   */
  listAll(): ArtifactTypeRegistration[] {
    return Array.from(this.registry.values())
  }

  /**
   * 按分类筛选
   */
  listByCategory(category: ArtifactCategory): ArtifactTypeRegistration[] {
    return this.listAll().filter(r => r.category === category)
  }

  /**
   * 按作用域筛选
   */
  listByScopeLevel(scopeLevel: ArtifactScopeLevel): ArtifactTypeRegistration[] {
    return this.listAll().filter(r => r.scopeLevel === scopeLevel)
  }

  /**
   * 获取所有已注册的 artifactType 名称
   */
  listTypeNames(): string[] {
    return Array.from(this.registry.keys())
  }
}

/**
 * 创建包含第一版内置产物类型的注册表
 */
export function createBuiltinArtifactTypeRegistry(): ArtifactTypeRegistry {
  const registry = new ArtifactTypeRegistry()

  registry.registerAll([
    // ─── PlanningSpec ───
    {
      artifactType: 'ProductSpec',
      category: 'PlanningSpec',
      displayName: '产品说明书',
      formatCandidates: ['markdown', 'json'],
      scopeLevel: 'conversation',
      requiredBodyFields: ['projectName', 'productGoal', 'targetUsers', 'coreScenarios'],
      createdByRoles: ['product_manager'],
      typicalSourceNodes: ['ProjectKickoffPlanning'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    {
      artifactType: 'ProductSpecOutline',
      category: 'PlanningSpec',
      displayName: '产品说明书大纲',
      formatCandidates: ['json', 'markdown'],
      scopeLevel: 'conversation',
      requiredBodyFields: ['projectName', 'outlineModules'],
      createdByRoles: ['product_manager'],
      typicalSourceNodes: ['ProjectKickoffPlanning'],
      requiredForCompletion: false,
      summaryRequired: false,
    },
    {
      artifactType: 'TechnicalDesignDocument',
      category: 'PlanningSpec',
      displayName: '技术设计文档',
      formatCandidates: ['markdown', 'json'],
      scopeLevel: 'task',
      requiredBodyFields: ['projectName', 'coreComponents', 'criticalFunctions', 'riskPoints'],
      createdByRoles: ['tech_lead'],
      typicalSourceNodes: ['TechLeadTechnicalPlan'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    {
      artifactType: 'TechnicalPlan',
      category: 'PlanningSpec',
      displayName: '技术方案',
      formatCandidates: ['markdown', 'json'],
      scopeLevel: 'task',
      requiredBodyFields: ['frameworkChoice', 'stateManagement', 'dataSourceStrategy'],
      createdByRoles: ['tech_lead'],
      typicalSourceNodes: ['TechLeadTechnicalPlan'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    // ─── ExecutionPlan ───
    {
      artifactType: 'DevelopmentTaskPlan',
      category: 'ExecutionPlan',
      displayName: '开发任务计划',
      formatCandidates: ['json', 'markdown'],
      scopeLevel: 'task',
      requiredBodyFields: ['tasks', 'dependencies', 'parallelGroups', 'checkpoints'],
      createdByRoles: ['project_manager'],
      typicalSourceNodes: ['ProjectManagerCreateDevelopmentTaskPlan'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    // ─── RuntimeEvidence ───
    {
      artifactType: 'RepositoryReviewResult',
      category: 'RuntimeEvidence',
      displayName: '仓库现状审查结果',
      formatCandidates: ['markdown', 'json'],
      scopeLevel: 'task',
      requiredBodyFields: ['repositoryPath', 'techStackSignals', 'structureSummary', 'riskSummary'],
      createdByRoles: ['tech_lead'],
      typicalSourceNodes: ['RepositoryReview'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    // ─── ReviewAcceptance ───
    {
      artifactType: 'AcceptanceResult',
      category: 'ReviewAcceptance',
      displayName: '产品验收结果',
      formatCandidates: ['json', 'markdown'],
      scopeLevel: 'task',
      requiredBodyFields: ['status', 'criteria', 'summary'],
      createdByRoles: ['product_manager'],
      typicalSourceNodes: ['ProductAcceptance'],
      requiredForCompletion: true,
      summaryRequired: true,
    },
    // ─── ResultPersistence ───
    {
      artifactType: 'ImplementationSummary',
      category: 'ResultPersistence',
      displayName: '实现总结',
      formatCandidates: ['markdown', 'json'],
      scopeLevel: 'task',
      requiredBodyFields: ['completedScope', 'unfinishedScope', 'technicalDebt', 'nextSuggestions'],
      createdByRoles: ['code', 'tech_lead'],
      typicalSourceNodes: ['FinalWrapUp'],
      requiredForCompletion: true,
      summaryRequired: true,
    },
    {
      artifactType: 'ResearchReport',
      category: 'ResultPersistence',
      displayName: '调研报告',
      formatCandidates: ['markdown', 'json'],
      scopeLevel: 'task',
      requiredBodyFields: ['topic', 'findings', 'recommendations'],
      createdByRoles: ['tech_lead', 'product_manager'],
      typicalSourceNodes: ['ResearchAnalysis'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    // ─── T18 首批候选领域新增产物类型 ───
    {
      artifactType: 'ResearchRequirementFrame',
      category: 'PlanningSpec',
      displayName: '调研需求框定',
      formatCandidates: ['json', 'markdown'],
      scopeLevel: 'task',
      requiredBodyFields: ['topic', 'scope', 'objectives'],
      createdByRoles: ['product_manager'],
      typicalSourceNodes: ['requirement-frame'],
      requiredForCompletion: false,
      summaryRequired: false,
    },
    {
      artifactType: 'SourceReviewMatrix',
      category: 'RuntimeEvidence',
      displayName: '信息源审查矩阵',
      formatCandidates: ['json', 'markdown'],
      scopeLevel: 'task',
      requiredBodyFields: ['sources', 'credibility', 'relevance'],
      createdByRoles: ['tech_lead'],
      typicalSourceNodes: ['source-review'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    {
      artifactType: 'TechnicalRecommendation',
      category: 'ResultPersistence',
      displayName: '技术建议',
      formatCandidates: ['markdown', 'json'],
      scopeLevel: 'task',
      requiredBodyFields: ['recommendation', 'rationale', 'priority'],
      createdByRoles: ['tech_lead'],
      typicalSourceNodes: ['recommendation'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    {
      artifactType: 'NextActionProposal',
      category: 'ResultPersistence',
      displayName: '下一步建议',
      formatCandidates: ['json', 'markdown'],
      scopeLevel: 'task',
      requiredBodyFields: ['actions', 'priority', 'owner'],
      createdByRoles: ['tech_lead'],
      typicalSourceNodes: ['recommendation'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    {
      artifactType: 'ChangeImpactAnalysis',
      category: 'RuntimeEvidence',
      displayName: '变更影响分析',
      formatCandidates: ['json', 'markdown'],
      scopeLevel: 'task',
      requiredBodyFields: ['changeScope', 'affectedComponents', 'riskLevel'],
      createdByRoles: ['tech_lead'],
      typicalSourceNodes: ['change-impact-analysis'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    {
      artifactType: 'IterationTechnicalPlan',
      category: 'PlanningSpec',
      displayName: '迭代技术方案',
      formatCandidates: ['markdown', 'json'],
      scopeLevel: 'task',
      requiredBodyFields: ['iterationGoal', 'technicalApproach', 'dependencies'],
      createdByRoles: ['tech_lead'],
      typicalSourceNodes: ['iteration-technical-plan'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
    {
      artifactType: 'TechnicalTaskBreakdown',
      category: 'ExecutionPlan',
      displayName: '技术任务拆解',
      formatCandidates: ['json', 'markdown'],
      scopeLevel: 'task',
      requiredBodyFields: ['tasks', 'dependencies', 'estimatedEffort'],
      createdByRoles: ['project_manager'],
      typicalSourceNodes: ['task-planning'],
      requiredForCompletion: false,
      summaryRequired: false,
    },
    {
      artifactType: 'SelfCheckResult',
      category: 'ReviewAcceptance',
      displayName: '自检结果',
      formatCandidates: ['json'],
      scopeLevel: 'task',
      requiredBodyFields: ['passed', 'checkItems', 'issues'],
      createdByRoles: ['code'],
      typicalSourceNodes: ['self-check'],
      requiredForCompletion: false,
      summaryRequired: false,
    },
    {
      artifactType: 'ResultSummary',
      category: 'ResultPersistence',
      displayName: '结果摘要',
      formatCandidates: ['json'],
      scopeLevel: 'task',
      requiredBodyFields: ['completedScope', 'unfinishedScope', 'nextSuggestions'],
      createdByRoles: ['code', 'tech_lead'],
      typicalSourceNodes: ['FinalWrapUp'],
      requiredForCompletion: false,
      summaryRequired: true,
    },
  ])

  return registry
}
