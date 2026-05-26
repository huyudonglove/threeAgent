# 模型输出实验面板需求记录（2026-05-26）

## 背景

当前需要先验证不同模型在不同约束方式下的真实输出稳定性，再决定正式 Agent 工作台如何使用模型输出。

重点不是马上改工作台，而是先做一个独立的“模型输出实验面板”，用于观察：

- 不约束模型输出时，模型会返回什么。
- 只靠提示词约束 JSON 时是否稳定。
- API `response_format` 强约束 JSON 时是否稳定。
- 流式输出时 delta、reasoning、tool call、done、usage 的表现。
- 不同提示词模板对 JSON 稳定性的影响。
- 温度、top_p、max tokens、seed、重试次数等调用参数对输出稳定性和质量的影响。
- Token 用量、耗时和可选成本估算。
- 同一提示词与参数连续运行多次时，JSON 结构和内容是否稳定。

## 面板定位

该面板是开发/诊断工具，不是正式任务工作台。

建议命名：

- 模型输出实验台
- 模型行为实验台
- Prompt & JSON Lab

核心目标：

- 让开发者可视化比较“提示词约束”和“API 结构化约束”的差异。
- 快速验证某个模型是否适合进入 Agent 正式执行链路。
- 帮助沉淀稳定的系统提示词、用户提示词和 JSON Schema（输出结构说明）。

## 页面入口

建议入口放在模型配置页内，而不是工作台主页面。

位置建议：

- 模型配置页增加一个 Tab：`输出实验`
- 或模型配置页右上角增加入口：`测试输出`

不建议：

- 放在工作台第一屏。
- 和正式“启动任务”入口混在一起。

## 桌面窗口尺寸

2026-05-26 追加记录：

当前 Electron 初始窗口偏小，进入模型输出实验台后信息密度较高，容易显得拥挤。

后续统一修改时需要调整：

- 增大应用初始窗口尺寸。
- 模型输出实验台至少应适配三列信息：
  - 提示词/输出字段
  - 实验参数
  - 请求预览/结果观察
- 建议初始窗口不小于 `1440 x 900`。
- 最小窗口尺寸也要相应提高，避免控件挤压、按钮换行和 textarea 过窄。
- 如果保留小屏适配，应该走单列/双列响应式布局，而不是在过小窗口里硬塞三列。

## 核心交互

### 0. 待调整设计原则

以下是 2026-05-26 讨论后需要调整的设计点，先记录，等交互确认后再统一修改代码。

#### JSON Schema 拼接位置

JSON Schema（输出结构说明）只能有一个权威拼接点。

问题：

- 如果实验服务层拼一次 schema，provider adapter 再隐式拼一次 schema，就会造成重复约束。
- 重复拼接会让 prompt 来源不清晰，也会让用户误判究竟是哪段约束起作用。

待定原则：

- `User Prompt` 只放用户任务输入。
- JSON Schema 不应混入用户输入正文。
- provider adapter 只负责协议转换和发送，不应该偷偷改写 prompt。
- 推荐新增统一 `PromptBuilder / StructuredOutputPromptBuilder`。
- 由这个 builder 构造最终 messages：
  - system/developer message：模型行为约束 + JSON Schema
  - user message：用户原始任务
- 最终代码里只允许这个 builder 拼接 JSON Schema。

最新原则（2026-05-26）：

- 实验面板不允许任何“自动注入但不可编辑”的提示词。
- 所有会进入模型 `messages` 的提示词内容，都必须在 GUI 中可见、可编辑，并由开发者掌握。
- 后端/PromptBuilder 不应偷偷追加 JSON-only 规则、字段说明、失败处理规则或工具说明。
- 如果需要默认提示词，只能作为输入框里的默认文本出现，开发者可以直接修改或删除。
- 请求预览只负责展示最终发送内容，不应成为用户第一次看到隐藏提示词的地方。
- `PromptBuilder` 后续职责应收窄为“组装用户已经确认的消息和参数”，而不是生成新的提示词内容。

#### 提示词方案切换

实验面板需要支持轻量提示词方案切换，避免每次手动输入 prompt 和 schema 后被覆盖或难以对比。

这里不需要完整实验 case 管理，只保存手动输入成本高的内容。

保存内容：

- System Prompt
- User Prompt
- JSON Schema（输出结构说明）

不保存内容：

- 模型选择
- 约束模式
- temperature
- top_p
- max_tokens
- stream / blocking
- seed
- 运行结果
- raw output
- parsed JSON
- metrics

推荐名称：

- 提示词方案
- Prompt Preset

模板字段：

```json
{
  "id": "string",
  "name": "string",
  "systemPrompt": "string",
  "userPrompt": "string",
  "jsonSchema": {},
  "createdAt": "string",
  "updatedAt": "string"
}
```

页面交互：

- 顶部或 Prompt 区域上方显示提示词方案切换。
- 支持新建方案。
- 支持复制当前方案。
- 支持重命名方案。
- 支持删除方案。
- 支持保存当前方案。
- 切换方案时只替换 System Prompt、User Prompt、JSON Schema。
- 参数区和模型选择保持当前页面状态，不随方案切换。
- 修改后显示“未保存”状态。
- 不建议常驻展示 `方案名称` 输入框；它会让用户误以为每次实验都必须填写名称。
- 方案名称只应在以下场景出现：
  - 新建方案
  - 复制为新方案
  - 重命名方案
  - 首次保存未命名草稿
- 日常编辑状态只显示当前方案名和未保存状态。

推荐交互形态：

```text
提示词方案：
[Vue 预研 JSON] [严格 JSON] [宽松分析] [+ 新建] [复制] [保存] [删除]
```

目的：

- 快速比较不同 system prompt 的约束能力。
- 快速比较不同 user input 的任务表达。
- 快速比较不同 JSON Schema 描述粒度。
- 不把参数和结果混入提示词方案，保持实验面板轻量。

2026-05-26 追加记录：

- 当前页面出现常驻 `方案名称` 输入字段，用户反馈疑惑：“为什么会有这个输入字段？”
- 该字段的真实用途只是给保存后的提示词方案命名，不是模型调用输入，也不是实验参数。
- 后续 GUI 应避免把它和 Prompt/System/User/输出结构放在同一层级。
- 推荐改成：
  - 当前方案以标题或下拉选项展示。
  - `重命名` 按钮打开小弹窗或行内临时编辑。
  - `复制为草稿` 后给出明确状态，例如“未保存副本”，但不强迫用户立即处理名称。
  - `保存为方案` 如果没有名称，再弹出命名动作。

删除方案要求：

- 提示词方案必须支持删除。
- 只有选中已保存方案时显示或启用 `删除方案`。
- 删除前需要确认，避免误删。
- 删除后切回 `当前草稿`，并保留当前编辑内容或清空策略需要明确。
- 删除成功/失败要有页面反馈。
- 不允许删除时影响模型参数、运行结果和历史 runs。

#### 调用方式控件视觉

当前 `Blocking / Stream` 如果做成普通按钮，容易被误认为是“点击后立即输出”的执行按钮。

待调整原则：

- `Blocking / Stream` 是调用方式设置，不是运行按钮。
- 必须放在明确标题下，例如：`调用方式` 或 `运行模式`。
- 视觉上应使用 segmented control / radio group，而不是普通 command button。
- 每个选项需要短说明：
  - `Blocking`：一次性返回完整结果。
  - `Stream`：边生成边返回片段，完成后再拼接解析。
- 调用方式控件不应该紧贴在服务商/模型选择下方，让用户误以为它属于服务商配置。
- 推荐归入 `调用设置` 或 `运行设置` 区域。
- 真正的执行按钮必须视觉上区分：
  - `运行一次`
  - `按当前方式运行`
  - `开始实验`
- 如果保留单独的 `Stream 运行` 按钮，也必须和调用方式切换控件分区，避免同屏出现两个类似“Stream”按钮造成混淆。

#### 运行设置区域占位过大

2026-05-26 追加记录：

当前 `运行设置` 面板内容有限，主要包含调用方式和输出约束模式，但占据了较大的面板面积，挤压了提示词、请求预览和结果观察区域。

待调整原则：

- `运行设置` 应缩小为紧凑工具条或可折叠区域。
- 默认只展示当前选择摘要，例如：
  - `调用方式：Stream`
  - `约束：API JSON`
  - `运行按钮`
- 详细说明可以折叠展开，不应常驻占据大块空间。
- `按当前设置运行` 按钮应靠近提示词/参数区域，避免和页面级操作混淆。
- `Blocking / Stream` 与 `Loose Text / Prompt JSON / API JSON / Legacy Text` 可以用紧凑 segmented control 展示。
- 高价值区域优先级：
  1. 提示词与期望输出 JSON
  2. 实际发送内容
  3. 模型返回与校验结果
  4. 实验参数
  5. 运行设置说明

推荐形态：

```text
运行设置  [Blocking] [Stream]   输出约束 [Loose] [Prompt JSON] [API JSON] [Legacy]   [按当前设置运行]
```

或：

```text
运行设置：Stream / API JSON  [修改] [按当前设置运行]
```

#### 输出约束模式控件视觉

`Loose Text / Prompt JSON / API JSON / Legacy Text` 是输出约束模式，不是执行按钮。

当前如果做成按钮组，用户容易误以为点击后会立即运行模型。

模式含义：

| 模式 | 含义 | 用途 |
| --- | --- | --- |
| Loose Text | 不要求 JSON，模型按自然习惯输出，可能是自然语言、Markdown、列表或代码块 | 观察模型默认输出习惯 |
| Prompt JSON | 只在提示词里要求 JSON，不使用 API `response_format` | 测试仅靠 prompt 的约束能力 |
| API JSON | 使用 API JSON 强约束，如 `response_format: { "type": "json_object" }`，并配合提示词说明 | 测试正式 Agent 推荐约束方式 |
| Legacy Text | 显式允许旧文本输出 | 兼容旧路径或做对照实验 |

待调整原则：

- 必须放在明确标题下，例如：`输出约束模式`。
- 使用 radio group / segmented setting，而不是普通执行按钮。
- 每个选项需要短说明，至少 hover 或说明文本可见。
- 默认选中 `API JSON`。
- 正式 Agent 链路不应依赖 `Loose Text` 或 `Legacy Text`。
- 该控件要和真正执行按钮分区。

推荐交互形态：

```text
输出约束模式
( ) Loose Text    不约束，观察模型自然输出
( ) Prompt JSON   只靠提示词要求 JSON
(*) API JSON      使用 response_format 强制 JSON object
( ) Legacy Text   旧文本兼容模式
```

#### 工具调用实验

当前单独显示 `工具调用` 勾选是不完整的，容易让用户误以为已经接入真实工具系统。

调整方向：

- 工具调用应作为独立实验区域，而不是一个孤立 checkbox。
- 第一版直接给出几个常用内置工具，用户勾选后实际注入到模型请求。
- 自定义工具第一版应支持定义 schema 和模拟返回，不执行任意本地代码。
- 真实工具执行需要后续单独设计权限、安全边界、结果回填和审计日志。

建议内置工具：

| 工具 | 用途 | 是否真实执行 |
| --- | --- | --- |
| `calculator` | 测试模型生成结构化函数参数和数值计算意图 | 可本地安全执行四则运算 |
| `current_time` | 测试无参数或简单参数工具调用 | 可本地安全执行 |
| `json_validator` | 测试模型把 JSON 内容传给工具校验 | 可本地安全执行 |
| `echo_tool` | 原样返回入参，观察 tool call 参数结构 | 可本地安全执行 |
| `mock_search` | 模拟搜索结果，观察检索型工具调用 | 不访问网络，返回固定 mock 数据 |

基础工具后续追加记录：

- 用户希望基础工具中加入一些 CLI 命令类工具，用于观察模型如何生成命令执行意图、参数和工具结果。
- 第一版 CLI 工具必须只做 mock，不真实执行 shell / cmd / PowerShell。
- CLI 工具应和文件 CRUD 一样清楚标记 `mock` 状态，避免误以为已经具备真实命令执行能力。
- 请求预览必须展示最终注入的 CLI tool schema。
- 结果区必须展示模型生成的命令、参数和 mock result。

建议 CLI mock 工具：

| 工具 | 用途 | 第一版建议 |
| --- | --- | --- |
| `cli_run` | 观察模型生成一条命令和参数 | 只返回 mock，不执行 |
| `cli_list_processes` | 模拟查看进程列表 | 固定 mock 数据 |
| `cli_check_env` | 模拟检查运行环境或版本信息 | 固定 mock 数据 |
| `cli_run_tests` | 模拟运行测试命令并返回摘要 | 固定 mock 结果 |

CLI 工具安全原则：

- 默认不允许真实执行任意命令。
- 后续如果接入真实执行，必须限制在当前 workspace，必须有命令白名单、超时、输出截断和二次确认。
- 高风险命令、删除命令、网络传输命令、权限提升命令必须默认禁止。
- 所有真实命令执行都必须有审计日志。

自定义工具第一版字段：

```json
{
  "name": "string",
  "description": "string",
  "parameters": {
    "type": "object",
    "properties": {},
    "required": []
  },
  "mockResult": {}
}
```

工具调用实验区域需要展示：

- 可用工具列表。
- 每个工具的 function schema。
- `tool_choice`：
  - `auto`
  - `none`
  - `required`
  - 指定某个工具
- 模型返回的 `tool_calls`。
- 流式模式下的 `tool_call_delta`。
- 工具入参 JSON。
- 工具模拟/执行结果。
- 工具结果是否回填给模型继续生成。

第一版推荐范围：

- 支持内置安全工具，并能通过勾选启用。
- 勾选后的工具必须进入实际模型请求：
  - 优先注入 API 原生 `tools` 参数。
  - 如果当前 provider/model 不支持工具调用，再在请求预览中明确标记“未注入 / 不支持”。
  - 不要只在提示词里说“你可以使用工具”，否则无法观察真实 tool call 行为。
- 支持自定义工具 schema + mockResult。
- 支持展示 tool call 和参数。
- 支持手动/自动返回 mock result。
- 暂不支持执行任意脚本、文件操作、shell、网络访问。

后续文件工具实验记录：

用户希望工具调用实验中增加读删改查文件相关工具，用来观察模型后续如何产出 tool call、工具结果和最终输出。

建议新增文件工具分组：

| 工具 | 用途 | 风险级别 | 第一版建议 |
| --- | --- | --- | --- |
| `file_list` | 列出指定目录文件 | 低 | 可先 mock，再接只读沙箱 |
| `file_read` | 读取指定文件内容 | 中 | 可先 mock，再接只读白名单 |
| `file_search` | 按关键字搜索文件 | 中 | 可先 mock，再接只读白名单 |
| `file_write` | 写入或创建文件 | 高 | 第一版只 mock，不真实写 |
| `file_update` | 修改已有文件 | 高 | 第一版只 mock，后续需 diff 预览和确认 |
| `file_delete` | 删除文件 | 最高 | 第一版只 mock，真实执行必须单独权限确认 |

文件工具安全原则：

- 默认不真实执行写入、修改、删除。
- 文件工具必须显示目标路径、参数、模拟结果或真实结果。
- 真实执行前需要工作区边界校验，路径必须限制在当前 workspace。
- `file_write / file_update / file_delete` 必须有二次确认或审批机制。
- 删除不能直接执行永久删除，后续可考虑移动到回收区或生成待执行计划。
- 所有文件工具调用需要记录审计日志：
  - 工具名
  - 参数
  - 目标路径
  - 是否真实执行
  - 执行结果
  - 时间戳
- 实验面板可以先观察模型是否会正确生成文件工具参数，不急于接真实文件操作。

工具注入规则：

- 用户勾选工具后，请求预览必须展示最终 `tools` 数组。
- `tool_choice` 必须和工具列表在同一区域展示。
- 如果工具调用开启但没有勾选任何工具，运行按钮应提示或禁用。
- 提示词中可以补充一句工具使用说明，但不能替代 API `tools` 注入。
- 如果 provider 不支持原生 tools，可作为对照实验降级为 Prompt 工具说明，但 UI 必须明确这是“提示词模拟工具”，不是 API tool call。

推荐默认勾选：

- `calculator`
- `current_time`
- `json_validator`

推荐可选工具：

- `echo_tool`
- `mock_search`

验收标准：

- 用户能看到模型何时决定调用工具。
- 用户能看到模型生成的工具名和参数。
- 用户能看到工具返回结果如何影响最终输出。
- 用户能从请求预览确认勾选工具确实进入了接口参数。
- 未启用工具时，不显示误导性的孤立 checkbox。

#### 标题区按钮与运行入口

当前标题区如果同时出现 `刷新模型` 和 `运行一次`，会让用户困惑。

问题：

- 标题区属于页面级区域，不应该放实验执行按钮。
- 真正运行前，用户需要先确认 prompt、输出结构、参数、调用方式和约束模式。
- 如果页面中多个位置都有“运行”按钮，用户会不知道哪个才是主入口。

待调整原则：

- 标题区只保留页面级操作，例如：
  - `刷新模型`
  - `查看历史`
- 不在标题区放 `运行一次`。
- 运行按钮统一放在 Prompt/运行设置区域。
- 如果已有 `Blocking / Stream` 调用方式设置，则只保留一个主按钮：
  - `按当前设置运行`
  - 或 `开始实验`
- 避免同时出现 `运行一次`、`Blocking 运行`、`Stream 运行` 等多个相似执行入口。

#### 页面级刷新按钮降噪

2026-05-26 追加记录：

当前标题区有 `刷新模型` 和 `刷新方案` 两个按钮，用户不清楚它们的用途。

实际含义：

- `刷新模型`：重新读取本地模型配置、服务商、模型列表和能力标记。
- `刷新方案`：重新读取本地保存的提示词方案列表。

问题：

- 它们不是实验主流程动作。
- 常驻头部会让用户误以为和模型运行有关。
- 正常情况下页面加载时就应该自动读取，无需用户手动刷新。

待调整原则：

- 默认不常驻显示这两个文字按钮。
- 页面初始化自动加载模型配置和提示词方案。
- 加载失败时再显示明确的重试按钮。
- 如果保留手动刷新，放到更多菜单或小图标里。
- 文案应更明确：
  - `重新读取模型配置`
  - `重新读取提示词方案`
- 刷新后要有反馈，例如“已更新模型配置 / 已更新提示词方案”。

#### 默认输出结构不应过重

当前默认 JSON Schema 过于完整，包含很多模型最终输出不会直接填写的字段，例如：

- `description`
- `required`
- `properties`
- `items`
- 嵌套字段说明

这会让用户误以为这些字段也是模型要返回的 JSON 内容，干扰观察模型输出。

待调整原则：

- 默认编辑区不直接展示完整 JSON Schema。
- 默认展示更直观的 `期望输出结构`，例如：

```json
{
  "taskTitle": "string",
  "goal": "string",
  "steps": ["string"],
  "risks": ["string"],
  "artifacts": [
    {
      "type": "string",
      "title": "string",
      "summary": "string"
    }
  ]
}
```

- 高级模式才展示完整 JSON Schema。
- 本地校验器可以内部把简洁结构转换成 schema-like 规则。
- 页面必须区分：
  - 模型最终要返回的 JSON。
  - 用于提示词约束和本地校验的结构说明。
- 默认体验应服务于“观察模型输出”，而不是让用户先读复杂 schema。

#### Schema 术语对人和模型都不友好

2026-05-26 追加记录：

用户反馈：完整 JSON Schema 对人都显得莫名其妙，更不应期待模型稳定区分“schema 规则”和“最终返回内容”。

核心问题：

- JSON Schema 是校验规则，不是模型最终答案样例。
- `type / description / required / properties / items` 容易被误认为模型也要返回的字段。
- 把完整 schema 直接暴露给用户，会增加理解成本。
- 把完整 schema 原样拼给模型，也可能让模型混淆“规则描述”和“输出内容”。

待调整原则：

- 实验面板默认只出现 `期望输出 JSON`，也就是模型最终应该返回的形状。
- 页面不再把默认区域命名为 `JSON Schema`。
- 高级 Schema 不应作为日常入口；如果保留，只用于开发者调试本地校验规则。
- PromptBuilder 优先把 `期望输出 JSON` 转成更自然的提示词，例如：
  - “最终只返回如下 JSON 形状”
  - “字段含义如下”
  - “不要返回 schema 里的 type/required/properties”
- 本地校验器可以在内部把简洁结构转换为校验规则，但不要把这个复杂度直接交给用户或模型。

推荐默认输入：

```json
{
  "taskTitle": "string",
  "goal": "string",
  "steps": ["string"],
  "risks": ["string"],
  "artifacts": [
    {
      "type": "string",
      "title": "string",
      "summary": "string"
    }
  ]
}
```

推荐模型提示表达：

```text
最终只返回一个 JSON object，形状如下。这里的 string 表示字段类型，不要把 string 当成固定内容：
{
  "taskTitle": "string",
  "goal": "string",
  "steps": ["string"]
}
```

后续修改方向：

- UI 文案从 `JSON Schema（输出结构说明）` 改为 `期望输出 JSON`。
- 暂时不需要 `高级 Schema` 入口；完整 schema 留到后续正式 Agent 契约设计时再考虑。
- 请求预览里清楚标注：发送给模型的是“期望输出形状”，不是要求模型返回 schema。
- 文档里继续保留内部字段名 `outputContract`，但 UI 不暴露这个概念。

最新决策：

- 当前实验面板只传入模型需要返回的字段。
- 不传 `type / description / required / properties / items` 等 JSON Schema 规则字段。
- 现阶段目标是观察模型能否按“最终返回字段形状”稳定输出。
- 正式 Agent 的严格契约、schema 规则、字段必填策略，后续设计 Agent 节点时再单独处理。

#### 最终请求预览

当前实验面板缺少“实际发送给模型的内容”预览，导致用户无法串起完整流程。

需要新增 `请求预览 / 实际发送内容` 区域。

该区域至少展示：

1. 最终 messages：
   - system/developer message
   - user message
   - tool message（如果后续有工具回填）
2. API 参数：
   - model
   - temperature
   - top_p
   - max_tokens
   - stream
   - response_format
   - tools
   - tool_choice
   - seed
   - stop
3. 约束来源：
   - 来自 System Prompt
   - 来自 User Prompt
   - 来自期望输出结构 / JSON Schema
   - 来自 API 原生参数，如 `response_format`
4. 最终请求 JSON：

```json
{
  "model": "...",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.2,
  "response_format": { "type": "json_object" }
}
```

目标：

- 用户能确认 JSON Schema 到底拼在哪里。
- 用户能确认 prompt、参数、工具、response_format 是否真的按预期发出。
- 实验流程从“输入 → 输出”升级为：

```text
输入区
→ 实际请求预览
→ 模型返回
→ 解析与校验
```

#### 批量/一致性结果详情

当前批量扫描或一致性测试只展示摘要表格，用户只能看到：

- runId
- parse 是否成功
- schema 是否成功
- latency
- tokens
- error

问题：

- 看不到每一轮模型实际输出了什么。
- 看不到每一轮 Parsed JSON。
- 看不到失败轮次的具体 raw output 和错误详情。
- 无法判断模型内容质量，只能判断成功/失败。

待调整原则：

- 批量/一致性运行结果必须能查看单轮实验产物。
- 这里的“产物”不是正式 Artifact，而是模型实验产物。

每轮至少可查看：

- Raw Output
- Parsed JSON
- Validation 详情
- Stream Events
- Metrics
- Error detail

推荐交互：

```text
3 次运行
├─ Run 1  parse ok  schema ok  1200ms  600 tokens  [展开]
│  ├─ Raw Output
│  ├─ Parsed JSON
│  ├─ Validation
│  └─ Metrics
├─ Run 2 ...
└─ Run 3 ...
```

也可以采用：

- 左侧结果列表。
- 右侧单轮详情面板。
- 点击某一行后，右侧展示该轮 Raw Output / Parsed JSON / Validation / Metrics。

增强能力：

- 默认展开失败的运行。
- 支持复制某次 raw output。
- 支持复制某次 parsed JSON。
- 支持对比两次运行的 parsed JSON 字段差异。

2026-05-26 追加记录，对应 `REC-2026-05-26-010`：

- `BATCH RESULTS` 不能是一个孤立结果区，需要和触发按钮建立明确 UI 联动。
- 点击 `按当前设置运行`、`开始温度扫描`、`开始一致性测试` 后，结果区需要显示本次结果来源。
- 推荐结果区标题从固定 `BATCH RESULTS` 调整为带来源的文案，例如：
  - `运行结果 - 单次运行`
  - `批量结果 - 温度扫描`
  - `批量结果 - 稳定性测试`
- 触发按钮附近和结果区顶部应共享同一个运行状态，例如：
  - preparing
  - invoking
  - parsing
  - succeeded
  - failed
- 运行中应高亮当前触发动作，完成后结果区仍保留来源标签，避免用户不知道当前列表是哪一个按钮产生的。
- 如果后续支持多类批量任务，结果区需要显示 `sourceAction` 或同等字段：
  - `single_run`
  - `temperature_sweep`
  - `consistency_test`
- 结果列表中的每一行也应带上来源上下文，例如：
  - 温度扫描：显示本轮 temperature。
  - 一致性测试：显示同参数第 N 次、seed 是否固定。

验收标准：

- 用户能看到每一次运行到底产出了什么。
- 用户能定位哪一次输出破坏了 JSON 或 schema。
- 批量结果既能看成功率，也能看具体输出质量。
- 用户能一眼判断当前结果区来自哪个按钮或哪类实验。

#### 温度扫描交互

当前 `扫温度` 按钮和 `温度扫描列表` 分离，交互不连贯。

问题：

- 用户看到 `扫温度` 时，不清楚它会扫哪些温度。
- 温度扫描列表放在较远位置，会让动作和参数断开。
- 扫描结果如果只显示摘要，也看不到每个温度下的具体输出产物。

待调整原则：

- `温度扫描列表` 必须和 `扫温度` 放在同一个区域。
- 该区域应命名为 `温度扫描` 或 `参数扫描`。
- 按钮文案应明确，例如：
  - `按列表扫描温度`
  - `开始温度扫描`
- 扫描列表旁边显示输入示例：
  - `0, 0.2, 0.5, 0.8, 1`
- 温度扫描结果必须复用“批量结果详情”交互。
- 每个温度运行都能查看：
  - Raw Output
  - Parsed JSON
  - Validation
  - Metrics
  - Error detail

推荐交互：

```text
参数扫描
温度列表 [0, 0.2, 0.5, 0.8, 1] [开始温度扫描]
```

验收标准：

- 用户能在点击前看清楚要扫描哪些温度。
- 扫描动作和扫描参数在视觉上属于同一组。
- 用户能查看每个温度对应的具体输出内容。

#### stop 与 seed 参数展示

`stop` 和 `seed` 都不应作为第一层高频参数展示。

`stop` 含义：

- 指定一个或多个停止字符串。
- 模型生成内容中一旦遇到这些字符串，服务商会提前结束输出。
- 它适合少数需要固定文本边界的场景。
- 对 JSON / Agent 场景不常用，且可能误截断 JSON、tool call 参数或结构化结果。

`seed` 含义：

- 用于尝试让同一模型、同一 prompt、同一参数下的输出可复现。
- 只有部分服务商和部分模型支持。
- 即使支持，也不应承诺绝对一致；模型版本、服务商实现、并发策略或底层更新都可能影响结果。
- 它适合模型输出实验、一致性测试、参数对比，不适合作为正式工作台的核心设置。

待调整原则：

- `stop` 放入 `高级参数`，默认空。
- `seed` 放入 `高级参数` 或 `一致性测试` 区域，默认空。
- 当输出约束模式为 `API JSON` / `Prompt JSON` 且填写了 `stop` 时，页面应提示：可能导致 JSON 被提前截断。
- 当服务商或模型不支持 `seed` 时，页面应标记“不支持 / 可能被忽略”。
- 参数说明需要明确：`seed` 是实验复现辅助，不是稳定输出 JSON 的主要手段。

#### reasoning_effort 参数展示

`reasoning_effort` 是推理型模型的“推理预算/思考强度”参数，不是所有模型都支持。

含义：

- 控制模型在输出最终答案前，愿意花多少内部 reasoning token。
- 较低档通常更快、更省 token，但复杂任务质量可能下降。
- 较高档通常更适合复杂规划、分析、代码推理，但延迟和 token 成本会上升。
- 它不会直接等同于“输出更长”，也不是 JSON 稳定性的主要开关。

待调整原则：

- 实验面板继续暴露该参数，方便观察不同推理预算的影响。
- 当前模型声明支持 reasoning 参数时正常启用。
- 不支持时禁用，并提示“当前模型不支持 / 服务商可能忽略”。
- 放在 `高级参数` 或 `推理设置` 区域，不和 temperature/top_p 混成一组。
- 选项应使用服务商实际支持的枚举值，例如 `minimal / low / medium / high` 或 `auto`。
- 流式输出里如果出现 `reasoning_delta`，应在结果区单独展示，避免和最终 JSON 混在一起。
- blocking 和 stream 都可以使用该参数；stream 只是更容易观察到 `reasoning_delta` 事件。

验收标准：

- 用户能理解它影响推理成本、延迟和复杂任务质量。
- 用户不会把它误认为“JSON 输出格式控制”。
- 不支持该参数的模型不会让用户误以为配置已经生效。

#### 服务商专属 thinking 参数

2026-05-26 追加记录：

DeepSeek 存在类似 `{"thinking": {"type": "enabled"}}` / `{"thinking": {"type": "disabled"}}` 的思考模式参数。该参数不是通用 OpenAI 标准字段，而是 DeepSeek provider-specific 扩展。

记录原则：

- `thinking` 不放入通用参数区。
- 只在 DeepSeek provider / DeepSeek 模型下显示。
- UI 分组应命名为 `服务商专属参数` 或 `DeepSeek 参数`。
- 请求预览必须明确标记它是 DeepSeek 扩展字段。
- 如果通过 OpenAI-compatible SDK 传递，应走 provider-specific body / extra_body 机制。
- 不应和 `reasoning_effort` 混为一谈：
  - `reasoning_effort` 是推理预算/强度，部分模型支持。
  - `thinking.type` 是 DeepSeek 思考模式开关。
- 流式输出中如果返回 `reasoning_content` / `reasoning_delta`，结果区继续单独展示，不拼入最终 JSON。

推荐 UI：

```text
服务商专属参数
DeepSeek Thinking  [enabled] [disabled]
说明：DeepSeek 扩展字段，不是通用 OpenAI 参数。
```

风险提示：

- 不同 provider 对 reasoning/thinking 字段命名不同。
- 即使协议是 OpenAI-compatible，也不代表所有扩展字段通用。
- 实验台需要按 provider 能力动态展示，不要让用户误以为所有模型都支持。

#### DeepSeek / MiMo thinking 与超参失效

2026-05-26 追加记录：

DeepSeek 和 MiMo 都存在 provider-specific thinking 模式，并且 thinking 开启后部分采样超参可能不生效。

DeepSeek：

- `thinking.type` 支持 `enabled / disabled`。
- thinking mode 下不支持或不生效：
  - `temperature`
  - `top_p`
  - `presence_penalty`
  - `frequency_penalty`
- 为兼容 OpenAI-compatible 客户端，传入这些参数可能不报错，但模型不会按这些参数采样。

MiMo：

- MiMo 也存在 `thinking.type`，不同模型默认值不同。
- `mimo-v2.5-pro / mimo-v2.5 / mimo-v2-pro / mimo-v2-omni` 默认 thinking enabled。
- `mimo-v2-flash` 默认 thinking disabled。
- MiMo 支持主动传 `thinking.type = enabled / disabled`，不是完全不能关闭。
- MiMo thinking mode 下部分模型不支持自定义 `temperature`，传入后可能被覆盖为推荐默认值。

GUI 规则：

- thinking 开启时，采样参数区必须显示“可能不生效 / provider 会接管采样策略”。
- 参数扫描中，如果 thinking enabled，不应默认允许扫描 `temperature/top_p`，否则实验结果会误导。
- 请求预览需要区分：
  - 标准参数
  - provider-specific 参数
  - 已禁用或预计不生效的参数
- 如果 adapter 仍发送这些参数，预览里要标记“发送但预计不生效”。
- 更推荐 adapter 按 provider-specific rules 过滤无效参数，并在预览里展示过滤原因。
- `reasoning_delta / reasoning_content` 仍然作为流式事件单独展示，不参与最终 JSON parse。

推荐 UI：

```text
服务商专属参数
Thinking: default / enabled / disabled

采样参数提示：
当前 thinking enabled，temperature/top_p/presence_penalty/frequency_penalty 可能不生效。
```

#### presence_penalty 与 frequency_penalty 参数展示

`presence_penalty` 和 `frequency_penalty` 都是采样惩罚参数，用来影响模型是否重复已有内容。

`presence_penalty` 含义：

- 只要某个 token / 主题已经出现过，就对再次出现施加惩罚。
- 值越高，模型越倾向于引入新内容、新角度。
- 适合观察开放式写作、头脑风暴、方案发散时是否减少重复。

`frequency_penalty` 含义：

- 根据某个 token 已经出现的次数施加惩罚。
- 出现越多，后续再次出现的概率越低。
- 更偏向控制“同词/同句反复出现”的问题。

JSON / Agent 场景风险：

- 两者都可能降低结构化输出的稳定性。
- 较高惩罚可能让模型避免重复字段名、枚举值或固定模板表达。
- 在 JSON 输出实验中，默认值应为 `0`。
- 正式 Agent 链路一般不需要启用这两个参数，除非有明确重复问题。

待调整原则：

- 实验面板继续暴露这两个参数，方便测试影响。
- 放入 `高级参数` 或 `采样高级参数`。
- 默认值为 `0`。
- 在 JSON 约束模式下，较高数值需要提示“可能影响字段和结构稳定性”。
- 请求预览中展示实际发送值。

验收标准：

- 用户能分清：
  - `presence_penalty` 更偏向鼓励新内容。
  - `frequency_penalty` 更偏向减少高频重复。
- 用户知道它们不是 JSON 稳定性参数。
- 用户能通过批量/一致性测试观察它们是否破坏结构稳定。

### 1. 模型选择

面板顶部选择本次测试使用的模型：

- 使用当前默认模型
- 指定服务商
- 指定模型
- 指定调用模式：blocking / stream
- 指定温度、top_p、max tokens、reasoning effort 等调用参数

需要显示当前模型能力：

- 是否支持流式
- 是否支持工具调用
- 是否声明支持结构化输出
- 当前 API Key 是否可用

### 1.1 调用参数控制

面板必须提供可调参数区，用来观察不同采样策略对输出的影响。

这里是实验面板，不是正式工作台，因此需要继续暴露足够多的模型调用参数。展示方式要强调“实验参数”，并通过分组、说明、请求预览和结果指标帮助用户理解影响。

基础参数：

| 参数 | 控件建议 | 观察重点 |
| --- | --- | --- |
| temperature | slider + number input | 创造性、随机性、JSON 稳定性 |
| top_p | slider + number input | 采样范围、输出发散程度 |
| max_tokens | number input / presets | 是否截断 JSON、长输出稳定性 |
| stream | toggle | 流式体验、最终 JSON 拼接稳定性 |
| timeout_ms | number input | 慢模型或长任务是否超时 |
| retry_count | stepper | 解析失败后的重试策略 |
| seed | optional number input | 可复现实验；仅部分模型支持 |

高级参数：

| 参数 | 控件建议 | 说明 |
| --- | --- | --- |
| reasoning_effort | segmented select | 推理型模型的思考强度；影响延迟、成本和复杂任务质量 |
| presence_penalty | slider + number input | 鼓励新内容；JSON 场景下可能影响结构稳定 |
| frequency_penalty | slider + number input | 减少高频重复；JSON 场景下可能影响固定字段表达 |
| stop | tag input | 测试 stop 是否误截断 JSON |
| tool_calling | toggle | 测试工具调用与 JSON 输出是否冲突 |

高级参数默认展示原则：

- `高级参数` 区域默认收起。
- 默认展开区域只保留最常用、最影响实验结果的基础参数，例如 `temperature`、`top_p`、`max_tokens`、`timeout_ms`、`retry_count`。
- `reasoning_effort`、`seed`、`presence_penalty`、`frequency_penalty`、`stop` 等放在默认收起的高级区域。
- 高级参数被设置为非默认值时，折叠标题处应显示摘要或提示，避免用户忘记已有配置正在影响实验。

2026-05-26 追加记录，对应 `REC-2026-05-26-011`：

- `max_tokens` 不再使用自由数字输入作为默认控件，改为下拉框。
- 下拉框提供固定预设值，便于实验对比和减少误操作。
- 建议选项：
  - `512`
  - `1024`
  - `2048`
  - `4096`
  - `8192`
  - `16384`
- 默认值继续使用 `4096`。
- 控件说明需要保留：过低可能截断 JSON，过高可能增加延迟和成本。
- 如果后续确实需要任意自定义值，应放在“自定义”或高级模式里，不作为第一版默认输入方式。

默认参数建议：

```json
{
  "temperature": 0.2,
  "top_p": 1,
  "max_tokens": 4096,
  "stream": false,
  "timeout_ms": 60000,
  "retry_count": 0,
  "reasoning_effort": "auto",
  "seed": null,
  "presence_penalty": 0,
  "frequency_penalty": 0,
  "stop": [],
  "tool_calling": false
}
```

JSON 稳定性测试建议默认使用低温度：

- `temperature = 0` 或 `0.2`
- `top_p = 1`
- `retry_count = 0`

这样可以先观察单次输出的真实稳定性，避免重试掩盖问题。

### 1.2 参数预设

面板需要提供参数预设，便于快速对比。

建议预设：

| 预设 | temperature | top_p | 目的 |
| --- | ---: | ---: | --- |
| 稳定 JSON | 0 或 0.2 | 1 | 正式 Agent 默认候选 |
| 平衡分析 | 0.5 | 0.9 | 看分析质量和稳定性平衡 |
| 发散探索 | 0.8 | 0.95 | 看模型预研、创意任务表现 |
| 极限随机 | 1.0+ | 1 | 压测 JSON 约束是否仍稳定 |

预设切换只改变参数，不改变 Prompt 和 JSON Schema。

### 1.3 批量参数扫描

为了观察参数影响，面板应支持批量运行。

批量维度：

- temperature 列表：`[0, 0.2, 0.5, 0.8, 1]`
- top_p 列表：`[0.8, 0.9, 1]`
- response_format 模式：Loose Text / Prompt JSON / API JSON
- stream：on / off
- seed：固定 / 不固定

批量结果表建议字段：

| 字段 | 说明 |
| --- | --- |
| runId | 本次实验 ID |
| modelId | 使用模型 |
| mode | blocking / stream |
| constraintMode | 约束模式 |
| temperature | 温度 |
| top_p | top_p |
| max_tokens | max tokens |
| seed | seed |
| jsonParseOk | JSON 是否解析成功 |
| schemaOk | 是否符合 JSON Schema |
| missingFields | 缺失字段 |
| extraFields | 额外字段 |
| latencyMs | 总耗时 |
| firstTokenMs | 首 token 时间 |
| totalTokens | 总 token |
| estimatedCost | 成本估算，可为空 |
| finishReason | 完成原因 |
| errorCode | 错误码 |

批量视图要能快速看出：

- 哪个参数组合最稳。
- 哪个组合最容易输出 Markdown 或解释文本。
- 哪个组合容易截断 JSON。
- 流式和非流式在同参数下是否有差异。
- 同一参数连续运行多次是否稳定。
- 成本、延迟和稳定性之间的取舍。

### 2. 提示词编辑区

需要支持直接修改提示词，观察提示词约束能力。

建议拆成三块：

1. System Prompt
2. User Prompt
3. JSON Schema（输出结构说明）

System Prompt 示例用途：

- 约束模型身份
- 约束只输出 JSON
- 约束禁止 Markdown、解释文本、代码块

User Prompt 示例用途：

- 输入实际任务，比如“帮我预研下 Vue”
- 输入复杂一点的模糊任务，观察模型是否能稳定结构化

JSON Schema 示例用途：

```json
{
  "type": "object",
  "description": "Vue 预研任务的结构化输出。这个 schema 会写入 prompt，并在本地用于校验模型返回，不是模型 API 原生字段。",
  "required": ["taskTitle", "goal", "steps", "risks", "artifacts"],
  "properties": {
    "taskTitle": {
      "type": "string",
      "description": "用一句话概括用户要完成的任务，不超过 30 个字"
    },
    "goal": {
      "type": "string",
      "description": "说明本次任务最终要达成的目标，面向用户表达"
    },
    "steps": {
      "type": "array",
      "description": "完成该任务建议执行的步骤，按执行顺序排列",
      "items": {
        "type": "string",
        "description": "单个步骤，使用动词开头"
      }
    },
    "risks": {
      "type": "array",
      "description": "任务执行中可能遇到的风险、前提缺失或不确定性",
      "items": { "type": "string" }
    },
    "artifacts": {
      "type": "array",
      "description": "执行过程中应该产出的结构化成果",
      "items": {
        "type": "object",
        "required": ["type", "title", "summary"],
        "properties": {
          "type": {
            "type": "string",
            "description": "产物类型，如 ResearchSummary、TechEvaluation、TaskPlan"
          },
          "title": {
            "type": "string",
            "description": "产物标题"
          },
          "summary": {
            "type": "string",
            "description": "产物内容摘要，不超过 80 字"
          }
        }
      }
    }
  }
}
```

说明：

- 这里的 JSON Schema 是应用层概念，不是模型 API 原生字段。
- 它会被拼入 prompt，帮助 LLM 理解字段语义。
- 模型返回后，本地校验器用它检查字段缺失和类型漂移。
- API 原生强约束仍然是 `response_format: { "type": "json_object" }`。

### 3. 约束模式

面板必须支持对比以下模式：

| 模式 | Prompt 约束 | API response_format | 目的 |
| --- | --- | --- | --- |
| Loose Text | 否 | 否 | 看模型自然输出 |
| Prompt JSON | 是 | 否 | 验证只靠提示词是否稳定 |
| API JSON | 是 | `json_object` | 验证强约束稳定性 |
| Legacy Text | 可选 | 显式 legacy_text | 兼容旧路径，仅用于对照 |

默认选中：

- API JSON

### 4. 运行按钮

建议按钮：

- `运行一次`
- `流式运行`
- `批量对比`
- `清空结果`
- `复制 JSON`
- `保存为提示词模板`

点击后必须有明确反馈：

- 正在调用
- 首个 token / 首个 delta 时间
- 完成时间
- 解析成功或失败
- 错误码与错误原因

#### 主运行按钮无反馈问题

2026-05-26 追加记录：

用户反馈：点击 `按当前设置运行` 后无反应。

待排查方向：

- 按钮是否被 `contractError`、running 状态或表单校验隐式禁用。
- 点击后是否进入 running，但 UI 反馈不明显。
- IPC 调用是否失败但错误没有展示到页面。
- 模型配置/API Key 缺失时是否没有明确提示。
- 请求预览是否更新但结果区没有状态变化。
- stream/blocking 调用错误是否被吞掉。

待调整原则：

- 点击主运行按钮后必须立即显示状态：
  - `准备请求`
  - `正在调用模型`
  - `等待首个响应`
  - `解析输出`
  - `完成 / 失败`
- 即使调用失败，也必须在结果区或错误条显示原因。
- 如果按钮不可点击，旁边必须显示禁用原因。
- 结果区空状态在点击后应切换为运行中状态，而不是继续静止。
- IPC 返回错误、模型配置缺失、API Key 缺失、输出结构 JSON 错误都要有明确提示。

### 5. 输出展示

输出区域建议分栏：

1. Raw Output
2. Parsed JSON
3. Validation Result
4. Stream Events
5. Metrics

#### 单次运行结果空状态

2026-05-26 追加记录：

当前结果面板未运行时显示 `等待运行`，用户不清楚这个面板是干嘛的。

待调整原则：

- 结果面板标题应固定表达区域职责，例如：
  - `单次运行结果`
  - `模型返回结果`
  - `运行结果观察`
- 未运行时不应只显示 `等待运行`。
- 空状态需要说明这里会展示什么，例如：

```text
尚未运行
点击“按当前设置运行”后，这里会展示模型原始输出、解析后的 JSON、校验结果、流式事件、token 和耗时。
```

- tabs 在没有结果时可以禁用或显示空状态说明。
- `Raw Output / Parsed JSON / Validation / Stream Events / Metrics / Tools` 这些结果类型应在空状态中被解释清楚。
- 运行后标题再显示 runId，runId 作为辅助信息，不作为主要标题。

#### 批量运行结果参数关联

2026-05-26 追加记录，对应 `REC-2026-05-26-009`：

当前 `5 次运行` / 批量结果区域只能看到运行后的结果摘要，看不出来每一轮对应哪些参数，因此无法判断“哪个参数对输出造成了什么影响”。

待调整原则：

- 批量结果列表每一行必须展示本轮关键参数。
- 温度扫描结果必须突出 `temperature`，例如：
  - `temp 0`
  - `temp 0.2`
  - `temp 0.8`
- 如果同时扫描多个维度，还应展示：
  - `top_p`
  - `constraintMode`
  - `mode / stream`
  - `seed`
  - `max_tokens`
  - `thinking_type`
  - `enabled_tools`
  - `tool_choice`
- 一致性测试如果所有参数相同，应显示：
  - `同参数第 1 次`
  - `同参数第 2 次`
  - 是否固定 seed
- 详情区需要以“参数 → 输出 → 校验 → 指标”的顺序展示，帮助用户把参数变化和结果变化串起来。

推荐列表字段：

| 字段 | 说明 |
| --- | --- |
| runIndex | 第几次运行 |
| temperature | 本轮温度 |
| top_p | 本轮 top_p |
| constraintMode | 输出约束模式 |
| mode | blocking / stream |
| seed | 本轮 seed |
| parse/schema | JSON 解析和结构校验结果 |
| latency/token | 耗时和 token |
| finishReason | 完成原因 |

验收标准：

- 用户能直接看出每一轮使用了哪些参数。
- 用户能判断参数变化对 JSON 稳定性、内容发散、耗时和 token 的影响。
- 批量结果不再只是“运行后结果列表”，而是“参数对比结果”。

Raw Output：

- 原样展示模型返回内容
- 保留换行和代码块
- 用于观察模型有没有夹杂解释文字

Parsed JSON：

- 如果解析成功，展示格式化 JSON
- 如果解析失败，展示 parse error 和失败位置

Validation Result：

- 是否是合法 JSON
- 是否是 JSON object
- 是否符合 JSON Schema
- 缺少哪些字段
- 多了哪些字段
- 字段类型是否错误

Stream Events：

- start
- delta
- reasoning_delta
- tool_call_delta
- done
- error

Metrics：

- latencyMs
- firstTokenMs
- totalTokens
- promptTokens
- completionTokens
- finishReason
- estimatedCost
- runCount
- successRate

### 6. Token 与成本观察

面板需要记录每次调用的 token 和耗时信息，帮助判断某个模型、提示词、参数组合是否适合长期使用。

每次运行至少记录：

| 字段 | 说明 |
| --- | --- |
| promptTokens | 输入 token 数 |
| completionTokens | 输出 token 数 |
| totalTokens | 总 token 数 |
| latencyMs | 总耗时 |
| firstTokenMs | 首 token 时间，流式模式下尤其重要 |
| finishReason | 完成原因 |

如果模型配置中未来补充价格信息，则可以估算：

| 字段 | 说明 |
| --- | --- |
| inputCost | 输入成本估算 |
| outputCost | 输出成本估算 |
| totalCost | 总成本估算 |
| currency | 币种 |

第一版不强制要求真实成本计算，但 UI 和数据结构应预留位置。

成本观察的用途：

- 判断某套 prompt 是否过长。
- 对比不同模型的稳定性和成本。
- 发现 max_tokens 设置过大但实际输出很短的浪费。
- 发现高 reasoning effort 带来的延迟和 token 增长。

### 7. 多轮一致性测试

面板需要支持同一配置连续运行 N 次，用来观察模型输出是否稳定。

注意：这里的“一致性”不是承诺模型每次输出逐字相同，更准确的目标是观察结构稳定性、字段稳定性和内容漂移。

输入项：

- runCount：运行次数，例如 3 / 5 / 10。
- fixedSeed：是否固定 seed，仅支持 seed 的模型生效。
- stopOnFirstFailure：是否遇到第一次 JSON 解析失败就停止。
- delayMs：每次调用间隔，避免触发限流。

2026-05-26 追加记录，对应 `REC-2026-05-26-010`：

- UI 需要明确区分：
  - 未固定 seed：同一配置重复调用，结果可能不同。
  - 固定 seed：尝试复现实验，但不保证所有服务商或模型逐字一致。
- 如果 seed 为空且 fixedSeed 未开启，点击测试前或结果区中应提示：
  - 当前不会固定随机种子。
  - 低 temperature 只降低随机性，不等于确定性输出。
- 如果启用 fixedSeed 但服务商不支持 seed，结果区应显示“可能被忽略”。
- 建议按钮文案从 `开始一致性测试` 调整为更准确的：
  - `开始稳定性测试`
  - 或 `重复运行观察稳定性`
- 结果区需要展示本次测试的参数快照：
  - temperature
  - top_p
  - seed
  - fixedSeed
  - constraintMode
  - mode / stream
  - model / provider
  - reasoning / thinking 相关参数
- 汇总指标应区分：
  - JSON 解析是否稳定
  - 字段结构是否稳定
  - 内容是否发生漂移
  - 是否逐字一致

每轮结果记录：

| 字段 | 说明 |
| --- | --- |
| runIndex | 第几轮 |
| rawOutput | 原始输出 |
| parsedJson | 解析后的 JSON |
| jsonParseOk | 是否可解析 |
| schemaOk | 是否符合 JSON Schema |
| missingFields | 缺失字段 |
| extraFields | 额外字段 |
| latencyMs | 本轮耗时 |
| totalTokens | 本轮 token |
| errorCode | 错误码 |

汇总指标：

| 指标 | 说明 |
| --- | --- |
| jsonParseSuccessRate | JSON 解析成功率 |
| schemaSuccessRate | 契约校验成功率 |
| averageLatencyMs | 平均耗时 |
| averageTotalTokens | 平均 token |
| fieldStabilityScore | 字段稳定性评分 |
| contentDriftSummary | 内容漂移摘要 |

字段稳定性重点观察：

- 每次是否都有同一批必填字段。
- 数组字段是否时有时无。
- 字段类型是否漂移，例如 `steps` 有时是数组、有时是字符串。
- 是否偶尔出现 Markdown 包裹或解释性前缀。

内容漂移重点观察：

- 同一 prompt 是否得出完全不同的任务判断。
- risks、steps、artifacts 的数量是否大幅波动。
- 高温度下是否出现不稳定的假设或发散内容。

## 流式输出观察要求

流式 JSON 需要特别处理：

- delta 过程中不是完整 JSON，不应该边流边解析为最终结构。
- GUI 可以展示“生成中”的 raw stream。
- done 后再将完整拼接内容做 JSON parse。
- 如果 done 后 parse 失败，应显示 `MODEL_OUTPUT_PARSE_FAILED`。

面板需要帮助观察：

- 模型是否会在流式过程中输出 Markdown 包裹。
- 是否会先解释再给 JSON。
- 是否会出现半截 JSON 后 finish。
- reasoning 内容是否和最终 JSON 分离。

## 提示词模板管理

后续可支持保存模板。

模板字段建议：

```json
{
  "id": "string",
  "name": "string",
  "scenario": "task_understanding | research | implementation | review | custom",
  "systemPrompt": "string",
  "userPromptTemplate": "string",
  "jsonSchema": {},
  "responseFormat": "json_object",
  "defaultParams": {
    "temperature": 0.2,
    "top_p": 1,
    "max_tokens": 4096,
    "stream": false,
    "reasoning_effort": "auto"
  },
  "createdAt": "string",
  "updatedAt": "string"
}
```

模板用途：

- 对比不同提示词稳定性。
- 将验证稳定的模板迁移进正式 Agent 节点。
- 回溯某次模型行为测试使用的提示词版本。

## 后端建议

后端可以新增独立诊断接口，不影响正式任务运行：

- `model-lab:invoke`
- `model-lab:invoke-stream`
- `model-lab:run-parameter-sweep`
- `model-lab:run-consistency-test`
- `model-lab:validate-output`
- `model-lab:list-prompt-templates`
- `model-lab:save-prompt-template`

诊断接口不应该创建正式 conversation、task、artifact。

实验结果可以选择是否持久化。若持久化，建议放在应用级配置目录：

```text
<electron userData>/agent-config/model-lab/
├── prompt-templates.json
└── runs.jsonl
```

## 正式工作台的边界

正式 Agent 工作台不暴露复杂提示词编辑。

工作台只使用经过验证的模板和 JSON Schema：

- 用户输入目标
- 后端选择合适模板
- 模型返回 JSON
- 后端校验 JSON
- GUI 渲染结构化结果

实验面板负责调试和验证，工作台负责稳定执行。
