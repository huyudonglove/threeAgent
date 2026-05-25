# 工作台 UX 对齐与开发执行文档（更新版，2026-05-25）

> 对齐来源：
> `docs/workbench-ux-diagnosis-and-refactor-direction-2026-05-25.md`
>
> 文档目的：
> 将最新产品版本与当前代码状态重新对齐，输出一份开发可直接执行的改造文档。

---

## 1. 本次更新后的核心结论

这次产品修改不是普通的交互微调，而是明确了新的产品边界：

```text
工作区是业务容器；
模型配置和插件管理是应用级公共能力；
工作台负责承接任务推进，而不是暴露内部引擎对象。
```

因此，本轮开发不应再把模型配置和插件管理继续绑定在当前 active workspace 上，也不应继续按“工作区里的技术控制台”去扩展主界面。

一句话结论：

```text
当前项目需要从“工作区中心的内部控制台”升级为
“应用级能力 + 工作区级任务数据 + 用户导向工作台”的产品结构。
```

---

## 2. 本次对齐范围

本次已对齐以下内容：

- `docs/workbench-ux-diagnosis-and-refactor-direction-2026-05-25.md`
- `docs/workbench-ux-alignment-and-execution-plan-2026-05-25.md`（上一版执行稿）
- `docs/development-plan.md`
- `docs/recheck-findings-2026-05-25.md`
- `docs/requirement-match-review-2026-05-25.md`
- `src/pages/WorkbenchPage.vue`
- `src/pages/WorkspaceIndexPage.vue`
- `src/pages/ModelConfigPage.vue`
- `src/pages/PluginManagePage.vue`
- `src/pages/ResultsPage.vue`
- `src/composables/useWorkbenchData.ts`
- `src/composables/useActiveWorkspace.ts`
- `src/router/index.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/electron-api.d.ts`
- `src-main/runtime/input-understanding-service.ts`
- `src-main/workflows/workflow-runner.ts`
- `src-main/model-config/model-config-manager.ts`
- `src-main/plugins/plugin-config-manager.ts`
- `src-main/storage/path-resolver.ts`
- `src-main/storage/workspace-manager.ts`

---

## 3. 对齐后的现状判断

## 3.1 仍然成立的“已实现项”

以下内容已经存在，不应重复从零建设：

1. 已有工作区首页。
   - 路由根路径跳转到 `/workspaces`
   - `WorkspaceIndexPage.vue` 已提供最近工作区入口

2. 已有模型未配置阻塞卡片。
   - `WorkbenchPage.vue` 已有 `isModelConfigured`

3. `Resume` 已基本符合“恢复现场”语义。
   - `resumeTask()` 只恢复上下文与任务，不直接推进 workflow

4. 工作区创建闭环已存在。
   - 非工作区目录可在工作台内触发创建

5. 工作区首页聚合能力已有部分基础。
   - `WorkspaceManager` 已支持最近任务、阻塞任务等聚合查询方法

## 3.2 仍然成立的 UX 问题

以下问题依然成立：

1. 工作台仍然太像内部运行控制台。
2. 第一层信息仍然以 `Run / Node / Trace / Artifact / Runtime` 为中心。
3. Quick Input 仍然直接启动任务，缺少草案确认层。
4. 首页还不是“继续上次工作”的续作首页。
5. 结果页还没有收口成“任务总结页”。

## 3.3 新版产品下新增升级的边界问题

这是本次更新最重要的变化。

### A. 模型配置边界与新版产品冲突

当前代码现状：

1. `ModelConfigPage.vue` 依赖 `useActiveWorkspace()`
2. 无工作区时页面直接提示：
   - “请先在工作台中选择一个工作区，模型配置将关联到该工作区。”
3. `ModelConfigManager` 通过 `PathResolver(workspaceRootPath)` 将配置写入：
   - `.agent-workspace/model-config/global-config.json`
4. Secret 也依赖工作区路径存储

新版产品要求：

```text
模型配置 = 应用级公共能力
工作区覆盖 = 高级能力
```

结论：

```text
当前模型配置的数据边界、页面入口和使用心智都与新版产品不一致。
```

### B. 插件管理边界与新版产品冲突

当前代码现状：

1. `PluginManagePage.vue` 依赖 `useActiveWorkspace()`
2. 无工作区时页面直接提示：
   - “请先在工作台中选择一个工作区，插件管理将关联到该工作区。”
3. `PluginConfigManager` 当前读写的是工作区级：
   - `.agent-workspace/domains/plugin-config.json`

新版产品要求：

```text
插件管理 = 应用级能力库
工作区插件启用策略 = 工作区级覆盖
```

结论：

```text
当前插件管理的数据边界、页面入口和配置心智都与新版产品不一致。
```

### C. `Return to Node` 仍是明确 bug

当前代码仍存在：

- 前端发送 `targetNodeId`
- `workflow-runner.ts` 真实契约要求 `toNodeId`

这仍然必须保留在 P0。

---

## 4. 新版产品下的目标架构边界

后续开发需统一采用以下边界：

## 4.1 应用级能力

应用级能力应独立于工作区存在，推荐包括：

1. 模型配置
2. 插件管理
3. 全局偏好设置
4. 最近工作区 / 最近任务入口索引

## 4.2 工作区级数据

工作区应主要承载业务运行数据，推荐包括：

1. 工作区 manifest
2. 会话
3. 任务运行态
4. 工作流上下文
5. 产物
6. Trace
7. 记忆
8. 结果沉淀
9. 工作区级覆盖策略

## 4.3 覆盖关系

推荐按以下顺序解析：

### 模型配置

```text
工作区模型覆盖 -> 应用级默认模型配置 -> 未配置
```

### 插件配置

```text
工作区插件覆盖 -> 应用级插件默认配置 -> 内置默认能力
```

默认 UI 只强调应用级配置，工作区覆盖放到高级设置。

---

## 5. 本轮改造目标

本轮不是简单优化文案，而是完成三件事：

1. 把产品边界改对。
2. 把主流程改成用户可理解。
3. 把已有底层能力重新包装成产品，而不是继续暴露内部对象。

目标状态：

```text
启动应用
  -> 进入工作区首页
  -> 继续最近任务 / 处理阻塞 / 开始新任务
  -> 模型配置和插件管理始终可独立进入
  -> 输入任务后先生成任务草案
  -> 用户确认后正式启动
  -> 执行中以任务、进展、下一步、产出为主
  -> 技术对象收纳到高级详情
  -> 完成后进入任务总结页，并支持继续
```

---

## 6. 本轮改造边界

## 6.1 要做

1. 修正模型配置为应用级能力。
2. 修正插件管理为应用级能力。
3. 修复 `Return to Node` 参数 bug。
4. 改首页为续作首页。
5. 改工作台信息架构和按钮语义。
6. 增加任务草案确认层。
7. 改模型配置首用体验。
8. 改结果页为任务总结页。

## 6.2 不做

1. 不推翻现有 workflow runner、artifact、trace、memory 主体结构。
2. 不在本轮删除工作区覆盖能力，只将其降级为高级能力。
3. 不在本轮全面重写所有领域 workflow。

---

## 7. 开发任务拆解

## P0：先把边界和主链路修正确

### P0-1 修复 `Return to Node` 参数契约

目标：
修复真实功能 bug，确保回流操作可用。

当前现状：

- `WorkbenchPage.vue` 发送 `targetNodeId`
- `workflow-runner.ts` 需要 `toNodeId`

开发动作：

1. 统一前端、preload、IPC、运行器契约。
2. 推荐统一命名为 `toNodeId`。
3. 同步修改：
   - `src/pages/WorkbenchPage.vue`
   - `electron/preload.ts`
   - `src/electron-api.d.ts`
   - `electron/main.ts`
   - 相关测试

验收标准：

1. 回流操作可成功执行。
2. 当前节点进入 backflow。
3. 目标节点正确进入 running。

---

### P0-2 把模型配置从“工作区依赖”改为“应用级能力”

目标：
让用户在没有工作区时也能完成模型配置，并让所有工作区默认复用。

当前冲突：

1. `ModelConfigPage.vue` 依赖 active workspace
2. `ModelConfigManager` 当前存储落在工作区目录

开发动作：

1. 抽象应用级 model config 存储位置。
2. 新增应用级 model config manager 读写路径。
3. 保留工作区覆盖能力，但移动为高级能力。
4. 页面上移除“请先选择工作区”的阻塞。
5. 工作台检查模型时改为：
   - 先查工作区覆盖
   - 再查应用级默认配置

建议数据落点：

```text
app model config
app secrets
workspace model override
```

建议涉及文件：

- `src-main/model-config/model-config-manager.ts`
- `src-main/storage/path-resolver.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/electron-api.d.ts`
- `src/pages/ModelConfigPage.vue`
- `src/composables/useWorkbenchData.ts`

验收标准：

1. 无工作区时可进入并完成模型配置。
2. 配置完成后，新建工作区无需重复配置。
3. 工作台能正确识别应用级默认模型是否可用。

---

### P0-3 把插件管理从“工作区依赖”改为“应用级能力库”

目标：
让插件管理成为应用级能力入口，工作区只负责是否启用覆盖。

当前冲突：

1. `PluginManagePage.vue` 依赖 active workspace
2. `PluginConfigManager` 当前写工作区级 `plugin-config.json`

开发动作：

1. 拆出应用级插件库配置。
2. 保留工作区插件覆盖策略，但从插件管理页主流程中移除。
3. 插件管理页支持无工作区访问。
4. 页面文案改为：
   - 管理 AgentThee 的全局插件能力
   - 工作区内是否启用作为后续高级设置

建议数据落点：

```text
app plugin registry
app default enablement
workspace plugin override
```

建议涉及文件：

- `src-main/plugins/plugin-config-manager.ts`
- `src-main/storage/path-resolver.ts`
- `electron/main.ts`
- `electron/preload.ts`
- `src/electron-api.d.ts`
- `src/pages/PluginManagePage.vue`

验收标准：

1. 无工作区时也可查看、添加、删除、启停插件。
2. 插件管理不再提示“请先选择工作区”。
3. 工作区覆盖逻辑保留，但从主页面流程中下沉。

---

### P0-4 把工作区首页改成续作首页

目标：
让首页成为“回来继续做事”的入口，而不是目录列表页。

当前现状：

- `WorkspaceIndexPage.vue` 已有工作区列表
- `WorkspaceManager` 已有最近任务、阻塞任务查询基础

开发动作：

1. 首页第一屏展示：
   - 继续上次任务
   - 需要你处理
   - 开始新任务
2. 工作区卡片保留，但降级为基础入口。
3. 利用已有 recent task / blocked task 聚合接口补首页内容。

建议涉及文件：

- `src/pages/WorkspaceIndexPage.vue`
- `electron/main.ts`
- `src-main/storage/workspace-manager.ts`

验收标准：

1. 用户从首页能直接继续任务或处理阻塞。
2. 首页不再只是目录索引。

---

### P0-5 增加任务草案确认层

目标：
把“输入一句话”与“正式启动流程”拆开。

当前现状：

- Quick Input 直接 `understandAndStart()`

开发动作：

1. 增加任务草案 DTO。
2. UI 先展示理解结果，再确认启动。
3. 草案至少包括：
   - 标题
   - 类型
   - 推荐 workflow
   - 预计步骤
   - 可能的确认点

建议涉及文件：

- `src/pages/WorkbenchPage.vue`
- `src/composables/useWorkbenchData.ts`
- `src-main/runtime/input-understanding-service.ts`
- `electron/main.ts`

验收标准：

1. 输入任务后先看到任务草案。
2. 用户确认后才真正创建任务。

---

## P1：把主界面做成产品，而不是研发页

### P1-1 工作台第一层改成用户对象

目标：
工作台默认只展示：

1. 当前任务
2. 当前进展
3. 下一步
4. 已有产出

开发动作：

1. 第一层去 internal terms。
2. 第二层用“技术详情”收纳 runtime / trace / memory / risk。
3. 推荐文案映射：

| 当前表达 | 新表达 |
| --- | --- |
| Run overview | 任务概览 |
| Workflow board | 任务步骤 |
| Execution timeline | 最近进展 |
| Evidence panel | 详情 |
| Artifact | 产出 |
| Trace | 过程记录 |
| TaskRuntime / Memory / Risk | 技术详情 |

建议涉及文件：

- `src/pages/WorkbenchPage.vue`

验收标准：

1. 用户无需理解 node/runtime 才能使用工作台。
2. 调试能力仍可通过“技术详情”访问。

---

### P1-2 改主操作按钮语义

目标：
让操作围绕用户目标，而不是 workflow 状态机。

建议映射：

| 当前按钮 | 建议按钮 |
| --- | --- |
| Resume | 继续任务 |
| Advance | 继续执行 |
| Complete Node | 标记这一步完成 |
| Block Node | 需要我处理 |
| Return to Node | 重新处理上一步 |

验收标准：

1. “继续任务”和“继续执行”明确分离。
2. 用户仅靠按钮文案即可理解动作。

---

### P1-3 把模型配置改成 3 步向导

注意：
此任务在新版产品下仍成立，但前提已经变成“应用级模型配置”。

目标：

1. 选择服务商
2. 填 API Key / Base URL
3. 选择默认模型并测试连接

高级配置折叠：

1. 角色绑定
2. 调用类型绑定
3. 工作区覆盖
4. 多 Provider 策略

验收标准：

1. 无工作区时也能完整配置。
2. 新用户 3 步内完成最小可用配置。

---

### P1-4 顶层文案与页面语言统一

目标：
统一中文主流程表达，去掉“验收说明感”。

建议涉及文件：

- `src/App.vue`
- `src/pages/WorkbenchPage.vue`
- `src/pages/ModelConfigPage.vue`
- `src/pages/PluginManagePage.vue`
- `src/pages/ResultsPage.vue`

验收标准：

1. 主流程不再中英文混用。
2. 页面文案围绕“任务、进展、阻塞、结果、技术详情”。

---

## P2：补完整收口和真实闭环

### P2-1 结果页改成任务总结页

目标：
完成态优先回答：

1. 本次完成了什么
2. 产出了什么
3. 还缺什么
4. 风险是什么
5. 下一步做什么

开发动作：

1. 增加“基于此结果继续”入口。
2. 弱化底层 artifact id 暴露。

建议涉及文件：

- `src/pages/ResultsPage.vue`
- `src-main/results/*`

---

### P2-2 跑通一个真实执行场景

建议首个场景：

```text
已有代码仓库迭代
```

目标：
让用户感知 Agent 真的在执行，而不是只流转状态。

---

## 8. 文件级开发落点

### 前端

- `src/pages/WorkspaceIndexPage.vue`
- `src/pages/WorkbenchPage.vue`
- `src/pages/ModelConfigPage.vue`
- `src/pages/PluginManagePage.vue`
- `src/pages/ResultsPage.vue`
- `src/App.vue`
- `src/composables/useWorkbenchData.ts`
- `src/composables/useActiveWorkspace.ts`
- `src/electron-api.d.ts`

### 主进程 / 存储 / 运行时

- `electron/main.ts`
- `electron/preload.ts`
- `src-main/model-config/model-config-manager.ts`
- `src-main/plugins/plugin-config-manager.ts`
- `src-main/storage/path-resolver.ts`
- `src-main/storage/workspace-manager.ts`
- `src-main/runtime/input-understanding-service.ts`
- `src-main/workflows/workflow-runner.ts`

### 视需要新增

- 应用级配置存储路径解析器
- 应用级 model config store
- 应用级 plugin registry
- workspace override store
- 任务草案 DTO / 确认接口
- 技术详情面板组件

---

## 9. 推荐实施顺序

建议按以下顺序实施：

1. P0-1 修复 `Return to Node` 参数 bug
2. P0-2 模型配置提升为应用级能力
3. P0-3 插件管理提升为应用级能力库
4. P0-4 首页改为续作首页
5. P0-5 增加任务草案确认层
6. P1-1 / P1-2 改工作台信息架构和按钮语义
7. P1-3 改模型配置向导
8. P1-4 统一整体文案
9. P2-1 / P2-2 做结果页收口和真实执行闭环

原因：

```text
先修边界，
再修入口和主链路，
最后做产品打磨与真实闭环。
```

---

## 10. 验收清单

本轮改造完成后，至少满足以下标准：

1. 模型配置在没有工作区时也可完整使用。
2. 插件管理在没有工作区时也可完整使用。
3. 工作区只承载任务数据与覆盖策略，不再承担应用级公共能力主配置。
4. 首页第一屏能直接继续任务、处理阻塞、开始新任务。
5. 用户输入任务后先看到草案，再确认启动。
6. 工作台第一屏主要展示任务、进展、下一步、产出。
7. `Return to Node` 不再受参数名 bug 阻塞。
8. 结果页能作为任务总结与继续入口。

---

## 11. 给开发的直接说明

新版产品下，最容易做错的地方有两个：

1. 继续沿着工作区路径存应用级配置。
2. 继续把内部对象直接堆到工作台第一层。

这轮开发的正确口径是：

```text
应用级能力独立出来，
工作区回到业务容器角色，
工作台围绕任务推进来组织信息。
```

一句话执行原则：

```text
用户看到的是任务、进展、阻塞和结果；
应用负责提供模型和插件能力；
工作区负责承载任务运行数据和覆盖策略。
```
