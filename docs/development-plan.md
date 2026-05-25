# AgentThee 开发计划

> 本文档记录项目背景、架构决策、里程碑定义和实施进度，方便团队回溯和追踪。
>
> 本文档与 `D:\agentMd\agent\agentWork` 设计文档保持同步。设计文档如有变更，需同步更新本文档。

---

## 1. 项目定位

AgentThee 是一个**个人 Agent 工作台**桌面应用。

核心价值：**持续推进复杂任务，而不是重新开始聊天。**

界面围绕以下链路设计：

```
Run → Node → Evidence → Artifact
```

用户可以随时恢复中断的任务，查看每个工作流节点的决策依据、产出物和风险项，而不需要重新发起对话。

### 产品价值优先级（来源：产品目标与用户价值）

| 优先级 | 价值                                     | 说明           |
| ------ | ---------------------------------------- | -------------- |
| 第一   | 复杂任务能被接住，并能继续推进           | 这是产品主线   |
| 第二   | 用户不用反复解释同一个背景               | 记忆与继续能力 |
| 第三   | 过程、产物、记忆和状态对用户可见、可追踪 | 可观察性       |
| 第四   | 低风险少确认，高风险不越权               | 少确认但可控   |
| 第五   | 角色、流程和领域能力可以扩展             | 可扩展性       |

---

## 2. 技术栈

| 层级          | 技术                                                 | 版本   |
| ------------- | ---------------------------------------------------- | ------ |
| 前端框架      | Vue 3（`<script setup>` SFC）                        | ^3.4   |
| 构建工具      | Vite                                                 | ^5.1   |
| 类型系统      | TypeScript（`vue-tsc` 检查）                         | ^5.2   |
| 桌面容器      | Electron                                             | ^30.0  |
| Electron 集成 | vite-plugin-electron + vite-plugin-electron-renderer | ^0.28  |
| 打包发布      | electron-builder                                     | ^24.13 |
| 测试          | vitest                                               | ^2.1   |

---

## 3. 架构决策

### 3.1 进程架构

```
┌─────────────────────────────────────────┐
│  Renderer Process (Vite + Vue 3)        │  ← 运行在 Chromium
│  src/  →  dist/                         │
│  通过 Window.agentAPI 访问数据           │
├─────────────────────────────────────────┤
│  Preload Script                         │  ← 安全桥接层
│  contextBridge.exposeInMainWorld        │
│  仅暴露命名方法，不暴露原始 ipcRenderer    │
├─────────────────────────────────────────┤
│  Main Process (Node.js)                 │  ← 运行在 Node
│  electron/main.ts + src-main/*          │
│  所有业务逻辑和文件系统访问在此完成        │
└─────────────────────────────────────────┘
```

### 3.2 关键约束

| 约束                                   | 原因                                      |
| -------------------------------------- | ----------------------------------------- |
| 核心模块全部在主进程内 TypeScript 实现 | 渲染进程不可信，不直接访问文件系统        |
| preload 仅暴露窄接口 `agentAPI`        | 不暴露原始 ipcRenderer，最小化 IPC 攻击面 |
| 存储层采用文件系统（JSON + JSONL）     | 不引入数据库，简单可恢复                  |
| 所有模块返回统一 `Result<T>` 结构      | `{ ok, data }` 或 `{ ok, error }`         |
| 真源对象只在主进程中写入               | 展示层不能反向篡改真源                    |
| 密钥独立存储在 secrets.json            | 普通配置不含明文密钥，渲染进程只看到掩码  |

### 3.3 关键技术约束（来源：设计文档冻结）

#### 3.3.1 统一状态机（8 个正式状态对象）

| 状态对象                      | 正式状态值                                                                                       | 写入责任方                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------- |
| ConversationRuntime.status    | active, waiting_user, paused, closed                                                             | ConversationRuntimeManager          |
| TaskRuntime.status            | created, planning, ready, running, blocked, waiting_user, reviewing, completed, failed, archived | TaskRuntimeManager / WorkflowRunner |
| WorkflowNodeState             | pending, running, completed, blocked, failed, skipped, backflow                                  | WorkflowRunner                      |
| ArtifactIndexEntry.status     | draft, active, superseded, archived, invalid                                                     | ArtifactService                     |
| BackflowRecord.status         | open, accepted, resolved, rejected, cancelled                                                    | BackflowManager                     |
| ChangeRequest.status          | open, reviewing, approved, rejected, implemented, closed                                         | ChangeRequestManager                |
| PluginEnablementRecord.status | draft, validated, pending_confirmation, enabled, disabled, failed                                | PluginConfigManager                 |
| ValidationResult.result       | passed, passed_with_notes, failed                                                                | ValidationLayer                     |

> 详细合法迁移映射见设计文档 `12-实现落地/统一状态机与状态迁移约束`。

#### 3.3.2 跨对象同步规则

- TaskRuntime.status = running 时，必须存在 currentNode 且状态为 running
- TaskRuntime.status = blocked 时，currentNode 应为 blocked 或存在未处理 backflow
- 创建 open backflow 后，TaskRuntime 应同步进入 blocked 或回到 planning/ready
- ConversationRuntime.closed 不要求所有历史任务都 archived，但不应再有新的 activeTask 绑定
- 同一任务下同一语义位置的当前有效正文产物原则上只能有一个 active

> 不允许：把任务状态、节点状态、产物状态混成一个枚举；让 GUI 展示状态反向驱动运行态真源。

#### 3.3.3 校验层六层设计

| 层级                | 职责                                                       | 阻断性         |
| ------------------- | ---------------------------------------------------------- | -------------- |
| StructureValidation | 必填字段、类型、枚举值、ID 格式                            | 阻断           |
| StateValidation     | 状态迁移合法性                                             | 阻断（关键）   |
| ReferenceValidation | taskId/conversationId/artifactId/workflowId 是否存在且闭合 | 阻断（关键）   |
| ConflictValidation  | ID 重复、域冲突、多默认启用                                | 非阻断         |
| SafetyValidation    | 高风险操作、权限越界、运行中依赖                           | 阻断（高风险） |
| RecoveryValidation  | 恢复时数据一致性                                           | 非阻断         |

> 详细接口和触发时机见设计文档 `12-实现落地/系统级校验层约束`。

#### 3.3.4 持久化写入规则

**核心原则**：正文先于索引，真源先于镜像。

**写入成功定义**：

- 运行态更新：真源写入 + 结构校验通过 + 时间戳更新 + trace 追加（降级容忍）
- 新产物生成：正文写入 + ArtifactIndex 写入 + TaskRuntime.artifactIds 同步（可补偿）
- 记忆写入：MemoryDecision 生成 + shared/role.json 写入 + records.jsonl 追加

**恢复顺序**：WorkspaceManifest → config.json → ConversationRuntime → TaskRuntime → ArtifactIndex → AgentMemory → DisplayTrace → logs

**不一致时优先级**：运行态真源 > 索引真源 > 正文文件 > 展示镜像 > 历史日志

> 详细规则见设计文档 `12-实现落地/持久化一致性与恢复规则`。

#### 3.3.5 统一错误模型

```ts
UnifiedError {
  errorCode: string
  message: string
  scope: string
  relatedObjectId?: string | null
  recoverable: boolean
  suggestedAction?: string | null
}

Result<T> = { ok: true, data: T } | { ok: false, error: UnifiedError }
```

> 详细错误码字典见设计文档 `12-实现落地/统一错误模型与错误码字典`。

#### 3.3.6 模块 I/O 契约（10 个模块）

所有模块接口已冻结输入输出骨架。研发实现时必须遵循以下约束：

- 所有写接口至少接收：workspaceId, conversationId（如属于会话）, taskId（如属于任务）, operatorRole
- 所有接口统一返回 Result<T>
- 接口文档必须说明：是否会写 DisplayTrace、是否会修改运行态真源、是否只追加日志

> 详细接口签名见设计文档 `12-实现落地/模块接口I/O契约`。

---

## 4. 代码目录结构

```
agentThee/
├── electron/
│   ├── main.ts              # 入口：窗口 + IPC handler 注册
│   └── preload.ts           # 安全封装的 agentAPI
├── src-main/                # 主进程业务模块
│   ├── contracts/           # 核心类型定义、状态枚举
│   ├── validation/          # 结构/状态/引用校验
│   ├── errors/              # 统一错误模型、Result<T>、错误码
│   ├── storage/             # PathResolver、JsonStore、JsonlStore、WorkspaceManager
│   ├── runtime/             # 会话/任务运行态、回流、变更请求
│   ├── model-config/        # 模型配置、探活、密钥存储/掩码/脱敏
│   ├── artifacts/           # [M2] 产物索引、正文服务
│   ├── trace/               # [M2] 展示镜像服务
│   ├── workflows/           # [M2] 领域流程加载、流程推进器
│   ├── plugins/             # [M2→M4] 插件配置与冲突检查
│   ├── memory/              # [M4] 记忆服务
│   └── results/             # [M4] 结果沉淀与复用
├── src/                     # 渲染进程（Vue）
│   ├── App.vue              # 三栏工作台布局
│   ├── data/workbench.ts    # Mock 数据和接口定义（待替换）
│   ├── main.ts              # Vue 入口
│   ├── style.css            # 全局样式和 CSS Token
│   └── electron-api.d.ts    # Window.agentAPI 类型声明
├── tests/                   # vitest 测试
└── docs/                    # 项目文档（本文件所在目录）
```

---

## 5. 设计文档来源

设计文档独立存放于 `D:\agentMd\agent\agentWork`，共 14 个分类目录、80+ 篇设计文档。

### 完整目录索引

| 目录                | 内容                                                         | 关联任务          |
| ------------------- | ------------------------------------------------------------ | ----------------- |
| 00-入口与总览       | 总流程、模板体系、任务类型覆盖                               | T0                |
| 01-设计原则         | 模板固定值变化、模型与代码边界、确认策略                     | T7, T12           |
| 02-工作区与工程入口 | WorkspaceManifest、ArtifactIndex、TaskRuntime、WorkflowState | T3, T4, T8, T11   |
| 03-环境与工具       | 环境探测与工具需求                                           | —                 |
| 04-对话入口         | 对话理解、意图识别、任务路由                                 | T11               |
| 05-记忆系统         | MemoryGate、AgentMemory、DisplayTrace、角色体系              | T4, T9, T16       |
| 06-项目启动与规划   | 项目初始化流程                                               | T18               |
| 07-开发执行闭环     | CodeImplementationFlow、自检与验收                           | T0, T11, T17, T19 |
| 08-调研预研         | 调研预研流程                                                 | T18               |
| 09-通用任务流程     | 通用任务流程模板                                             | T10, T18          |
| 10-领域工作流       | DomainWorkflow、BuiltinCandidateDomainRegistry               | T10               |
| 11-结果沉淀         | ResultPersistence结果沉淀流程                                | T17               |
| 12-实现落地         | StorageLayout、GUI架构、状态机、I/O契约、错误模型、模块映射  | 全部任务          |
| 13-产品需求         | 产品目标、验收清单、场景样例                                 | T14, T15, T19     |
| 技术评审            | 技术可行性、详细字段方案、Code实现方向                       | T1, T8, T11       |

当前设计进度：**M0（约束冻结）已完成**。

---

## 6. 里程碑定义

### M0 约束冻结（已完成）

冻结研发必须共享的实现约束：字段契约、统一状态机、I/O 契约、错误模型、模块映射表、插件 schema、持久化一致性规则。

完成标准：tech_lead 能拆包、code 不再猜对象关系、project_manager 能识别并行边界。

### M1 底层真源可运行（已完成）

**目标**：工作区、会话、任务运行态可稳定读写和恢复。

**范围**：第一阶段（T0-T4）+ 第二阶段（T5-T7）

> 注：原始里程碑设计 M1 只含 T1-T4。T5-T7（模型配置）为实际开发时根据 P0 优先级补充纳入，作为"第二阶段"在 M1 内完成。

| 验收项                                          | 状态 |
| ----------------------------------------------- | ---- |
| 能初始化工作区，目录结构完整                    | done |
| WorkspaceManifest 可创建、读取、更新            | done |
| ConversationRuntime 可创建、读取、更新          | done |
| TaskRuntime 可创建、读取、更新，状态迁移有校验  | done |
| 统一错误结构 `{ ok, data, error }` 全模块复用   | done |
| 模型配置可持久化，provider/model/binding 可区分 | done |
| 未配置 provider 时系统返回 blocked 状态         | done |
| 密钥不存入普通配置文件，渲染进程只能看到掩码值  | done |
| 基础恢复入口可运行                              | done |

### M2 任务与产物闭环（已完成）

**目标**：让任务能推进，且产物和 trace 可被定位。

**范围**：第三阶段（T12 → T8/T9 → T10 → T11）

> 注：原始里程碑设计 M2 只含 T8-T11。T12（validation-layer-system）在第三阶段中先于 T8-T11 执行，因为各模块需要复用统一校验层而非各自实现。

**关键验收信号**：系统能回答"任务现在做到哪、产物在哪、为什么到这里"。

| 验收项                               | 状态 |
| ------------------------------------ | ---- |
| 可以按 taskDomain 解析 workflow      | done |
| 可以启动一个最小任务                 | done |
| 可以推进到至少 2-3 个节点            | done |
| 节点推进会更新 TaskRuntime           | done |
| 可以生成正文产物并进入 ArtifactIndex | done |
| 可以写 DisplayTraceEvent             | done |
| 任务阻塞和回流可以被记录             | done |

### M3 最小工作台可观察（已完成）

**目标**：前端能真正观察运行结果。

**范围**：第四阶段（T13 → T14/T15）

**范围详细**：

- T13 plugin-config-and-conflict-check（插件启停基础，UI 依赖）
- T14 workbench-ui-minimal（Run 总览、节点流转区、右侧详情区、Artifacts/TaskRuntime/DisplayTrace 最小入口）
- T15 model-config-ui（Provider/Model/Binding/HealthCheck/Secrets 页面）

**关键验收**：用户能看到当前任务/节点/产物/trace 摘要，不是普通聊天页，不是黑盒。

| 验收项                           | 状态 |
| -------------------------------- | ---- |
| 用户能看到当前活跃任务           | done |
| 用户能看到当前节点               | done |
| 用户能看到已有产物               | done |
| 用户能看到关键 trace 摘要        | done |
| 阻塞和回流可见                   | done |
| 界面不是普通聊天页               | done |
| 用户可以新增 provider 并测试连接 | done |

### M4 扩展与继续能力补齐（已完成）

**目标**：补齐可扩展和可继续推进能力。

**范围**：第五阶段（T16 → T17 → T18 → T19）

**范围详细**：

- T16 agent-memory-minimal（记忆提交、查询和写入）
- T17 result-persistence-and-reuse（结果沉淀、复用建议、任务收尾）
- T18 builtin-domain-pilots（首批候选领域流程验证）
- T19 visual-testing-and-acceptance（可视化测试、场景验收、恢复验证）
- 高风险确认
- 恢复补偿与错误展示优化

| 验收项                                    | 状态 |
| ----------------------------------------- | ---- |
| 关键记忆能提交、写入、查询                | done |
| 自定义 workflow/role/skill 可被校验后启用 | done |
| 高风险启用动作有影响预览                  | done |
| 恢复失败和补偿问题可见                    | done |

### M5 产品闭环验收（已完成）

**目标**：把输入、继续、配置、执行、扩展和验收六类闭环能力补齐，让工作台从"任务观察台"升级为"真正能接住复杂工作的个人工作台"。

**范围**：T20-T29

| 验收项                             | 状态 |
| ---------------------------------- | ---- |
| 用户输入需求后自动形成任务和工作流 | done |
| 用户可一键恢复中断的任务           | done |
| 模型未配置时工作台有明确阻塞提示   | done |
| 工作流节点完成时自动产出证据       | done |
| 插件管理有可视化入口               | done |
| 结果沉淀有正式收口入口             | done |
| 记忆嵌入真实会话回路               | done |
| 工作区有首页级入口                 | done |
| 场景级可视化验收可稳定回归         | done |

---

## 7. 开发任务总表

| 任务ID | 优先级 | 任务名称                                   | 里程碑 | 依赖                 | 状态 |
| ------ | ------ | ------------------------------------------ | ------ | -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| T0     | P0     | 工程初始化与目录搭建                       | M1     | 无                   | done |
| T1     | P0     | contracts-and-validation                   | M1     | T0                   | done |
| T2     | P0     | unified-error-model                        | M1     | T0                   | done |
| T3     | P0     | workspace-and-storage                      | M1     | T1, T2               | done |
| T4     | P0     | conversation-and-task-runtime              | M1     | T1, T2, T3           | done |
| T5     | P0     | model-config-contracts                     | M1     | T1, T2, T3           | done |
| T6     | P0     | model-profile-resolver-and-health-check    | M1     | T5                   | done |
| T7     | P0     | model-secret-safety                        | M1     | T5, T6               | done |
| T8     | P1     | artifact-index-and-artifact-service        | M2     | T3, T4, T12          | done | ✅ 实际交付：ArtifactService + ArtifactIndexStore + ArtifactTypeRegistry，产物 CRUD 与状态迁移已实现                |
| T9     | P1     | display-trace-service                      | M2     | T3, T4               | done | ✅ 实际交付：DisplayTraceService，事件追加/segment 轮转/按任务查询/摘要读取已实现                                   |
| T10    | P1     | domain-workflow-loader                     | M2     | T1, T3, T12, T13     | done | ✅ 实际交付：WorkflowRegistry + WorkflowLoader + WorkflowDefinitionValidator，4 个内置领域流程已定义                |
| T11    | P1     | workflow-runner-minimal                    | M2     | T4, T8, T9, T10, T12 | done | ✅ 实际交付：WorkflowRunner + NodeTransitionService，任务启动/推进/阻塞/回流/完成节点已实现                         |
| T12    | P1     | validation-layer-system                    | M2     | T1, T2, T3, T4, T5   | done | ✅ 实际交付：6 层校验（Structure/State/Reference/Conflict/Safety/Recovery）全部实现并统一入口                       |
| T13    | P1     | plugin-config-and-conflict-check           | M3     | T10, T12             | done | ✅ 实际交付：PluginConfigManager + PluginConflictCheck + PluginImpactPreview，启停/冲突/影响预览已实现              |
| T14    | P1     | workbench-ui-minimal                       | M3     | T4, T8, T9, T11      | done | ✅ 实际交付：WorkbenchPage 三栏布局 + Run 总览/节点流转/时间线/产物面板/风险展示，数据从 IPC 真实获取               |
| T15    | P1     | model-config-ui                            | M3     | T5, T6, T7           | done | ✅ 实际交付：ModelConfigPage，Provider/Model/Binding/Secrets/HealthCheck 完整配置页已实现                           |
| T16    | P2     | agent-memory-minimal                       | M4     | T3, T4, T9, T12      | done | ✅ 实际交付：AgentMemoryService + MemoryDecisionEngine + MemoryStore，记忆提交/查询/冲突处理已实现                  |
| T17    | P2     | result-persistence-and-reuse               | M4     | T8, T9, T11, T16     | done | ✅ 实际交付：ResultPersistenceService + ResultSummaryBuilder + ReuseSuggestionService，结果沉淀/摘要/复用建议已实现 |
| T18    | P2     | builtin-domain-pilots                      | M4     | T10, T11, T14, T17   | done | ✅ 实际交付：3 个 builtin 领域流程（仓库迭代/调研预研/文档生成）+ 1 个 candidate（AI 开发），含节点与角色绑定       |
| T19    | P2     | visual-testing-and-acceptance              | M4     | T14, T15, T18        | done | ✅ 实际交付：103 个测试全部通过，可视化验收闭环完成                                                                 |
| T20    | P0     | conversation-entry-and-input-understanding | M5     | T4, T10, T11, T14    | done | ✅ 实际交付：输入理解与自动路由闭环，会话入口与任务自动起跑已实现                                                   |
| T21    | P0     | resume-recovery-and-continue-entry         | M5     | T3, T4, T14, T17     | done | ✅ 实际交付：恢复入口与继续任务闭环，一键恢复中断任务已实现                                                         |
| T22    | P0     | model-config-product-closure               | M5     | T5, T6, T7, T15      | done | ✅ 实际交付：模型配置产品闭环，默认配置/调用类型绑定/工作区覆盖/阻塞提示已实现                                      |
| T23    | P1     | plugin-management-ui-and-confirmation      | M5     | T13, T14             | done | ✅ 实际交付：插件管理页与确认闭环，可视化入口与影响预览已实现                                                       |
| T24    | P1     | result-persistence-and-reuse-ui            | M5     | T17, T14             | done | ✅ 实际交付：结果沉淀页与复用入口，总结查看/复用建议/继续使用已实现                                                 |
| T25    | P1     | memory-turn-loop-integration               | M5     | T16, T20, T21        | done | ✅ 实际交付：记忆回路接入真实会话，turn-end 写入与冲突处理已实现                                                    |
| T26    | P0     | domain-executor-integration                | M5     | T10, T11, T18        | done | ✅ 实际交付：领域执行接入，领域 workflow 从状态骨架升级为实际执行闭环                                               |
| T27    | P1     | workspace-index-and-multi-window-entry     | M5     | T3, T14              | done | ✅ 实际交付：工作区首页级入口与全局索引已实现                                                                       |
| T28    | P1     | visual-product-acceptance-suite            | M5     | T20-T27              | done | ✅ 实际交付：场景级可视化验收回归，179 个测试全部通过                                                               |
| T29    | P2     | docs-sync-and-status-rebaseline            | M5     | 无                   | done | ✅ 实际交付：文档同步与状态更新完成                                                                                 |

> 注：T13 依赖 T10 和 T12，而 T10 又依赖 T13。此循环依赖通过分阶段实现解决：T10 先实现内置 workflow 加载（不依赖 T13），T13 完成后再实现 custom workflow 的冲突检查。

---

## 8. 分任务详细交付

### T0 工程初始化与目录搭建

| 项目     | 内容                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| 优先级   | P0                                                                                         |
| 依赖     | 无                                                                                         |
| 输入文档 | 文档到代码模块映射表、实现包优先级与里程碑建议、CodeImplementationFlow                     |
| 研发内容 | 确定仓库形态、建立 TypeScript 工程、接入 lint/typecheck/test/build、预留数据目录和配置目录 |
| 建议输出 | package.json, tsconfig.json, src-main/ 下各子目录, tests/                                  |
| 完成标准 | 工程可安装依赖、可运行 typecheck、可运行空测试、目录能承接后续任务                         |

### T1 contracts-and-validation

| 项目         | 内容                                                                                                                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级       | P0                                                                                                                                                                                                                                                                                                            |
| 依赖         | T0                                                                                                                                                                                                                                                                                                            |
| 输入文档     | 各环节详细字段方案、统一状态机与状态迁移约束、模块接口I/O契约、系统级校验层约束                                                                                                                                                                                                                               |
| 研发内容     | 实现核心对象 TypeScript 类型、实现正式状态枚举、实现 ValidationIssue/ValidationResult、实现结构校验入口、实现状态迁移校验入口、实现引用校验入口                                                                                                                                                               |
| 最低覆盖对象 | WorkspaceManifest, ConversationRuntime, TaskRuntime, ArtifactIndexEntry, BackflowRecord, ChangeRequest, DomainWorkflowDefinition, WorkflowNodeDefinition, PluginEnablementRecord, ModelProviderConfig, ModelProfileConfig, ModelBindingConfig, ModelHealthCheckRecord, ResolvedModelProfile, ModelConfigState |
| 建议输出     | src-main/contracts/types.ts, status.ts; src-main/validation/structure.ts, state-transition.ts, reference.ts                                                                                                                                                                                                   |
| 完成标准     | 核心对象不再靠口头约定、状态字典可复用、模块能统一引用校验结构                                                                                                                                                                                                                                                |

### T2 unified-error-model

| 项目     | 内容                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                      |
| 依赖     | T0                                                                                                                      |
| 输入文档 | 统一错误模型与错误码字典、模块接口I/O契约、持久化一致性与恢复规则                                                       |
| 研发内容 | 实现 UnifiedError 类型、实现错误码枚举、实现模块错误转换器、实现 recoverable/suggestedAction 规范、统一 Result 返回结构 |
| 建议输出 | src-main/errors/unified-error.ts, error-codes.ts, result.ts, from-validation.ts, from-storage.ts                        |
| 完成标准 | 所有模块统一返回 { ok, data, error }、错误码不再由各模块自由发挥                                                        |

### T3 workspace-and-storage

| 项目         | 内容                                                                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级       | P0                                                                                                                                                        |
| 依赖         | T1, T2                                                                                                                                                    |
| 输入文档     | StorageLayout存储落盘结构、持久化一致性与恢复规则、工程入口与模板治理设计                                                                                 |
| 研发内容     | 实现路径解析器、实现 JSON 读写（原子写入）、实现 JSONL 追加、实现工作区初始化器、实现 WorkspaceManifest 读写、实现基础恢复入口                            |
| 最低覆盖目录 | .agent-workspace/ 下：workspace-manifest.json, conversations/, artifacts/, display-trace/, agent-memory/, domains/, roles/, skills/, logs/, model-config/ |
| 建议输出     | src-main/storage/path-resolver.ts, json-store.ts, jsonl-store.ts, workspace-manager.ts                                                                    |
| 完成标准     | 能初始化工作区、能稳定读写基础对象、能从磁盘恢复工作区入口状态                                                                                            |

### T4 conversation-and-task-runtime

| 项目     | 内容                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                                                        |
| 依赖     | T1, T2, T3                                                                                                                                                |
| 输入文档 | ConversationRuntime数据模板、TaskRuntime任务运行时设计、运行态真源与展示镜像边界、统一状态机与状态迁移约束、模块接口I/O契约                               |
| 研发内容 | 实现 ConversationRuntimeManager、实现 TaskRuntimeManager、实现 BackflowRecord 最小读写、实现 ChangeRequest 最小读写、实现状态迁移检查、实现运行态恢复读取 |
| 建议输出 | src-main/runtime/conversation-runtime-manager.ts, task-runtime-manager.ts, backflow-manager.ts, change-request-manager.ts                                 |
| 完成标准 | ConversationRuntime 可创建/读取/更新、TaskRuntime 可创建/读取/更新、状态迁移会被验证、展示层不能反向篡改真源                                              |

### T5 model-config-contracts

| 项目     | 内容                                                                                                                                                            |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                                                              |
| 依赖     | T1, T2, T3                                                                                                                                                      |
| 输入文档 | ModelProviderConfig产品需求、ModelProviderConfig数据结构与解析契约、模型密钥存储与导出脱敏规则                                                                  |
| 研发内容 | 实现 provider/model/binding/health-check/resolved-profile/config-state 类型、实现全局级与工作区级配置对象、实现 secretRef 引用方式、预留 runtime-state 落盘结构 |
| 建议输出 | src-main/model-config/contracts.ts, state.ts                                                                                                                    |
| 完成标准 | 模型配置对象可持久化、全局配置与工作区覆盖可区分、普通配置不含明文密钥                                                                                          |

### T6 model-profile-resolver-and-health-check

| 项目     | 内容                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                                                          |
| 依赖     | T5                                                                                                                                                          |
| 输入文档 | ModelProfileResolver与HealthCheck运行契约、ModelProviderConfig数据结构与解析契约、ModelProviderConfig产品需求                                               |
| 研发内容 | 实现 ModelProfileResolver、实现 ModelHealthCheckService、实现 binding 优先级解析、实现 blocked 规则、实现 health check 结果记录、区分配置层错误与业务层错误 |
| 建议输出 | src-main/model-config/model-profile-resolver.ts, model-health-check-service.ts, runtime-state-manager.ts                                                    |
| 完成标准 | 未配置 provider/model/key 时系统明确 blocked、已配置时能解析出完整 ResolvedModelProfile、健康检查结果可回看                                                 |

### T7 model-secret-safety

| 项目     | 内容                                                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P0                                                                                                                                     |
| 依赖     | T5, T6                                                                                                                                 |
| 输入文档 | 模型密钥存储与导出脱敏规则、SafetyAndPermissionPolicy安全与权限策略、ConfirmationPolicy用户确认策略                                    |
| 研发内容 | 实现 secrets.json 单独存储、实现 secretRef 引用解析、实现 maskedPreview、实现导出时脱敏、实现清除 secret 后 runtime-state 联动 blocked |
| 建议输出 | src-main/model-config/secret-store.ts, secret-masking.ts, export-sanitizer.ts                                                          |
| 完成标准 | 普通配置文件无明文 secret、trace 无明文 secret、logs 无明文 secret、导出工作区不带 secret 明文                                         |

### T8 artifact-index-and-artifact-service

| 项目     | 内容                                                                                                                                                                        |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                                                          |
| 依赖     | T3, T4, T12                                                                                                                                                                 |
| 输入文档 | ArtifactIndex产物索引设计、StorageLayout存储落盘结构、产物类型注册表、各环节详细字段方案                                                                                    |
| 研发内容 | 实现 ArtifactIndex 读写、实现 createArtifact、实现 updateArtifactStatus、实现 getArtifactById、实现 listArtifactsByTask、实现 resolveArtifactPath、实现正文与索引一致性检查 |
| 建议输出 | src-main/artifacts/artifact-service.ts, artifact-index-store.ts, artifact-type-registry.ts                                                                                  |
| 完成标准 | 任务能产生正文产物、产物能被索引定位、同一任务下当前有效产物状态可区分                                                                                                      |

### T9 display-trace-service

| 项目     | 内容                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                                   |
| 依赖     | T3, T4                                                                                                                                               |
| 输入文档 | DisplayTrace与AgentMemory分离设计草案、DisplayTraceEventTemplate可承载数据模板总览、运行态真源与展示镜像边界、GUIInformationArchitecture界面信息架构 |
| 研发内容 | 实现 appendDisplayTraceEvent、实现 segment 轮转、实现按 conversation/task 查询、实现 trace 摘要读取、实现关键事件类型字典                            |
| 建议输出 | src-main/trace/display-trace-service.ts, display-trace-types.ts, display-trace-query.ts                                                              |
| 完成标准 | 关键推进事件可被追加、GUI 能读取摘要 trace、trace 不能替代运行态真源                                                                                 |

### T10 domain-workflow-loader

| 项目     | 内容                                                                                                                                                                  |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                                                    |
| 依赖     | T1, T3, T12, T13（内置 workflow 不依赖 T13）                                                                                                                          |
| 输入文档 | DomainWorkflow领域流程插件设计、BuiltinCandidateDomainRegistry内置候选领域清单、插件正式Schema与校验规则、PluginLoadingAndConfig插件加载与配置                        |
| 研发内容 | 实现 loadBuiltinDomainWorkflows、实现 loadCustomDomainWorkflows、实现 validateDomainWorkflowDefinition、实现 registerDomainWorkflow、实现 resolveWorkflowByTaskDomain |
| 建议输出 | src-main/workflows/workflow-registry.ts, workflow-loader.ts, workflow-definition-validator.ts                                                                         |
| 完成标准 | taskDomain 可解析到 workflow、workflow/node/role/artifact 引用闭合、builtin 与 custom 可区分                                                                          |

### T11 workflow-runner-minimal

| 项目     | 内容                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                                                                |
| 依赖     | T4, T8, T9, T10, T12                                                                                                                                                              |
| 输入文档 | 可直接交给Code的技术实现方向、TaskRuntime任务运行时设计、WorkflowStateAndBackflow流程状态与回流机制、统一状态机与状态迁移约束                                                     |
| 研发内容 | 实现 startTaskWorkflow、实现 advanceTaskWorkflow、实现 blockTaskWorkflowNode、实现 returnTaskWorkflow、实现 completeTaskWorkflowNode、驱动 TaskRuntime/Artifact/DisplayTrace 联动 |
| 建议输出 | src-main/workflows/workflow-runner.ts, node-transition-service.ts                                                                                                                 |
| 完成标准 | 至少一个任务可推进 2-3 个节点、节点推进会更新 TaskRuntime、阻塞与回流会留下记录、产物与 trace 会同步产生                                                                          |

### T12 validation-layer-system

| 项目     | 内容                                                                                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                                                            |
| 依赖     | T1, T2, T3, T4, T5                                                                                                                                                            |
| 输入文档 | 系统级校验层约束、统一状态机与状态迁移约束、插件正式Schema与校验规则、持久化一致性与恢复规则                                                                                  |
| 研发内容 | 实现 StructureValidation、实现 StateValidation、实现 ReferenceValidation、实现 ConflictValidation、实现 SafetyValidation、实现 RecoveryValidation、统一 issueCode 和 severity |
| 建议输出 | src-main/validation/structure-validation.ts, state-validation.ts, reference-validation.ts, conflict-validation.ts, safety-validation.ts, recovery-validation.ts               |
| 完成标准 | 各模块复用统一校验层、阻断型和非阻断型校验可区分、恢复与配置问题可被统一表达                                                                                                  |

### T13 plugin-config-and-conflict-check

| 项目     | 内容                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                           |
| 依赖     | T10, T12                                                                                                                                     |
| 输入文档 | 插件正式Schema与校验规则、PluginLoadingAndConfig插件加载与配置、SafetyAndPermissionPolicy安全与权限策略                                      |
| 研发内容 | 实现 WorkspacePluginConfig 读写、实现 previewPluginImpact、实现 enablePlugin、实现 disablePlugin、实现运行中任务依赖检查、实现冲突和确认逻辑 |
| 建议输出 | src-main/plugins/plugin-config-manager.ts, plugin-impact-preview.ts, plugin-conflict-check.ts                                                |
| 完成标准 | 插件启停前可预览影响、冲突对象不会静默启用、运行中依赖对象不能被直接禁用                                                                     |

### T14 workbench-ui-minimal

| 项目     | 内容                                                                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                                               |
| 依赖     | T4, T8, T9, T11                                                                                                                                                  |
| 输入文档 | GUIInformationArchitecture界面信息架构、UI规范个人Agent工作台、UI组件详细规范表、页面线框说明书个人Agent工作台、UI开发对接清单个人Agent工作台                    |
| 研发内容 | 实现工作区/会话/任务导航、实现 Run 总览、实现节点流转区、实现时间线或关键事件区、实现右侧 NodeDetail/Artifacts/TaskRuntime/DisplayTrace 面板、实现风险与阻塞展示 |
| 建议输出 | src/ui/pages/workbench/, src/ui/components/run-overview/, src/ui/components/workflow-board/, src/ui/components/evidence-panel/                                   |
| 完成标准 | 用户能看到当前任务做到哪、能看到当前节点和产物、能看到关键 trace 摘要、界面不是普通聊天页                                                                        |

### T15 model-config-ui

| 项目     | 内容                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P1                                                                                                                                                  |
| 依赖     | T5, T6, T7                                                                                                                                          |
| 输入文档 | ModelProviderConfig产品需求、ModelProviderConfigUI模型接口配置界面与落盘设计、ModelProfileResolver与HealthCheck运行契约、模型密钥存储与导出脱敏规则 |
| 研发内容 | 实现 Providers 页、实现 Models 页、实现 Bindings 页、实现 HealthCheck 页、实现 Secrets 页、实现阻塞提示与跳转入口                                   |
| 建议输出 | src/ui/pages/model-config/, src/ui/components/provider-list/, model-list/, binding-table/, health-check-panel/, secret-form/                        |
| 完成标准 | 用户可新增 provider、可保存密钥和接口地址、可新增至少一个模型配置、可测试连接并看到失败原因、未配置时首页有明显阻塞提示                             |

### T16 agent-memory-minimal

| 项目     | 内容                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                                                      |
| 依赖     | T3, T4, T9, T12                                                                                                                         |
| 输入文档 | AgentMemory来源提交接口与内部识别设计、MemoryDecision与MemoryRecord设计、AgentMemory写入与冲突处理草案、AgentMemory会话优先读取层级设计 |
| 研发内容 | 实现 submitMemorySource、实现 queryAgentMemory、实现 notifyMemoryTurnEnd、实现 shared/role memory 读写、实现 records.jsonl 追加         |
| 建议输出 | src-main/memory/agent-memory-service.ts, memory-decision-engine.ts, memory-store.ts                                                     |
| 完成标准 | 记忆可提交、可写入 shared/role 维度、可查询、冲突可记录                                                                                 |

### T17 result-persistence-and-reuse

| 项目     | 内容                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                                                             |
| 依赖     | T8, T9, T11, T16                                                                                                                               |
| 输入文档 | ResultPersistence结果沉淀流程、SelfCheckAndAcceptance自检与验收标准、ArtifactIndex产物索引设计                                                 |
| 研发内容 | 实现 CollectFinalArtifacts、实现 ResultSummary、实现 ArtifactIndexUpdate、实现 MemorySourceSubmit、实现 TaskRuntimeClose、实现 ReuseSuggestion |
| 建议输出 | src-main/results/result-persistence-service.ts, result-summary-builder.ts, reuse-suggestion-service.ts                                         |
| 完成标准 | 任务结束后可形成正式总结、产物可被回看、结果可被复用建议引用、任务状态可正确收尾                                                               |

### T18 builtin-domain-pilots

| 项目     | 内容                                                                                                           |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                             |
| 依赖     | T10, T11, T14, T17                                                                                             |
| 输入文档 | ScenarioAcceptanceSamples场景验收样例、CurrentProductScope当前产品范围清单、09-通用任务流程/_、10-领域工作流/_ |
| 首批范围 | 已有仓库迭代、调研预研、文档整理生成                                                                           |
| 研发内容 | 为首批场景补 workflow 定义、补首批节点定义、接入角色绑定、接入必需产物类型、跑通场景最小闭环                   |
| 完成标准 | 首批代表场景可真实运行、产物/回流/状态/trace 可回看、未通过的领域保持 candidate 状态                           |

### T19 visual-testing-and-acceptance

| 项目     | 内容                                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 优先级   | P2                                                                                                                                                          |
| 依赖     | T14, T15, T18                                                                                                                                               |
| 输入文档 | VisualTestingScope可视化测试职责与目标、ProductAcceptanceChecklist产品验收清单、ScenarioAcceptanceSamples场景验收样例、SelfCheckAndAcceptance自检与验收标准 |
| 研发内容 | 建立 Run 总览可视化检查、建立节点流转与证据检查、建立产物面板检查、建立模型配置阻塞场景检查、建立恢复与一致性检查、建立失败回流检查                         |
| 建议输出 | tests/integration/, tests/visual/, tests/recovery/, tests/model-config/, 验收脚本或验收清单                                                                 |
| 完成标准 | 代表场景可验收、UI 关键路径可观察、恢复和配置问题可复现可定位、产品验收有可执行检查清单                                                                     |

---

## 9. 推荐执行顺序

### 五阶段总览

```
第一阶段（M1 主体）：
  T0 → T1 / T2（可并行） → T3 → T4

第二阶段（M1 补充，模型配置运行前提）：
  T5 → T6 → T7

第三阶段（M2，任务与产物闭环）：
  T12 → T8 / T9（可并行） → T10 → T11

第四阶段（M3，工作台与配置页）：
  T13 → T14 / T15（可并行）

第五阶段（M4，扩展与继续能力）：
  T16 → T17 → T18 → T19
```

### 并行边界

**可以并行**：

- T1 与 T2 可并行起草后合并
- T8 与 T9 可在 T4 完成后并行
- T14 与 T15 可在对应后端契约稳定后并行

**不建议并行**：

- T4（TaskRuntimeManager）未冻结前，不建议直接写 T11
- T5-T7 未完成前，不建议把依赖模型的核心流程当作"可运行"
- T12 未建立前，不建议各模块各写一套校验
- T13 未完成前，不建议 plugin enable/disable 逻辑大规模展开
- ArtifactIndex 未冻结前，不建议 artifacts 面板和正文生成同时大规模展开

---

## 10. M1 实施记录

### 新增文件清单

**src-main/contracts/**

- `types.ts` — 17 个核心对象 TypeScript 类型定义
- `status.ts` — 5 类状态枚举 + 合法迁移映射 + isValidTransition()

**src-main/validation/**

- `types.ts` — ValidationIssue / ValidationResult
- `structure.ts` — 结构校验（Workspace/Conversation/Task/Artifact）
- `state-transition.ts` — 状态迁移校验（5 类）
- `reference.ts` — 引用完整性校验

**src-main/errors/**

- `error-codes.ts` — 40+ 错误码枚举
- `unified-error.ts` — UnifiedError + createError()
- `result.ts` — Result<T> + ok() / err()
- `from-validation.ts` — 校验→错误转换
- `from-storage.ts` — 存储→错误转换

**src-main/storage/**

- `path-resolver.ts` — 工作区路径解析器
- `json-store.ts` — JSON 原子读写（write-to-temp + rename）
- `jsonl-store.ts` — JSONL 追加写入
- `workspace-manager.ts` — 工作区初始化/读写/恢复

**src-main/runtime/**

- `conversation-runtime-manager.ts` — 会话 CRUD + 状态迁移校验
- `task-runtime-manager.ts` — 任务 CRUD + 状态迁移校验
- `backflow-manager.ts` — 回流记录 JSONL
- `change-request-manager.ts` — 变更请求 JSONL

**src-main/model-config/**

- `contracts.ts` — Provider/Model/Binding/SecretRef/ResolvedProfile 等 10 个类型
- `state.ts` — 配置状态判断
- `secret-store.ts` — 密钥独立存储
- `secret-masking.ts` — 掩码预览
- `export-sanitizer.ts` — 导出脱敏
- `model-profile-resolver.ts` — 配置解析器（工作区级 > 全局级）
- `model-health-check-service.ts` — 健康检查服务
- `runtime-state-manager.ts` — 运行时状态管理

**src/**

- `electron-api.d.ts` — Window.agentAPI 类型声明

**tests/**

- `contracts/status.test.ts` — 状态迁移校验测试（10 用例通过）

### 修改文件清单

- `electron/preload.ts` — 从暴露原始 ipcRenderer 改为安全的 agentAPI 窄接口
- `electron/main.ts` — 集成所有业务模块 + 注册 IPC handler
- `src/main.ts` — 从 window.ipcRenderer 改为 window.agentAPI
- `tsconfig.json` — 移除 electron 目录（避免 vue-tsc 冲突）
- `tsconfig.node.json` — 增加 src-main/**/\* 和 electron/**/\*
- `package.json` — 添加 test / test:watch 脚本

### 验证结果

- `vue-tsc --noEmit` 类型检查通过
- `vitest run` 10 个测试全部通过

---

## 11. 产品验收清单（来源：产品验收清单文档）

### 核心验收目标

1. **产品定位验收**：产品是个人工作台而不是聊天工具
2. **任务推进验收**：复杂任务能进入明确流程，失败后能回到合适节点
3. **结果可见性验收**：用户能找到任务状态、当前节点、已有产物
4. **记忆与继续能力验收**：继续任务时不需要反复解释背景
5. **少确认但可控验收**：低风险默认推进，高风险明确提醒
6. **扩展能力理解验收**：用户能理解角色/流程/skill 可扩展，候选能力不被伪装成稳定默认
7. **基础运行配置验收**：用户能在 GUI 中配置模型接口并测试连接

### 最低通过信号

- 用户愿意把复杂任务交给工作台持续推进
- 用户能明显减少重复解释背景
- 用户会主动回看任务状态、产物和 trace
- 用户能在中断后继续，而不是重开一遍
- 用户把它理解成工作台，而不是聊天工具

---

## 12. 维护规则

- 新文档放入 `docs/` 目录
- 每个里程碑完成后更新本文档的状态表
- 设计文档变更时，同步更新本文档的对应章节
- 任务状态变化时更新第 7 节的任务总表
- 产品验收清单变更时同步更新第 11 节
- 项目与需求文档的最新对照结果见 `docs/requirement-match-review-2026-05-25.md`
