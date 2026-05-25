# 工作台 UX 改造开发交付包（2026-05-25）

> 用途：
> 直接交付给开发团队进行拆分、排期、实现与联调
>
> 依赖文档：
> `docs/workbench-ux-alignment-and-execution-plan-2026-05-25.md`
> `docs/workbench-ux-dev-implementation-spec-2026-05-25.md`

---

## 1. 交付范围

本交付包覆盖以下改造：

1. 模型配置应用级化
2. 插件管理应用级化
3. `Return to Node` bug 修复
4. 工作区首页续作化
5. Quick Input 草案确认
6. 工作台主界面产品化
7. 模型配置向导化
8. 结果页总结化
9. DeepSeek / MiMo 内置 provider 支持
10. 模型调用统一流式能力抽象

---

## 2. 任务分组

建议分成 4 组并行推进：

1. `A组：主进程与存储`
2. `B组：IPC 与前端桥接`
3. `C组：页面与交互`
4. `D组：测试与迁移`

---

## 3. 任务清单

## A组：主进程与存储

### A-1 新增应用级路径解析器

目标：
提供应用级配置根路径，脱离 workspaceRootPath。

输出：

- `src-main/storage/app-path-resolver.ts`

要求：

1. 基于 `app.getPath('userData')`
2. 提供：
   - `model-config.json`
   - `secrets.json`
   - `plugin-registry.json`
   - `preferences.json`
3. 具备目录创建能力

依赖：
无

验收：

1. 单测通过
2. 不影响现有 `PathResolver`

---

### A-2 应用级模型配置存储与读取

目标：
提供应用级模型配置读写能力。

输出：

- 更新 `src-main/model-config/contracts.ts`
- 更新 `src-main/model-config/model-config-manager.ts`
- 新增 `src-main/model-config/provider-presets.ts`

要求：

1. 支持 `AppModelConfig`
2. 支持 `WorkspaceModelOverride`
3. 支持 Provider preset
4. 支持默认 Provider / 默认 Model
5. 支持应用级 secret store

依赖：

- A-1

验收：

1. 可读写应用级配置
2. 可读写应用级 secrets
3. DeepSeek / MiMo preset 可读取

---

### A-3 应用级插件库与工作区覆盖结构

目标：
将插件库提升为应用级，并预留工作区 override。

输出：

- 更新 `src-main/plugins/plugin-config-manager.ts`
- 如需要可拆：
  - `app-plugin-registry-manager.ts`
  - `workspace-plugin-override-manager.ts`

要求：

1. 应用级插件库可读写
2. 工作区插件覆盖结构预留
3. 全局冲突检查可运行

依赖：

- A-1

验收：

1. 无工作区时仍能管理插件
2. 工作区 override 不阻塞本轮主功能

---

### A-4 模型调用统一能力层

目标：
提供 stream / blocking 双模式模型调用抽象。

输出：

- `src-main/model-runtime/contracts.ts`
- `src-main/model-runtime/model-invoke-service.ts`
- `src-main/model-runtime/provider-adapters/openai-compatible-adapter.ts`
- 视需要新增 `anthropic-compatible-adapter.ts`

要求：

1. 支持统一 `ModelInvokeInput`
2. 支持统一 `ModelStreamEvent`
3. 支持 provider `supportsStreaming`
4. 支持 blocking 降级

依赖：

- A-2

验收：

1. DeepSeek / MiMo preset 可进入统一调用层
2. 流式事件结构可输出

---

### A-5 `Return to Node` 输入契约修复

目标：
修正回流参数命名。

输出：

- 更新 `src-main/workflows/workflow-runner.ts`
- 更新 `electron/main.ts`

要求：

1. 前后统一使用 `toNodeId`
2. 不接受 `targetNodeId` 作为新约定

依赖：
无

验收：

1. 回流功能可用
2. 集成测试通过

---

### A-6 模型配置迁移

目标：
把旧工作区模型配置迁移到应用级配置。

输出：

- 更新 `src-main/model-config/model-config-manager.ts`

要求：

1. 若应用级配置不存在，则尝试从最近工作区迁移
2. 不删除旧文件
3. 迁移失败不阻塞

依赖：

- A-2

验收：

1. 迁移可重复执行
2. 不重复导入

---

### A-7 插件配置迁移

目标：
把旧工作区插件配置迁移到应用级插件库。

输出：

- 更新 `src-main/plugins/plugin-config-manager.ts`

要求：

1. 应用级插件库为空时尝试迁移
2. 不删除旧文件
3. 不重复导入

依赖：

- A-3

验收：

1. 迁移成功后应用级插件页可见历史插件

---

## B组：IPC 与前端桥接

### B-1 应用级模型配置 IPC

目标：
补齐 `app-model-config:*` IPC。

输出：

- 更新 `electron/main.ts`
- 更新 `electron/preload.ts`
- 更新 `src/electron-api.d.ts`

要求：

1. 补齐应用级模型配置所有接口
2. 旧接口保留但标记 deprecated

依赖：

- A-2

验收：

1. 前端能调用应用级模型配置接口
2. 类型声明完整

---

### B-2 应用级插件库 IPC

目标：
补齐 `app-plugin:*` IPC。

输出：

- 更新 `electron/main.ts`
- 更新 `electron/preload.ts`
- 更新 `src/electron-api.d.ts`

要求：

1. 补齐应用级插件管理接口
2. 旧插件接口保留但标记 deprecated

依赖：

- A-3

验收：

1. 前端能在无工作区时调用插件管理接口

---

### B-3 任务草案启动 IPC

目标：
把理解输入与正式启动拆成两步。

输出：

- 更新 `electron/main.ts`
- 更新 `electron/preload.ts`
- 更新 `src/electron-api.d.ts`

要求：

1. 新增 `task-draft:start`
2. `understandInput()` 只负责理解
3. 启动任务由新接口负责

依赖：

- A-4 可选
- A-2 无强依赖

验收：

1. 前端可先取草案再启动

---

## C组：页面与交互

### C-1 模型配置页改造

目标：
无工作区可用，向导优先，preset 驱动。

输出：

- 更新 `src/pages/ModelConfigPage.vue`

要求：

1. 去掉 `hasActiveWorkspace` 阻塞
2. 使用应用级模型配置接口
3. 支持 OpenAI / Anthropic / DeepSeek / MiMo / 自定义
4. 普通路径不要求手写 provider id / model id
5. 高级配置折叠

依赖：

- B-1

验收：

1. 无工作区时可完成配置
2. DeepSeek / MiMo 可直接选择

---

### C-2 插件管理页改造

目标：
无工作区可用，改为应用级插件库心智。

输出：

- 更新 `src/pages/PluginManagePage.vue`

要求：

1. 去掉 `hasActiveWorkspace` 阻塞
2. 使用应用级插件接口
3. 页面文案改成“全局能力库”

依赖：

- B-2

验收：

1. 无工作区时可管理插件

---

### C-3 首页续作化

目标：
首页第一屏提供继续任务、处理阻塞、开始新任务。

输出：

- 更新 `src/pages/WorkspaceIndexPage.vue`

要求：

1. 聚合最近任务
2. 聚合阻塞任务
3. 明确主操作入口

依赖：

- 现有 `workspace:recent-tasks`
- 现有 `workspace:blocked-tasks`

验收：

1. 首页第一屏不再只是目录列表

---

### C-4 Quick Input 草案确认

目标：
增加草案确认层。

输出：

- 更新 `src/pages/WorkbenchPage.vue`
- 更新 `src/composables/useWorkbenchData.ts`

要求：

1. 先调用 `understandInput()`
2. 展示草案
3. 用户确认后调用 `task-draft:start`

依赖：

- B-3

验收：

1. 输入任务不会直接启动

---

### C-5 工作台主界面产品化

目标：
默认展示任务、进展、下一步、产出。

输出：

- 更新 `src/pages/WorkbenchPage.vue`

要求：

1. 内部术语降级
2. `Resume` / `Advance` 语义拆开
3. 增加“技术详情”区域

依赖：

- A-5

验收：

1. 第一屏更偏用户语义

---

### C-6 结果页总结化

目标：
完成态优先展示总结与继续。

输出：

- 更新 `src/pages/ResultsPage.vue`

要求：

1. 增加总结区
2. 增加“基于此结果继续”

依赖：

- 现有结果接口

验收：

1. 结果页具备继续入口

---

## D组：测试与迁移

### D-1 单元测试补齐

必须补：

1. `app-path-resolver.test.ts`
2. `app-model-config-manager.test.ts`
3. `app-plugin-registry.test.ts`
4. `model-config-migration.test.ts`
5. `plugin-config-migration.test.ts`
6. `workflow-return-to-node-contract.test.ts`

---

### D-2 集成测试补齐

必须补：

1. 无工作区进入模型配置页
2. 无工作区进入插件管理页
3. 应用级模型配置后新工作区可直接使用
4. Quick Input 草案确认链路
5. 首页继续任务链路
6. 首页处理阻塞链路
7. 回流链路

---

### D-3 手工回归清单

必须走：

1. 首次启动 -> 配置模型 -> 创建工作区
2. 首次启动 -> 插件管理 -> 安装插件 -> 创建工作区
3. 进入旧工作区 -> 检查迁移是否生效
4. 新建任务 -> 草案 -> 启动
5. 完成任务 -> 结果页 -> 基于结果继续

---

## 4. 依赖关系

建议依赖顺序：

1. `A-1`
2. `A-2` / `A-3` 并行
3. `B-1` / `B-2`
4. `A-4`
5. `A-5`
6. `B-3`
7. `C-1` / `C-2`
8. `C-3` / `C-4` / `C-5`
9. `C-6`
10. `A-6` / `A-7`
11. `D-1` / `D-2` / `D-3`

---

## 5. 排期建议

如果按 2 名前端 + 2 名主进程 + 1 名测试估算，建议拆为三阶段：

### 第一阶段

1. 应用级路径
2. 应用级模型配置
3. 应用级插件库
4. `Return to Node` 修复

### 第二阶段

1. 模型配置页
2. 插件管理页
3. 首页续作化
4. Quick Input 草案确认

### 第三阶段

1. 工作台主界面产品化
2. 结果页总结化
3. 迁移
4. 回归测试

---

## 6. 交付标准

开发完成后，必须同时交付：

1. 代码实现
2. IPC 类型同步
3. 迁移逻辑
4. 单元测试
5. 集成测试
6. 手工验收记录

---

## 7. 最终判断标准

开发过程中，每次评审都用这三个问题判断是否做对：

1. 这个能力在没有工作区时是否也应该可用？
2. 这个页面第一眼是否在讲“任务”，而不是讲“引擎对象”？
3. 这个交互是否让用户知道下一步该做什么？

如果答案分别是：

```text
是
是
是
```

则方向基本正确。否则要回到规格文档重新对齐。
