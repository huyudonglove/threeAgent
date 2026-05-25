# 项目遗漏功能与补充任务清单（2026-05-25）

## 1. 文档目的

本文件用于补齐：

- 当前项目 `D:\AICode\agentThee`
- 需求文档目录 `D:\agentMd\agent\agentWork`

之间此前检查记录中尚未展开的遗漏功能和补充任务。

它重点回答两件事：

1. 当前项目还缺哪些"产品闭环能力"
2. 这些缺口应如何整理成可以继续执行的任务列表

## 2. 总体结论

当前项目已经完成了明显多于"原型壳子"的工作：

- 主进程业务骨架已成型
- 工作区 / 会话 / 任务 / 产物 / trace / workflow / memory / result 的基础模块已经存在
- 最小工作台 UI 与模型配置 UI 已可运行

但如果按 agentWork 的产品目标、范围清单和场景验收口径来判断，当前仍有一批关键能力没有闭环。

## 3. 补充任务列表

| 任务ID | 优先级 | 任务名称                                   | 目标                                                   |
| ------ | ------ | ------------------------------------------ | ------------------------------------------------------ |
| T20    | P0     | conversation-entry-and-input-understanding | 建立真实输入入口、输入理解、任务路由和自动起跑闭环     |
| T21    | P0     | resume-recovery-and-continue-entry         | 建立恢复入口、继续上次任务和从已有产物继续推进入口     |
| T22    | P0     | model-config-product-closure               | 补齐默认配置、调用类型绑定、工作区覆盖和工作台阻塞提示 |
| T23    | P1     | plugin-management-ui-and-confirmation      | 建立插件管理页、影响预览和高风险确认闭环               |
| T24    | P1     | result-persistence-and-reuse-ui            | 建立结果沉淀、总结查看、复用建议和继续使用入口         |
| T25    | P1     | memory-turn-loop-integration               | 把记忆写入、turn-end 和冲突处理接入真实会话回路        |
| T26    | P0     | domain-executor-integration                | 把领域 workflow 从状态骨架升级为实际执行闭环           |
| T27    | P1     | workspace-index-and-multi-window-entry     | 建立工作区首页、全局索引和多窗口入口                   |
| T28    | P1     | visual-product-acceptance-suite            | 建立场景级可视化测试和产品验收回归                     |
| T29    | P2     | docs-sync-and-status-rebaseline            | 同步 README、开发计划和完成度口径                      |

## 4. 建议推进顺序

### 第一批：先补主线入口和运行前提

T20, T21, T22, T26

### 第二批：补继续能力与扩展能力

T23, T24, T25, T27

### 第三批：补验收与文档口径

T28, T29

## 5. 一句话结论

项目当前已经具备“任务运行主干”，但要真正符合 agentWork 的产品目标，还需要把输入、继续、配置、执行、扩展和验收这六类闭环能力补齐。

## 6. 完成状态

截至 2026-05-25，T20-T29 全部任务已完成，M5 产品闭环验收里程碑达成。

| 任务ID | 任务名称                                   | 状态 |
| ------ | ------------------------------------------ | ---- |
| T20    | conversation-entry-and-input-understanding | done |
| T21    | resume-recovery-and-continue-entry         | done |
| T22    | model-config-product-closure               | done |
| T23    | plugin-management-ui-and-confirmation      | done |
| T24    | result-persistence-and-reuse-ui            | done |
| T25    | memory-turn-loop-integration               | done |
| T26    | domain-executor-integration                | done |
| T27    | workspace-index-and-multi-window-entry     | done |
| T28    | visual-product-acceptance-suite            | done |
| T29    | docs-sync-and-status-rebaseline            | done |

- 完成日期：2026-05-25
- 测试覆盖：179 个测试全部通过
- M5 里程碑状态：已完成
