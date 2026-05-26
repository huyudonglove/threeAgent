# 模型输出实验面板开发方案（2026-05-26）

> 记录版本索引见：`docs/record-version-index.md`

## 目标

建设一个独立的“模型输出实验面板”，用于验证模型在不同提示词、输出约束、调用参数和流式模式下的真实行为。

该面板用于开发诊断和模型选择，不进入正式 Agent 任务流，不创建正式 conversation、task、artifact。

核心目标：

- 对比不约束、Prompt JSON、API JSON、Legacy Text 的输出差异。
- 观察 temperature、top_p、max_tokens、seed、reasoning_effort 等参数对 JSON 稳定性和内容质量的影响。
- 观察 blocking 和 stream 两种调用模式的行为。
- 记录 token、耗时、成本预留字段和一致性测试结果。
- 沉淀可复用的 Prompt 模板和 JSON Schema（输出结构说明）。

## 总体原则

1. 实验面板与正式工作台隔离。
2. 只读正式模型配置，不改正式任务运行态。
3. 实验运行结果可以持久化，但必须放在应用级 model-lab 目录。
4. 默认使用 JSON 强约束，但支持对照测试 Loose Text 和 Prompt JSON。
5. 流式 JSON 只在 done 后解析最终拼接内容，中间 delta 不当成最终结构。
6. 所有模型返回都要展示 raw output，便于人工观察。
7. 所有解析和校验结果都要结构化记录，便于批量比较。
8. 实验面板不允许隐藏自动注入提示词；所有会进入 messages 的提示词必须在 GUI 中可见、可编辑。
9. 提示词方案只保存 System Prompt、User Prompt、JSON Schema，不保存模型参数和运行结果。

## 待调整项记录

以下调整先记录，等交互确认后再进入代码修改。

### A. 统一 JSON Schema 拼接职责

当前第一版存在职责边界不够清楚的问题：

- 实验服务层可能把 JSON Schema 拼入 user prompt。
- provider adapter 也可能在 JSON-only system instruction 中加入 schema。

目标结构：

```text
StructuredOutputPromptBuilder
├── system/developer message
│   ├── 模型行为约束
│   ├── JSON-only 规则
│   └── JSON Schema（输出结构说明）
└── user message
    └── 用户原始输入
```

调整原则：

- JSON Schema 只在 `StructuredOutputPromptBuilder` 中拼接一次。
- `User Prompt` 不混入 schema。
- provider adapter 只负责协议格式转换，不再追加 system prompt 或 schema。
- `ModelInvokeService` 或更上层服务负责调用 builder。

最新调整原则（2026-05-26）：

- 后续不再使用 PromptBuilder 自动生成隐藏提示词。
- JSON-only 规则、字段说明、失败处理说明、工具说明，如果要使用，必须作为 GUI 输入框里的可编辑内容存在。
- PromptBuilder 只允许做机械组装：
  - 收集 GUI 中已经可见的 system/developer/user/tool messages。
  - 合并用户确认的参数。
  - 生成请求预览。
- PromptBuilder 不允许新增用户未看到、未编辑、未确认的 prompt 文本。
- 如果需要提供默认 prompt，默认文本直接填入输入框，而不是后台追加。

### B. 提示词方案切换

实验面板需要增加轻量提示词方案切换，用于快速比较不同 prompt/schema。

只保存：

- System Prompt
- User Prompt
- JSON Schema

不保存：

- providerId / modelId
- constraintMode
- temperature / top_p / max_tokens / seed 等参数
- mode: blocking / stream
- raw output
- parsed JSON
- validation
- metrics

建议新增存储：

```text
<electron userData>/agent-config/model-lab/prompt-presets.json
```

建议类型：

```ts
interface PromptPresetRecord {
  id: string
  name: string
  systemPrompt: string
  userPrompt: string
  jsonSchema: unknown
  createdAt: string
  updatedAt: string
}
```

建议 IPC：

- `model-lab:list-prompt-presets`
- `model-lab:save-prompt-preset`
- `model-lab:delete-prompt-preset`

页面行为：

- 在 Prompt 编辑区上方显示方案切换。
- 切换方案只替换 System Prompt、User Prompt、JSON Schema。
- 参数和模型选择保持当前状态。
- 修改后显示“未保存”状态。
- 支持新建、复制、重命名、保存、删除。
- 不常驻展示 `方案名称` 输入框；方案名称不是模型输入，也不是实验参数。
- 只有新建、复制、重命名、首次保存未命名草稿时才要求输入名称。
- 日常编辑状态只显示当前方案名、未保存状态和方案操作按钮。

待调整记录：

- 当前第一版页面中 `方案名称` 常驻输入，用户反馈不理解其用途。
- 后续应改成“方案操作”交互，而不是普通输入字段。
- 推荐实现：
  - 下拉选择当前方案。
  - `保存` 保存当前方案内容。
  - `另存为` 或 `复制` 时再要求输入新名称。
  - `重命名` 单独触发命名。
  - 未保存草稿显示状态标签，不把名称输入暴露为主表单字段。

删除操作：

- 新增 `删除方案` 操作。
- 只有选中已保存方案时可用。
- 删除前二次确认。
- 删除成功后刷新方案列表并切换到 `当前草稿`。
- 删除不影响当前模型参数、运行结果、历史 runs。
- 需要新增或补齐 IPC：
  - `model-lab:delete-prompt-template`
  - preload `modelLabDeletePromptTemplate(id)`

### C. 调用方式控件改造

当前 `Blocking / Stream` 使用按钮形态，容易让用户误以为点击它会立即执行输出。

调整目标：

- 将 `Blocking / Stream` 从按钮视觉改成“调用方式”设置项。
- 放入 `调用设置` 或 `运行设置` 区域。
- 增加短说明：
  - Blocking：一次性返回完整结果。
  - Stream：边生成边返回片段，完成后再拼接解析。
- 与真正的执行按钮分区。
- 执行按钮统一表达为：
  - `按当前方式运行`
  - 或 `运行一次`

验收标准：

- 用户能一眼看出 `Blocking / Stream` 是模式选择，不是运行按钮。
- 页面上不会出现两个视觉相似的 `Stream` 按钮。
- 服务商/模型选择区域只负责“选谁来调用”，不承载“怎么调用”的交互。

### C2. 运行设置区域紧凑化

当前 `运行设置` 面板内容有限，但占据较大面积。

调整目标：

- 将运行设置改成紧凑区域或可折叠区域。
- 默认展示当前状态摘要：
  - 调用方式
  - 输出约束模式
  - 主运行按钮
- 详细说明折叠展示，用户需要时再展开。
- 避免运行设置挤压提示词、请求预览和结果区域。

推荐实现：

- 宽屏：单行 toolbar。
- 中屏：两行紧凑 controls。
- 小屏：折叠面板。

验收标准：

- 运行设置不再占据完整大卡片。
- 用户仍能清楚区分设置项和运行按钮。
- 页面第一屏能看到更多提示词或请求预览内容。

### D. 输出约束模式控件改造

当前 `Loose Text / Prompt JSON / API JSON / Legacy Text` 如果使用按钮形态，容易被误认为是执行按钮。

调整目标：

- 将其改成明确的 `输出约束模式` 设置项。
- 使用 radio group 或 segmented setting。
- 每个模式需要说明：
  - Loose Text：不约束，观察自然输出。
  - Prompt JSON：只靠提示词要求 JSON。
  - API JSON：使用 `response_format: { "type": "json_object" }` 强制 JSON object。
  - Legacy Text：旧文本兼容模式。
- 默认选中 `API JSON`。
- 与真正执行按钮分区。
- 正式 Agent 链路不依赖 `Loose Text` 或 `Legacy Text`。

验收标准：

- 用户能一眼看出这些选项是输出约束设置，不是点击执行。
- 每个模式的差异在页面上可理解。
- `API JSON` 被表达为推荐/默认模式。

### E. 工具调用实验区

当前只有 `tool_calling` checkbox，不足以表达工具调用实验能力。

调整目标：

- 将工具调用改成独立区域。
- 第一版内置几个常用安全工具，用户勾选后实际注入到模型请求。
- 支持自定义工具 schema 和 mock result。
- 不执行任意本地代码、shell、文件操作或网络访问。

建议内置工具：

- `calculator`
- `current_time`
- `json_validator`
- `echo_tool`
- `mock_search`

基础工具追加记录：

- 后续在基础工具中加入 CLI 命令类实验工具。
- CLI 工具第一版只注入 tool schema 和 mock result，不真实执行 shell / cmd / PowerShell。
- UI 需要明确标记 CLI 工具处于 mock 模式。
- 请求预览展示最终 `tools` 数组中的 CLI schema。
- 结果区展示模型生成的命令、参数和 mock result。

建议新增 CLI mock 工具：

- `cli_run`：观察模型生成通用命令和参数。
- `cli_list_processes`：模拟查看进程列表。
- `cli_check_env`：模拟检查 Node/Python/Git 等环境版本。
- `cli_run_tests`：模拟运行测试命令并返回摘要。

后续真实 CLI 执行前置条件：

- 限制在当前 workspace。
- 命令白名单或能力白名单。
- 超时、输出截断、取消机制。
- 写入/删除/网络/权限提升类命令必须禁止或二次确认。
- 完整审计日志。

建议类型：

```ts
interface ModelLabToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  mockResult?: unknown
  builtin?: boolean
}

type ModelLabToolChoice =
  | 'auto'
  | 'none'
  | 'required'
  | { type: 'function'; function: { name: string } }
```

建议后端能力：

- 将选中的工具转成模型 API `tools` 参数。
- `tool_choice` 与工具列表一起进入请求。
- 请求预览展示最终 `tools` / `tool_choice`。
- 工具调用开启但未选择工具时，前端应提示或禁止运行。
- 收集 blocking 返回的 `tool_calls`。
- 收集 stream 返回的 `tool_call_delta`。
- 对内置安全工具执行或返回 mock result。
- 对自定义工具返回 mock result。
- 可选：将工具结果作为 tool message 回填，进行第二次模型调用。

工具注入优先级：

1. Provider/model 支持原生 tool call：注入 API `tools` 参数。
2. Provider/model 不支持：不伪装成真实工具调用；UI 标记“不支持原生 tools”。
3. 如果需要对照实验，可单独提供“提示词模拟工具说明”模式，但它必须和 API tools 明确区分。

推荐默认工具：

- 默认勾选：`calculator`、`current_time`、`json_validator`
- 可选勾选：`echo_tool`、`mock_search`

第一版验收：

- 页面不再只有孤立 `工具调用` 勾选。
- 用户能选择内置工具。
- 用户能添加自定义工具 schema。
- 用户勾选工具后，能在请求预览看到最终 API `tools` 参数。
- 用户能看到模型生成的工具名、参数和工具结果。
- 工具执行范围安全可控。

文件工具扩展记录：

用户希望后续在工具调用实验中加入文件读删改查命令，用于观察 Agent 后续如何产出 tool call 和工具结果。

建议新增工具：

- `file_list`
- `file_read`
- `file_search`
- `file_write`
- `file_update`
- `file_delete`

分阶段实现：

1. Mock 阶段：
   - 所有文件工具只返回 mockResult。
   - 不触碰真实文件系统。
   - 用于观察模型是否生成正确工具名、路径和参数。
2. 只读阶段：
   - 开放 `file_list / file_read / file_search`。
   - 限制在当前 workspace。
   - 路径必须 normalize 并校验不能越界。
3. 写操作预览阶段：
   - `file_write / file_update` 只生成 diff 或操作计划。
   - 用户确认后才可执行。
4. 删除保护阶段：
   - `file_delete` 默认只生成删除计划。
   - 真实删除必须单独确认，优先移动到回收区或可恢复区域。

安全要求：

- 不允许任意 shell。
- 不允许访问 workspace 外路径。
- 写、改、删必须有明确确认。
- 每次工具调用都记录审计日志。
- 请求预览和结果区都要展示：
  - 工具 schema
  - 模型生成参数
  - mock/真实执行结果
  - 是否回填给模型继续生成。

### F. 运行入口与标题区整理

当前标题区出现 `运行一次` 会让页面级操作和实验执行混在一起。

调整目标：

- 标题区只保留页面级操作，例如 `刷新模型`、`查看历史`。
- 移除标题区的 `运行一次`。
- 运行入口只放在 Prompt/运行设置区域。
- 如果有调用方式设置，则使用单一主按钮：`按当前设置运行`。
- 避免同时出现多个相似运行按钮。

验收标准：

- 用户能明确区分“页面操作”和“运行实验”。
- 页面只有一个主要执行入口。

### F3. 主运行按钮反馈链路

用户反馈：点击 `按当前设置运行` 后无反应。

调整目标：

- 点击后立即进入可见运行状态。
- 结果区显示运行中空状态，而不是继续显示静态空态。
- 错误必须显示在页面上，不允许只在 console 或 IPC 内部失败。
- 禁用按钮时显示禁用原因。

建议状态机：

```text
idle
→ preparing
→ invoking
→ waiting_first_response
→ parsing
→ succeeded / failed
```

排查项：

- `contractError` 是否导致按钮禁用但无说明。
- `modelLabInvoke` IPC 是否正常返回。
- 模型配置/API Key 缺失错误是否展示。
- stream/blocking 错误是否进入 `error` 状态。
- 请求预览是否和实际 buildInput 一致。

验收标准：

- 用户点击后 100ms 内看到页面状态变化。
- 成功时结果区显示 runId 和结果。
- 失败时结果区显示错误码、错误原因和可恢复建议。
- 按钮不可点击时页面展示原因。

### F2. 页面级刷新操作降噪

当前标题区显示 `刷新模型` 和 `刷新方案`，用户不清楚它们和实验运行的关系。

调整目标：

- 页面加载时自动读取模型配置和提示词方案。
- 默认不常驻展示两个文字刷新按钮。
- 加载失败时显示对应重试入口。
- 手动刷新如需保留，放到更多菜单或小图标中。
- 文案使用更具体的动作：
  - `重新读取模型配置`
  - `重新读取提示词方案`

验收标准：

- 用户不会把刷新按钮误认为实验运行相关动作。
- 普通实验流程不需要手动点击刷新。
- 刷新成功或失败都有明确反馈。

### G. 默认输出结构与高级 Schema 拆分

当前默认 JSON Schema 对初次使用者过重。

调整目标：

- 默认展示 `期望输出结构`，使用简洁 JSON 示例。
- 高级模式才展示完整 JSON Schema。
- 本地校验器支持简洁结构和 schema-like 结构。
- 页面明确说明：
  - 简洁结构表示模型最终应返回的 JSON 形状。
  - 高级 Schema 用于更精确的提示词约束和本地校验。

验收标准：

- 用户不会误以为 `description / properties / required` 是模型最终要返回的字段。
- 默认视图能直观看懂模型应该返回什么。

### G2. 弱化 Schema 术语，默认使用期望输出 JSON

用户反馈：完整 JSON Schema 对人都显得莫名其妙，更不应期待模型稳定区分“schema 规则”和“最终返回内容”。

调整目标：

- 默认不再展示完整 JSON Schema。
- 默认区域命名改为 `期望输出 JSON`。
- 用户直接写模型最终应该返回的 JSON 形状。
- 暂时不提供 `高级 Schema` 主入口；完整 schema 留到后续正式 Agent 契约设计时再考虑。
- PromptBuilder 不应把复杂 schema 原样作为主要提示；只传模型需要返回的字段形状。
- 提示词中必须明确：`string`、数组、对象只是类型占位，不是固定值。
- 请求预览需要标明发送给模型的是“期望输出字段”，不是“让模型返回 JSON Schema”。

实现建议：

- 保留内部字段名 `outputContract` 兼容现有后端。
- 前端 UI 使用 `expectedOutputJsonText` 或类似概念承载默认输入。
- 后端 PromptBuilder 对简洁结构生成专门提示：

```text
最终只返回一个 JSON object，形状如下。
这里的 string / number / boolean 表示字段类型，不要把它们当成固定内容。
不要返回 type、required、properties 等 schema 规则字段。
```

- 本地校验器继续支持简洁结构校验。
- 不向模型传 `type / description / required / properties / items` 等 schema 规则字段。
- 严格 schema、必填字段策略、枚举约束等能力，后续设计正式 Agent 契约时再处理。

验收标准：

- 用户第一眼看到的是模型最终应返回的 JSON，而不是 schema 规则。
- 模型提示中不会让 `type / required / properties` 成为主要上下文。
- 请求预览可以解释清楚“输出形状”如何进入 prompt。
- 当前实验只验证模型对“最终返回字段”的服从能力，不承担完整 Agent 契约设计。

### H. 最终请求预览

实验面板需要新增 `请求预览 / 实际发送内容` 区域。

调整目标：

- 展示最终 messages。
- 展示 API 参数。
- 展示 tools 和 tool_choice。
- 展示 response_format。
- 展示 JSON Schema 或期望输出结构拼接位置。
- 展示最终请求 JSON。

建议流程：

```text
输入区
→ 请求预览
→ 模型返回
→ 解析与校验
```

验收标准：

- 用户能看到实际发送给模型的 system/user/tool messages。
- 用户能确认 schema 是否只拼接一次。
- 用户能确认参数是否真实进入请求。
- 用户能用请求预览解释模型输出差异。

### I. 批量/一致性结果详情

当前批量扫描和一致性测试如果只展示摘要表格，无法观察每轮输出质量。

调整目标：

- 批量结果从“摘要表格”升级为“结果列表 + 单轮详情”。
- 每轮运行都能查看实验产物：
  - Raw Output
  - Parsed JSON
  - Validation
  - Stream Events
  - Metrics
  - Error detail

推荐交互：

- 表格行可展开。
- 或点击行后在右侧详情面板展示。
- 默认突出失败轮次。
- 支持复制 raw output 和 parsed JSON。

验收标准：

- 用户能看到每一轮模型实际输出。
- 用户能定位失败轮次的具体原因。
- 用户能从批量结果判断模型内容质量，而不只是 parse/schema 成功率。

### I3. 批量结果参数关联展示

对应记录：`REC-2026-05-26-009`

当前 `5 次运行` / 批量结果列表无法看出每一轮对应哪些参数，因此无法判断参数变化和输出结果之间的关系。

调整目标：

- 每条批量结果都要带上本轮参数快照。
- 列表摘要直接展示关键参数和关键结果。
- 详情区按以下顺序组织：

```text
本轮参数
→ Raw Output
→ Parsed JSON
→ Validation
→ Metrics / Error
```

需要展示的参数：

- `temperature`
- `top_p`
- `constraintMode`
- `mode`
- `seed`
- `max_tokens`
- `thinking_type`
- `enabled_tools`
- `tool_choice`

温度扫描列表：

- 每行显式显示 `temperature`。
- 温度值应比 runId 更醒目。
- 可选显示“稳定性信号”：
  - parse ok/fail
  - schema ok/fail
  - token
  - latency

一致性测试列表：

- 如果参数相同，显示“同参数第 N 次”。
- 显示 fixedSeed 是否开启。
- 显示 seed 值或“未固定”。

后端数据建议：

- `ModelLabRunRecord` 或 `ModelLabInvokeResult` 中增加 `inputSnapshot` / `paramSnapshot`。
- 至少包含本轮真实调用参数，不依赖前端用当前页面参数倒推。
- 参数扫描中每轮变更后的参数要写入结果，避免结果列表和当前表单状态脱节。

验收标准：

- 用户能直接回答“这条结果对应的是哪个温度/参数组合”。
- 用户能比较不同参数对输出结构、内容质量、耗时和 token 的影响。
- 批量结果可作为后续选择默认参数的依据。

### I2. 单次结果区空状态

当前单次结果区未运行时显示 `等待运行`，用户不清楚该面板用途。

调整目标：

- 结果区标题固定为 `单次运行结果` 或 `模型返回结果`。
- 未运行时显示明确空状态：
  - 尚未运行
  - 点击运行后展示 Raw Output / Parsed JSON / Validation / Stream Events / Metrics / Tools。
- runId 只作为运行后的辅助信息展示。
- 没有结果时 tabs 可禁用，或展示统一空状态。

验收标准：

- 用户第一眼能知道该区域是模型输出观察区。
- 未运行时也能理解运行后会看到哪些信息。
- 不再只出现语义模糊的 `等待运行`。

### J. 温度扫描交互整理

当前 `扫温度` 按钮和 `温度扫描列表` 分离，用户不容易理解按钮会使用哪个列表。

调整目标：

- 将温度扫描参数和动作合并到同一组。
- 区域标题使用 `参数扫描` 或 `温度扫描`。
- 输入框和按钮紧邻展示。
- 按钮文案改为 `开始温度扫描` 或 `按列表扫描温度`。
- 温度扫描结果复用批量结果详情交互。

推荐布局：

```text
参数扫描
温度列表 [0, 0.2, 0.5, 0.8, 1] [开始温度扫描]
```

验收标准：

- 用户点击前知道会扫描哪些温度。
- 扫描参数和动作不分散。
- 每个温度结果都能查看 Raw Output / Parsed JSON / Validation / Metrics。

### K. stop 与 seed 参数降噪

当前参数区如果把 `stop` 和 `seed` 与 temperature、top_p、max_tokens 并列展示，会让用户误以为它们是高频核心参数。

调整目标：

- `高级参数` 默认收起。
- `stop` 移入 `高级参数`，默认空。
- `seed` 移入 `高级参数` 或 `一致性测试` 区域，默认空。
- `stop` 填写后，在 JSON 输出模式下提示可能提前截断 JSON 或 tool call 参数。
- `seed` 旁边标注“仅部分模型支持，结果不保证绝对一致”。
- 请求预览中仍然展示实际发送的 `stop` / `seed`，让用户确认服务商是否接收该参数。
- 如果高级参数中存在非默认值，折叠标题显示摘要，例如“高级参数：seed / stop 已设置”。

说明：

- `stop` 用于指定停止字符串，模型输出命中后提前结束；对 Agent JSON 输出不常用。
- `seed` 用于实验复现，便于比较 prompt 或参数变化；不是正式 Agent 稳定性的主要保障。

验收标准：

- 初次使用者不会把 `stop` 当成必要字段。
- 用户能理解 `seed` 是可复现实验辅助，而不是“锁死模型输出”的开关。
- JSON 模式下配置 `stop` 时有明显风险提示。

### L. reasoning_effort 参数能力化展示

`reasoning_effort` 是推理型模型的推理预算参数，不是所有 provider/model 都支持。

调整目标：

- 实验面板继续暴露 `reasoning_effort`，用于观察不同推理预算对输出质量、延迟和 token 的影响。
- 根据模型能力决定是否启用 `reasoning_effort`。
- 不支持时禁用，并提示“当前模型不支持 / 服务商可能忽略该参数”。
- 从基础采样参数中移出，放入 `高级参数` 或单独 `推理设置`。
- 使用当前服务商支持的实际枚举值，例如 `minimal / low / medium / high` 或 `auto`。
- 在请求预览中展示最终是否发送了 `reasoning_effort`。
- 在流式事件中单独展示 `reasoning_delta`，不要把 reasoning 内容拼进最终 JSON。
- blocking 和 stream 都允许配置该参数；stream 只是额外展示 reasoning 相关事件。

说明：

- `reasoning_effort` 主要影响内部 reasoning token 预算。
- 较低档通常更快、更省；较高档更适合复杂规划、分析和代码推理，但延迟和 token 成本更高。
- 它不是 JSON 输出格式控制参数，也不能替代 `response_format`、prompt 约束或本地校验。

验收标准：

- 用户能分清 `temperature/top_p` 是采样随机性，`reasoning_effort` 是推理预算。
- 不支持 reasoning 的模型不会出现可点击但无效的设置。
- 用户能从 metrics 或 stream events 中观察 reasoning 对成本、延迟和输出质量的影响。

### L2. Provider-Specific Thinking 参数

DeepSeek 的 `thinking: { type: 'enabled' | 'disabled' }` 属于 provider-specific 扩展，不是通用 OpenAI 标准参数。

调整目标：

- 增加 `服务商专属参数` 分组。
- DeepSeek provider / DeepSeek 模型下显示 `DeepSeek Thinking` 开关。
- 非 DeepSeek 模型不显示该参数，或显示为不适用。
- 请求预览中展示最终 provider-specific body，例如：

```json
{
  "thinking": { "type": "enabled" }
}
```

- OpenAI-compatible adapter 需要支持 provider-specific extra body，但不能把 DeepSeek 字段发给所有 provider。
- `thinking.type` 和 `reasoning_effort` 分开展示、分开解释。
- 流式 reasoning 内容继续进入 `reasoning_delta` 区域，不参与最终 JSON parse。

验收标准：

- 用户能知道 `thinking` 是 DeepSeek 专属扩展。
- 通用参数区不会混入 provider-specific 字段。
- 请求预览能解释哪些字段是标准参数，哪些字段是服务商扩展。

### L3. Thinking 模式下超参失效规则

DeepSeek 和 MiMo 的 thinking 模式会影响采样参数生效情况。实验面板必须避免让用户误以为 temperature/top_p 扫描仍然有效。

Provider 规则记录：

- DeepSeek thinking enabled：
  - `temperature` 不生效。
  - `top_p` 不生效。
  - `presence_penalty` 不生效。
  - `frequency_penalty` 不生效。
  - 这些参数可能仍被服务商接受，但不会影响采样。
- MiMo thinking：
  - 不同模型默认 thinking 状态不同。
  - `mimo-v2.5-pro / mimo-v2.5 / mimo-v2-pro / mimo-v2-omni` 默认 enabled。
  - `mimo-v2-flash` 默认 disabled。
  - 支持传 `thinking.type = enabled / disabled`。
  - thinking mode 下部分模型不支持自定义 `temperature`，可能被覆盖为推荐默认值。

调整目标：

- 增加 provider capability rules。
- 当 thinking enabled 时，采样参数显示失效提示。
- 参数扫描禁用或警告 `temperature/top_p` 扫描。
- 请求预览展示：
  - 实际发送参数。
  - provider-specific 参数。
  - 被过滤或预计不生效的参数。
- Adapter 层可按 provider 过滤无效参数，但必须在预览/结果中说明。

验收标准：

- 用户能知道 thinking enabled 时哪些参数不生效。
- 参数扫描不会产生误导性结果。
- DeepSeek/MiMo 的 thinking 默认值和可关闭能力在 UI 中被正确表达。

### M. presence_penalty 与 frequency_penalty 参数说明

`presence_penalty` 和 `frequency_penalty` 都属于采样惩罚参数，适合实验面板暴露，但不应让用户误以为它们能提升 JSON 稳定性。

调整目标：

- 实验面板继续暴露 `presence_penalty` 和 `frequency_penalty`。
- 放入 `高级参数` 或 `采样高级参数`。
- 默认值为 `0`。
- 在请求预览中展示最终发送值。
- JSON 输出模式下，如果值明显高于 0，需要提示可能影响字段名、固定结构和枚举值稳定性。

说明：

- `presence_penalty`：只要内容出现过，就降低再次出现概率，更偏向鼓励新主题、新角度。
- `frequency_penalty`：内容出现次数越多，惩罚越强，更偏向减少同词/同句重复。
- 开放式写作、创意探索、发散方案可以尝试调高。
- 结构化 JSON、Agent 固定字段输出默认保持 `0` 更稳。

验收标准：

- 用户能理解这两个参数都影响重复控制，但侧重点不同。
- 用户能通过参数扫描观察它们对输出发散度和 JSON 稳定性的影响。
- 正式 Agent 默认配置不因为实验面板暴露这些参数而启用它们。

## 推荐信息架构

入口位置：

- 模型配置页新增 Tab：`输出实验`
- 或模型配置页右上角入口：`模型输出实验`

页面布局：

```text
模型输出实验
├── 顶部：模型与模式选择
├── 左侧：Prompt / Contract / 参数
├── 中部：运行控制与批量测试
└── 右侧：结果观察
    ├── Raw Output
    ├── Parsed JSON
    ├── Validation
    ├── Stream Events
    └── Metrics
```

## 桌面窗口与布局要求

2026-05-26 追加记录：

模型输出实验台信息密度高，当前应用初始窗口偏小，打开后不利于观察完整流程。

后续统一修改项：

- Electron 初始窗口尺寸增大，建议至少 `1440 x 900`。
- Electron 最小窗口尺寸同步提高，避免三列布局被压得不可用。
- 模型实验页在宽窗口下优先展示三列：
  - 输入与提示词
  - 参数与工具
  - 请求预览与结果
- 中小窗口下自动降为双列或单列，不应出现控件互相挤压。
- 这属于壳层体验优化，和模型调用契约分开处理。

## 开发阶段

### Phase 0：契约和文档冻结

目标：

- 固定实验面板的输入、输出和持久化契约。
- 明确不影响正式任务流。

工作项：

- 完成 `model-output-lab-panel-requirements-2026-05-26.md`。
- 完成本开发方案。
- 定义后端 DTO：
  - `ModelLabInvokeInput`
  - `ModelLabInvokeResult`
  - `ModelLabStreamEvent`
  - `ModelLabValidationResult`
  - `ModelLabRunRecord`
  - `PromptTemplateRecord`

验收：

- 文档中能回答页面做什么、后端存什么、如何验收。

### Phase 1：后端实验服务

目标：

新增独立后端服务，不接 GUI 也能通过测试跑通。

建议文件：

```text
src-main/model-lab/
├── model-lab-contracts.ts
├── model-lab-service.ts
├── model-output-validator.ts
├── prompt-template-store.ts
└── model-lab-run-store.ts
```

核心能力：

- 单次 blocking 调用：`invoke`
- 流式调用：`invokeStream`
- 输出校验：`validateOutput`
- 批量参数扫描：`runParameterSweep`
- 多轮一致性测试：`runConsistencyTest`
- 模板保存与读取：`savePromptTemplate / listPromptTemplates`

持久化位置：

```text
<electron userData>/agent-config/model-lab/
├── prompt-templates.json
└── runs.jsonl
```

关键实现：

- 调用现有 `ModelInvokeService`，不重复造模型调用逻辑。
- 根据约束模式组装 prompt 和 `responseFormat`。
- 对 stream 事件做标准化记录。
- done 后拼接 delta，再做 JSON parse 和 contract 校验。
- 运行结果写入 `runs.jsonl`，写失败不阻断页面展示，但要返回 warning。

验收：

- 单元测试覆盖 JSON 成功、JSON 失败、Loose Text、stream 拼接、批量扫描、多轮一致性。

### Phase 2：IPC 与 preload API

目标：

把 model-lab 后端服务暴露给前端，但仍与正式任务接口隔离。

建议 IPC：

- `model-lab:invoke`
- `model-lab:invoke-stream`
- `model-lab:run-parameter-sweep`
- `model-lab:run-consistency-test`
- `model-lab:validate-output`
- `model-lab:list-prompt-templates`
- `model-lab:save-prompt-template`
- `model-lab:list-runs`

preload API：

```ts
modelLabInvoke(input)
modelLabInvokeStream(input, onEvent)
modelLabRunParameterSweep(input)
modelLabRunConsistencyTest(input)
modelLabValidateOutput(input)
modelLabListPromptTemplates()
modelLabSavePromptTemplate(input)
modelLabListRuns()
```

注意：

- 流式 IPC 需要明确事件订阅和取消机制。
- 长批量任务需要支持取消，避免用户误点后一直跑。
- 错误要保留 `code / message / recoverable / detail`。

验收：

- preload 类型完整。
- IPC 测试或集成测试能调用成功。

### Phase 3：前端实验面板第一版

目标：

做出可用但不花哨的实验面板，优先支持核心观察。

建议文件：

```text
src/pages/ModelOutputLabPage.vue
src/composables/useModelOutputLab.ts
src/components/model-lab/
├── ModelLabPromptEditor.vue
├── ModelLabParamPanel.vue
├── ModelLabRunControls.vue
├── ModelLabResultViewer.vue
├── ModelLabStreamEvents.vue
└── ModelLabMetrics.vue
```

第一版功能：

- 选择默认模型或指定模型。
- 编辑 System Prompt、User Prompt、JSON Schema（输出结构说明）。
- 选择约束模式：Loose Text / Prompt JSON / API JSON / Legacy Text。
- 调整 temperature、top_p、max_tokens、stream、timeout、retry、reasoning_effort、seed。
- 运行一次 blocking。
- 运行一次 stream。
- 展示 raw output、parsed JSON、validation、metrics。

暂缓功能：

- Prompt 模板管理可以先只做保存，不做复杂分类。
- 批量扫描可以先做小规模。
- 成本计算第一版只展示 token，成本字段预留。

验收：

- 用户能在一个页面看出：不同约束方式下模型输出是否稳定。
- JSON 失败时能看到失败原因和 raw output。
- 流式输出能看到事件序列和最终解析结果。

### Phase 4：批量扫描与一致性测试

目标：

把实验面板从“单次观察”升级到“参数比较”。

功能：

- 参数扫描矩阵：
  - temperature 列表
  - top_p 列表
  - constraintMode 列表
  - stream on/off
  - seed 固定/不固定
- 多轮一致性：
  - runCount
  - fixedSeed
  - stopOnFirstFailure
  - delayMs
- 结果表：
  - parse success
  - schema success
  - latency
  - tokens
  - finishReason
  - errorCode

可视化建议：

- 成功率用小型状态条。
- 参数组合用表格。
- 失败行可展开查看 raw output。
- 支持按 parse success、latency、token 排序。

验收：

- 能快速找出最稳参数组合。
- 能看到高温度或高 top_p 是否破坏 JSON。
- 能看到多轮输出字段是否漂移。

### Phase 5：模板沉淀与正式链路衔接

目标：

把实验稳定的 prompt 和 contract 沉淀为模板，为正式 Agent 节点使用做准备。

功能：

- 保存模板：
  - name
  - scenario
  - systemPrompt
  - userPromptTemplate
  - jsonSchema
  - defaultParams
  - responseFormat
- 从模板加载到实验面板。
- 标记模板为候选正式模板。
- 导出模板 JSON。

正式链路衔接原则：

- 实验面板只产出候选模板。
- 正式工作台不允许用户随意编辑复杂 prompt。
- 正式节点只能引用已验证模板。
- 正式任务执行仍然走 JSON parse + contract validate。

验收：

- 能保存并复用一套稳定实验配置。
- 能明确区分“实验模板”和“正式模板”。

## 数据契约草案

### ModelLabInvokeInput

```ts
interface ModelLabInvokeInput {
  providerId?: string
  modelId?: string
  mode: 'blocking' | 'stream'
  constraintMode: 'loose_text' | 'prompt_json' | 'api_json' | 'legacy_text'
  systemPrompt: string
  userPrompt: string
  outputContract?: unknown // 内部兼容字段；UI 命名为 JSON Schema（输出结构说明）
  params: {
    temperature?: number
    top_p?: number
    max_tokens?: number
    timeout_ms?: number
    retry_count?: number
    reasoning_effort?: string
    seed?: number | null
    presence_penalty?: number
    frequency_penalty?: number
    stop?: string[]
    tool_calling?: boolean
  }
  persistRun?: boolean
}
```

### ModelLabInvokeResult

```ts
interface ModelLabInvokeResult {
  runId: string
  rawOutput: string
  parsedJson?: unknown
  validation: ModelLabValidationResult
  streamEvents?: ModelLabStreamEvent[]
  metrics: {
    latencyMs: number
    firstTokenMs?: number | null
    promptTokens?: number | null
    completionTokens?: number | null
    totalTokens?: number | null
    estimatedCost?: number | null
    finishReason?: string | null
  }
  error?: {
    code: string
    message: string
    recoverable: boolean
    detail?: unknown
  } | null
}
```

### ModelLabValidationResult

```ts
interface ModelLabValidationResult {
  jsonParseOk: boolean
  jsonObjectOk: boolean
  schemaOk: boolean
  missingFields: string[]
  extraFields: string[]
  typeMismatches: Array<{
    path: string
    expected: string
    actual: string
  }>
  parseError?: string | null
}
```

### PromptTemplateRecord

```ts
interface PromptTemplateRecord {
  id: string
  name: string
  scenario: 'task_understanding' | 'research' | 'implementation' | 'review' | 'custom'
  systemPrompt: string
  userPromptTemplate: string
  outputContract: unknown // 内部兼容字段；UI 命名为 JSON Schema（输出结构说明）
  responseFormat: 'json_object' | 'legacy_text'
  defaultParams: Record<string, unknown>
  status: 'draft' | 'candidate' | 'approved'
  createdAt: string
  updatedAt: string
}
```

## 测试方案

### 后端单元测试

覆盖：

- API JSON 成功解析。
- Prompt JSON 输出 Markdown 时解析失败。
- Loose Text 不强制 parse。
- stream delta 拼接后 parse。
- JSON Schema 缺字段。
- JSON Schema 类型不匹配。
- 批量扫描生成多条结果。
- 多轮一致性统计成功率。
- runs.jsonl 写入失败不阻断返回。

### 前端测试

覆盖：

- 参数编辑不会互相覆盖。
- 切换约束模式后请求参数正确。
- JSON parse 失败展示 raw output 和错误。
- stream 事件能逐条显示。
- 批量结果表能排序和展开失败行。

### 人工验收样例

固定 prompt：

```text
帮我预研下 Vue，判断它是否适合做一个桌面端 Agent 工作台的前端框架。
```

至少测试：

- Loose Text
- Prompt JSON
- API JSON
- API JSON + stream
- temperature = 0 / 0.2 / 0.8
- runCount = 5

验收信号：

- API JSON 解析成功率明显高于 Prompt JSON。
- 高温度下内容可能发散，但结构仍应稳定。
- max_tokens 过低时能观察到 JSON 截断。
- stream done 后能正确拼接并解析。

## 风险与处理

| 风险 | 处理 |
| --- | --- |
| 某些 provider 不支持 `response_format` | 降级为 Prompt JSON，并在 UI 标记“非强约束” |
| 模型返回 JSON array | 标记失败，正式 Agent 要求 JSON object |
| 流式中途失败 | 保留已收到 raw stream，并显示错误 |
| 批量运行触发限流 | 支持 delayMs、取消、最大运行数限制 |
| 成本估算不准 | 第一版只记录 token，成本字段预留 |
| 用户误以为实验结果就是正式产物 | UI 文案明确“实验结果，不进入任务记录” |

## 第一版建议范围

第一版必须做：

- 单次 blocking
- 单次 stream
- Prompt 编辑
- 参数编辑
- 四种约束模式
- Raw Output / Parsed JSON / Validation / Metrics
- 基础 runs.jsonl 记录

第一版可以不做：

- 完整成本计算
- 漂移摘要自动语义分析
- 复杂模板审批流
- 图表化大屏

## 完成标准

开发完成后，项目应能回答：

1. 当前默认模型能否稳定返回 JSON object？
2. 只靠提示词约束和 API 强约束差距有多大？
3. temperature/top_p 调整会不会破坏 JSON？
4. stream 模式能否最终拼接出合法 JSON？
5. 同一 prompt 连续运行多次字段是否稳定？
6. 哪套 prompt + 参数组合适合进入正式 Agent 节点？
