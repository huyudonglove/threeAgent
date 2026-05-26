# 项目记录版本索引

本文档用于给需求记录、设计讨论和后续实现建立轻量版本控制。

以后当用户说“先记录”时，优先在本文档追加一个新的 `REC-*` 记录，并在相关专题文档中补充细节。

以后当用户说“按照记录修改”时，优先根据本文档定位最新未实现记录，避免每次全量搜索所有文档。

## 版本规则

版本号格式：

```text
REC-YYYY-MM-DD-NNN
```

示例：

```text
REC-2026-05-26-006
```

状态：

| 状态 | 含义 |
| --- | --- |
| recorded | 已记录，尚未实现 |
| implemented | 已实现 |
| superseded | 已被后续记录替代 |
| corrected | 已修正之前误解或错误记录 |

每条记录至少包含：

- 版本号
- 标题
- 范围
- 状态
- 记录来源
- 关联文档
- 代码状态

推荐追加格式：

```md
### REC-YYYY-MM-DD-NNN - 标题

- 状态：recorded
- 范围：workbench / model-lab / model-config / global-ui / backend
- 来源：用户反馈摘要
- 关联文档：
  - docs/xxx.md
- 代码状态：未实现
- 摘要：
  - ...
```

## 当前最新记录

| 版本 | 标题 | 范围 | 状态 |
| --- | --- | --- | --- |
| REC-2026-05-26-001 | 模型输出实验台总体方案 | model-lab | implemented |
| REC-2026-05-26-002 | 禁止隐藏自动注入提示词 | model-lab | implemented |
| REC-2026-05-26-003 | 工具调用实验改造与文件 CRUD mock 工具 | model-lab | implemented |
| REC-2026-05-26-004 | CLI mock 工具与高级参数默认收起 | model-lab | implemented |
| REC-2026-05-26-005 | 全局顶部导航吸顶，修正“实验台内部吸顶”误解 | global-ui | implemented |
| REC-2026-05-26-006 | 建立记录版本索引 | docs | implemented |
| REC-2026-05-26-007 | 模型实验台运行按钮无反馈修复 | model-lab | implemented |
| REC-2026-05-26-008 | 修复模型实验台 IPC 参数不可克隆 | model-lab | implemented |
| REC-2026-05-26-009 | 批量运行结果需要展示参数与结果关联 | model-lab | implemented |
| REC-2026-05-26-010 | 一致性测试需要明确 seed 语义与结果来源联动 | model-lab | implemented |
| REC-2026-05-26-011 | max_tokens 改为预设下拉选择 | model-lab | implemented |
| REC-2026-05-26-012 | 提示词方案支持删除操作 | model-lab | implemented |

## 记录明细

### REC-2026-05-26-001 - 模型输出实验台总体方案

- 状态：implemented
- 范围：model-lab
- 来源：用户希望测试模型返回、JSON 约束、流式输出、提示词、温度等参数影响。
- 关联文档：
  - `docs/model-output-lab-panel-requirements-2026-05-26.md`
  - `docs/model-output-lab-development-plan-2026-05-26.md`
- 代码状态：已实现基础实验台。
- 摘要：
  - 增加模型输出实验台。
  - 支持 blocking / stream。
  - 支持 Loose Text / Prompt JSON / API JSON / Legacy Text。
  - 支持提示词编辑、参数调整、请求预览、运行结果、批量/一致性测试。

### REC-2026-05-26-002 - 禁止隐藏自动注入提示词

- 状态：implemented
- 范围：model-lab
- 来源：用户反馈输入框提示词和最终请求不一致，要求所有提示词由开发者掌握。
- 关联文档：
  - `docs/model-output-lab-panel-requirements-2026-05-26.md`
  - `docs/model-output-lab-development-plan-2026-05-26.md`
- 代码状态：已实现。
- 摘要：
  - 不允许后端或 PromptBuilder 自动追加不可见 prompt。
  - 所有进入 `messages` 的内容必须在 GUI 可见、可编辑。
  - `期望输出 JSON` 仅用于本地校验和请求预览，不自动拼进 prompt。

### REC-2026-05-26-003 - 工具调用实验改造与文件 CRUD mock 工具

- 状态：implemented
- 范围：model-lab
- 来源：用户反馈工具调用只有勾选，没有实际工具；希望内置工具，并加入文件增删改查观察。
- 关联文档：
  - `docs/model-output-lab-panel-requirements-2026-05-26.md`
  - `docs/model-output-lab-development-plan-2026-05-26.md`
- 代码状态：已实现。
- 摘要：
  - 工具调用改为可选择内置工具。
  - 勾选工具后进入 API `tools` 参数。
  - 请求预览展示完整 schema。
  - 增加 `file_create`、`file_read`、`file_update`、`file_delete`。
  - 文件工具第一版只返回 mock result，不真实读写删除。

### REC-2026-05-26-004 - CLI mock 工具与高级参数默认收起

- 状态：implemented
- 范围：model-lab
- 来源：用户要求高级参数默认收起，基础工具加入一些 CLI 命令。
- 关联文档：
  - `docs/model-output-lab-panel-requirements-2026-05-26.md`
  - `docs/model-output-lab-development-plan-2026-05-26.md`
- 代码状态：已实现。
- 摘要：
  - `高级参数` 默认收起。
  - 高级参数非默认值在标题摘要中展示。
  - 新增 CLI mock 工具：
    - `cli_run`
    - `cli_list_processes`
    - `cli_check_env`
    - `cli_run_tests`
  - CLI 工具只注入 schema 和 mock result，不执行真实命令。

### REC-2026-05-26-005 - 全局顶部导航吸顶，修正“实验台内部吸顶”误解

- 状态：implemented
- 范围：global-ui
- 来源：用户澄清“顶部的切换按钮需要吸顶”指的是工作台、工作区等全局导航按钮。
- 关联文档：
  - `docs/workbench-ux-diagnosis-and-refactor-direction-2026-05-25.md`
  - `docs/workbench-ux-dev-implementation-spec-2026-05-25.md`
- 代码状态：已实现。
- 摘要：
  - 全局顶部导航需要吸顶。
  - 范围包括：
    - 工作区
    - 工作台
    - 模型配置
    - 输出实验
    - 结果沉淀
    - 插件管理
  - 需要稳定高度、背景、分隔线或阴影。
  - 内容区需要避免被吸顶导航遮挡。
  - 已撤销模型输出实验台内部切换按钮吸顶的误记。
  - 2026-05-26 已实现：
    - `App.vue` 全局 `.app-nav` 改为 `position: sticky; top: 0`。
    - 增加固定层级、背景、模糊、阴影和最小高度。
    - 导航项支持横向滚动，避免窄窗口挤压。

### REC-2026-05-26-006 - 建立记录版本索引

- 状态：implemented
- 范围：docs
- 来源：用户要求增加版本控制，后续沟通用版本记录，避免全量搜索。
- 关联文档：
  - `docs/record-version-index.md`
- 代码状态：文档已新增。
- 摘要：
  - 新增统一记录索引。
  - 后续新增记录时使用 `REC-YYYY-MM-DD-NNN`。
  - 后续实现时优先引用版本号。

### REC-2026-05-26-007 - 模型实验台运行按钮无反馈修复

- 状态：implemented
- 范围：model-lab
- 来源：用户反馈“点击按当前设置运行没有反应”。
- 关联文档：
  - `docs/model-output-lab-panel-requirements-2026-05-26.md`
  - `docs/model-output-lab-development-plan-2026-05-26.md`
- 代码状态：已实现。
- 摘要：
  - 修复前端 `runOnce / runSweep / runConsistency` 缺少异常捕获导致的无反馈问题。
  - 增加 Electron preload API 缺失提示。
  - 增加运行状态：准备请求、正在调用、解析输出、运行完成、运行失败。
  - 增加按钮禁用原因展示。
  - 结果区运行中/失败态不再保持静态空状态。

### REC-2026-05-26-008 - 修复模型实验台 IPC 参数不可克隆

- 状态：implemented
- 范围：model-lab
- 来源：用户反馈点击运行后报错 `An object could not be cloned.`
- 关联文档：
  - `docs/record-version-index.md`
- 代码状态：已实现。
- 摘要：
  - 原因是 Vue reactive/proxy 对象被直接传给 Electron IPC，结构化克隆无法克隆 Proxy。
  - `buildInput()` 现在会把 `outputContract`、`enabled_tools` 和完整 input 转成 plain JSON object。
  - 保存提示词方案时也对 payload 做 plain clone，避免同类错误。

### REC-2026-05-26-009 - 批量运行结果需要展示参数与结果关联

- 状态：implemented
- 范围：model-lab
- 来源：用户反馈“5 次运行这里看不出来哪个参数对应多少影响的结果”。
- 关联文档：
  - `docs/model-output-lab-panel-requirements-2026-05-26.md`
  - `docs/model-output-lab-development-plan-2026-05-26.md`
- 代码状态：已实现。
- 摘要：
  - 批量/一致性结果列表不能只显示 runId、parse/schema、耗时和 token。
  - 每一轮结果必须展示本轮关键参数：
    - temperature
    - top_p
    - constraintMode
    - mode / stream
    - seed
    - max_tokens
    - thinking_type / provider-specific 参数
    - enabled_tools / tool_choice
  - 结果详情中应展示“参数 -> 输出 -> 校验 -> metrics”的完整对应关系。
  - 扫温度结果列表应突出温度值，方便比较不同温度对 JSON 稳定性、内容发散、耗时和 token 的影响。
  - 一致性测试如果参数相同，也应明确标记“同参数第 N 次”，并显示 seed 是否固定。
  - 2026-05-26 已实现：
    - 每次模型实验结果增加 `inputSnapshot`。
    - 批量列表展示本轮 temperature、top_p、max_tokens、seed、constraintMode、mode。
    - 批量详情优先展示 Parameters，再展示 Raw Output、Parsed JSON、Validation、Metrics / Error、Stream Events。

### REC-2026-05-26-010 - 一致性测试需要明确 seed 语义与结果来源联动

- 状态：implemented
- 范围：model-lab
- 来源：用户反馈“点击开始一致性测试，为啥 3 次输出结果也都不相同”，以及 `BATCH RESULTS` 需要和上面的按钮有 UI 联动。
- 关联文档：
  - `docs/model-output-lab-panel-requirements-2026-05-26.md`
- 代码状态：已实现前端 UI 第一版。
- 摘要：
  - 当前“一致性测试”容易被理解为强制输出完全一致，但实际更接近同一配置下的稳定性观察。
  - 页面需要明确展示 seed 是否固定、seed 值、temperature、top_p、constraintMode、stream 等本轮关键参数。
  - 如果 seed 为空，应提示本次不会固定随机种子，低温度也不等于确定性输出。
  - 即使填写 seed，也需要提示部分服务商或模型可能忽略 seed，无法承诺逐字一致。
  - `BATCH RESULTS` 需要与触发它的按钮建立视觉联动：
    - 单次运行、温度扫描、一致性测试应在结果区显示来源标签。
    - 点击某个按钮后，结果区标题、状态文案和高亮样式应同步说明当前结果来自哪个动作。
    - 运行中和完成后都应能看出是哪一次操作产生了当前批量结果。
  - 2026-05-26 已实现：
    - 运行设置状态显示当前动作来源。
    - 按钮运行中高亮。
    - 单次结果区显示来源与关键参数快照。
    - 批量结果区标题区分温度扫描与稳定性测试。
    - 稳定性测试显示 seed 是否固定，以及 seed 不保证逐字一致的提示。

### REC-2026-05-26-011 - max_tokens 改为预设下拉选择

- 状态：implemented
- 范围：model-lab
- 来源：用户反馈 `max_tokens` 不希望继续使用自由数字输入，希望改成下拉框并提供多个确定选项。
- 关联文档：
  - `docs/model-output-lab-panel-requirements-2026-05-26.md`
- 代码状态：已实现。
- 摘要：
  - 模型输出实验台基础参数中的 `max_tokens` 应改为 select 下拉控件。
  - 下拉框提供常用确定值，避免手输随意值导致实验结果不可比。
  - 建议预设值：
    - 512
    - 1024
    - 2048
    - 4096
    - 8192
    - 16384
  - 默认仍建议使用 4096。
  - 如果后续需要自定义值，应作为“自定义”高级模式或临时输入，不作为第一版默认交互。
  - 2026-05-26 已实现：
    - `max_tokens` 从 number input 改为 select。
    - 选项为 512、1024、2048、4096、8192、16384。

### REC-2026-05-26-012 - 提示词方案支持删除操作

- 状态：implemented
- 范围：model-lab
- 来源：用户反馈“提示词方案这里需要增加删除操作”，且需求文档中已有删除方案要求但未单独版本化。
- 关联文档：
  - `docs/model-output-lab-panel-requirements-2026-05-26.md`
  - `docs/model-output-lab-development-plan-2026-05-26.md`
- 代码状态：已实现。
- 摘要：
  - 提示词方案区域增加 `删除方案` 操作。
  - 只有选中已保存方案时可删除。
  - 删除前有二次确认。
  - 删除后切回当前草稿，并刷新方案列表。
  - 删除不影响模型参数、运行结果和历史 runs。
