# 工作台 UX 改造研发任务单（2026-05-25）

> 用途：
> 直接发给研发团队做任务拆分、排期和执行跟踪
>
> 关联文档：
> `docs/workbench-ux-dev-implementation-spec-2026-05-25.md`
> `docs/workbench-ux-dev-handoff-package-2026-05-25.md`

---

## 1. 使用说明

本任务单按开发分组拆分：

1. `MAIN`：主进程 / 存储 / 运行时
2. `BRIDGE`：IPC / preload / 类型
3. `FE`：前端页面与交互
4. `QA`：测试与迁移验证

状态建议统一使用：

```text
todo
in_progress
blocked
review
done
```

---

## 2. P0 任务单

| 编号 | 组别 | 任务 | 主要输出 | 依赖 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P0-MAIN-01 | MAIN | 新增应用级路径解析器 | `src-main/storage/app-path-resolver.ts` | 无 | 可解析 `model-config.json`、`secrets.json`、`plugin-registry.json`、`preferences.json` | todo |
| P0-MAIN-02 | MAIN | 模型配置应用级化 | 更新 `model-config-manager.ts`、`contracts.ts`、新增 `provider-presets.ts` | P0-MAIN-01 | 无工作区时可读写应用级模型配置 | todo |
| P0-MAIN-03 | MAIN | 插件库应用级化 | 更新 `plugin-config-manager.ts`，必要时拆分 app/workspace manager | P0-MAIN-01 | 无工作区时可读写应用级插件库 | todo |
| P0-MAIN-04 | MAIN | `Return to Node` 契约修复 | 更新 `workflow-runner.ts`、`electron/main.ts` | 无 | 前后统一使用 `toNodeId` | todo |
| P0-MAIN-05 | MAIN | 模型配置迁移逻辑 | 更新 `model-config-manager.ts` | P0-MAIN-02 | 旧工作区模型配置可迁移到应用级 | todo |
| P0-MAIN-06 | MAIN | 插件配置迁移逻辑 | 更新 `plugin-config-manager.ts` | P0-MAIN-03 | 旧工作区插件配置可迁移到应用级 | todo |
| P0-MAIN-07 | MAIN | 任务草案启动接口 | 更新 `electron/main.ts`、输入理解启动链路 | P0-MAIN-02 | 支持 `task-draft:start` | todo |
| P0-BRIDGE-01 | BRIDGE | 应用级模型配置 IPC | 更新 `electron/main.ts`、`electron/preload.ts`、`src/electron-api.d.ts` | P0-MAIN-02 | 暴露 `app-model-config:*` 接口 | todo |
| P0-BRIDGE-02 | BRIDGE | 应用级插件库 IPC | 更新 `electron/main.ts`、`electron/preload.ts`、`src/electron-api.d.ts` | P0-MAIN-03 | 暴露 `app-plugin:*` 接口 | todo |
| P0-BRIDGE-03 | BRIDGE | 任务草案 IPC | 更新 `preload.ts`、`src/electron-api.d.ts` | P0-MAIN-07 | 支持前端先理解再启动 | todo |
| P0-BRIDGE-04 | BRIDGE | 标记旧接口 deprecated | 更新 `preload.ts`、`src/electron-api.d.ts` | P0-BRIDGE-01, P0-BRIDGE-02 | 新旧接口边界清晰 | todo |
| P0-FE-01 | FE | 模型配置页脱离工作区 | 更新 `src/pages/ModelConfigPage.vue` | P0-BRIDGE-01 | 无工作区时可打开和保存 | todo |
| P0-FE-02 | FE | 插件管理页脱离工作区 | 更新 `src/pages/PluginManagePage.vue` | P0-BRIDGE-02 | 无工作区时可查看/安装/删除插件 | todo |
| P0-FE-03 | FE | 首页续作化 | 更新 `src/pages/WorkspaceIndexPage.vue` | 现有 recent/block task 接口 | 首页第一屏可继续任务/处理阻塞/开始新任务 | todo |
| P0-FE-04 | FE | Quick Input 草案确认 | 更新 `src/pages/WorkbenchPage.vue`、`useWorkbenchData.ts` | P0-BRIDGE-03 | 输入任务后先显示草案，再确认启动 | todo |
| P0-FE-05 | FE | 回流按钮契约同步 | 更新 `src/pages/WorkbenchPage.vue` | P0-MAIN-04, P0-BRIDGE-04 | 页面发送 `toNodeId` | todo |
| P0-QA-01 | QA | 应用级路径与模型配置单测 | 新增测试文件 | P0-MAIN-01, P0-MAIN-02 | 路径与配置读写测试通过 | todo |
| P0-QA-02 | QA | 应用级插件库单测 | 新增测试文件 | P0-MAIN-03 | 插件库读写测试通过 | todo |
| P0-QA-03 | QA | 模型/插件迁移单测 | 新增测试文件 | P0-MAIN-05, P0-MAIN-06 | 迁移可重复执行且不重复导入 | todo |
| P0-QA-04 | QA | `Return to Node` 集成测试 | 新增测试文件 | P0-MAIN-04, P0-FE-05 | 回流链路通过 | todo |
| P0-QA-05 | QA | 无工作区模型/插件页验收 | 测试记录 | P0-FE-01, P0-FE-02 | 两页面在无工作区时均可用 | todo |

---

## 3. P1 任务单

| 编号 | 组别 | 任务 | 主要输出 | 依赖 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P1-MAIN-01 | MAIN | Provider preset 内置支持 | `provider-presets.ts` 完整实现 | P0-MAIN-02 | OpenAI / Anthropic / DeepSeek / MiMo / 自定义均可返回 | todo |
| P1-MAIN-02 | MAIN | 健康检查按 provider 配置驱动 | 更新 `model-health-check-service.ts` | P1-MAIN-01 | 支持不同 `authMode`、`modelsPath`，返回结构化连接测试结果 | todo |
| P1-MAIN-03 | MAIN | 统一模型调用能力层 | 新增 `model-runtime/*` | P0-MAIN-02 | 支持 `stream` / `blocking` | todo |
| P1-MAIN-04 | MAIN | 模型候选列表接口预留 | 更新模型配置服务与 IPC | P1-MAIN-01 | 支持 `list-model-candidates`，至少返回 preset candidate | todo |
| P1-BRIDGE-01 | BRIDGE | 暴露 provider preset 列表接口 | 更新 `main.ts`、`preload.ts`、`d.ts` | P1-MAIN-01 | 支持 `app-model-config:list-presets` | todo |
| P1-BRIDGE-02 | BRIDGE | 暴露模型候选列表接口 | 更新 `main.ts`、`preload.ts`、`d.ts` | P1-MAIN-04 | 支持 `app-model-config:list-model-candidates` | todo |
| P1-FE-01 | FE | 模型配置向导 preset 化 | 更新 `ModelConfigPage.vue` | P1-BRIDGE-01 | 普通用户不需要手写 provider id/model id | todo |
| P1-FE-02 | FE | DeepSeek / MiMo 预设接入 | 更新 `ModelConfigPage.vue` | P1-FE-01 | DeepSeek / MiMo 可直接选择并自动填充 | todo |
| P1-FE-03 | FE | 服务商配置区与模型配置区拆层 | 更新 `ModelConfigPage.vue` | P1-BRIDGE-02 | 服务商区只配置连接，模型区只选择能力，不再表现为两组相似表单 | todo |
| P1-FE-04 | FE | Binding 区改造成“使用场景模型配置” | 更新 `ModelConfigPage.vue` | P1-FE-03 | 不直接暴露 Binding / role / modelId / providerId | todo |
| P1-FE-05 | FE | 连接测试结果结构化展示 | 更新 `ModelConfigPage.vue` | P1-MAIN-02 | 页面可展示状态、耗时、检查地址、失败原因 | todo |
| P1-FE-06 | FE | 模型配置页从“数据表管理”改为“连接与路由配置” | 更新 `ModelConfigPage.vue` | P1-FE-03, P1-FE-04, P1-FE-05 | 页面主结构改为“当前默认配置 / 服务商连接 / 可用模型 / 使用场景模型 / 高级设置” | todo |
| P1-FE-07 | FE | 工作台主界面产品化 | 更新 `WorkbenchPage.vue` | P0-FE-04 | 第一层改成任务/进展/下一步/产出 | todo |
| P1-FE-08 | FE | 主按钮语义改写 | 更新 `WorkbenchPage.vue` | P1-FE-07 | `继续任务` 与 `继续执行` 语义分离 | todo |
| P1-FE-09 | FE | 技术详情区收纳 | 更新 `WorkbenchPage.vue` | P1-FE-07 | Runtime / Trace / Memory / Risk 收纳到技术详情 | todo |
| P1-FE-10 | FE | 页面文案统一中文主流程 | 更新多页面 | P1-FE-07 | 主流程不再中英文混用 | todo |
| P1-QA-01 | QA | 模型配置向导回归测试 | 测试文件与记录 | P1-FE-01, P1-FE-02, P1-FE-03, P1-FE-04, P1-FE-05, P1-FE-06 | DeepSeek / MiMo 选择链路通过，服务商区与模型区职责正确，连接测试反馈完整，页面主结构正确 | todo |
| P1-QA-02 | QA | 工作台主界面验收 | 测试记录 | P1-FE-07, P1-FE-08, P1-FE-09 | 第一屏产品化通过 | todo |
| P1-QA-03 | QA | 流式能力单测 / 集成测试 | 新增测试文件 | P1-MAIN-03 | `stream` / `blocking` 行为符合规格 | todo |

---

## 4. P2 任务单

| 编号 | 组别 | 任务 | 主要输出 | 依赖 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-FE-01 | FE | 结果页总结化 | 更新 `src/pages/ResultsPage.vue` | P1-FE-03 | 页面优先展示总结、产出、下一步 | todo |
| P2-FE-02 | FE | 结果页继续入口 | 更新 `ResultsPage.vue` | P2-FE-01 | 增加“基于此结果继续” | todo |
| P2-MAIN-01 | MAIN | 结果继续链路支持 | 更新 `src-main/results/*` | P2-FE-02 | 可基于结果生成新任务草案 | todo |
| P2-MAIN-02 | MAIN | 跑通一个真实场景 | 真实场景实现 | P1-MAIN-03, P2-MAIN-01 | 至少一个“已有代码仓库迭代”场景跑通 | todo |
| P2-QA-01 | QA | 结果页继续链路测试 | 测试文件与记录 | P2-FE-02, P2-MAIN-01 | 从结果页继续任务通过 | todo |
| P2-QA-02 | QA | 真实场景验收 | 验收记录 | P2-MAIN-02 | 场景完整跑通 | todo |

---

## 5. 关键里程碑

| 里程碑 | 完成条件 |
| --- | --- |
| M1 | 模型配置和插件管理脱离工作区可用 |
| M2 | 首页可继续任务，Quick Input 有草案确认 |
| M3 | 工作台第一屏产品化，主按钮语义完成 |
| M4 | DeepSeek / MiMo 可用，模型调用支持流式 |
| M5 | 结果页可继续任务，至少一个真实场景跑通 |

---

## 6. 负责人建议

| 组别 | 建议负责人类型 |
| --- | --- |
| MAIN | Electron / Node / 存储主进程开发 |
| BRIDGE | Electron bridge / 类型契约开发 |
| FE | Vue 页面与交互开发 |
| QA | 集成测试 / 手工验收 / 回归测试 |

---

## 7. 每日跟进建议

每日站会只回答这四个问题：

1. 昨天完成了哪几个任务编号？
2. 今天计划推进哪几个任务编号？
3. 当前卡在哪个依赖上？
4. 是否需要跨组同步？

---

## 8. 最终交付判断

本任务单执行完成后，必须同时满足：

1. 模型配置在无工作区状态下可完整配置
2. 插件管理在无工作区状态下可完整使用
3. 首页第一屏可以继续任务、处理阻塞、开始新任务
4. Quick Input 先出草案，再确认启动
5. 工作台第一层主要展示任务、进展、下一步、产出
6. `Return to Node` 已修复
7. DeepSeek / MiMo 作为内置 Provider 可直接配置
8. 模型调用层支持统一流式能力
9. 结果页可基于结果继续任务
10. 模型配置页已将“服务商配置”和“模型选择”拆层
11. Binding 已改造成“使用场景模型配置”
12. 连接测试结果可结构化展示
13. 模型配置页主结构已从“数据表管理”改成“模型连接与路由配置”
