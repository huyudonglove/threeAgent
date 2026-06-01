# 工作台 UX 改造研发执行说明书（2026-05-25）

> 使用对象：
> 前端开发、主进程开发、存储/运行时开发、测试
>
> 关联文档：
> `docs/workbench-ux-diagnosis-and-refactor-direction-2026-05-25.md`
> `docs/workbench-ux-alignment-and-execution-plan-2026-05-25.md`
> `docs/record-version-index.md`

---

## 1. 文档目标

本文档不是产品方向说明，而是研发可直接执行的改造规格。

开发目标只有三条：

1. 把模型配置和插件管理从工作区依赖中抽离成应用级能力。
2. 把工作台从内部控制台改成用户导向的任务工作台。
3. 在不推翻现有运行时主干的前提下，补齐首页、任务启动、结果收口主链路。

---

## 2. 最终交付定义

本轮完成后，系统应满足以下定义：

### 2.1 应用级能力

以下能力不依赖工作区存在：

1. 模型配置
2. 插件管理
3. 最近工作区入口
4. 全局默认偏好

### 2.2 工作区级能力

以下数据仍归工作区：

1. WorkspaceManifest
2. ConversationRuntime
3. TaskRuntime
4. Workflow context
5. Artifact
6. DisplayTrace
7. AgentMemory
8. ResultPersistence
9. 工作区覆盖策略

### 2.3 工作台第一屏

工作台第一屏默认展示：

1. 当前任务
2. 当前进展
3. 下一步动作
4. 已有产出

以下内容进入“技术详情”：

1. TaskRuntime
2. WorkflowNodeState
3. Trace events
4. Artifact index
5. Memory manifest
6. 风险与错误细节

---

## 3. 当前代码与目标的差异

## 3.1 模型配置

当前：

1. `ModelConfigPage.vue` 强依赖 `useActiveWorkspace()`
2. `electron/preload.ts` / `src/electron-api.d.ts` 中模型接口均要求 `rootPath`
3. `ModelConfigManager` 将数据写入 `.agent-workspace/model-config/global-config.json`
4. Secret 也写入工作区路径
5. Provider preset 仍不完整
6. DeepSeek / MiMo 内置接入要求尚未进入技术规格
7. 健康检查默认写死为 `GET {baseUrl}/models + Authorization: Bearer`

目标：

1. 模型配置不要求先选择工作区
2. 模型配置默认存为应用级配置
3. 工作台判断模型可用性时，先查工作区覆盖，再查应用级默认配置
4. Provider 配置以 preset 驱动，而不是让普通用户手写大量字段
5. DeepSeek / MiMo 作为内置 provider 直接可选
6. 模型调用层与 provider 配置层要为流式输出做统一能力标注
7. 服务商配置与模型选择必须在交互和数据职责上拆开
8. Binding 在普通用户界面中必须改造成“使用场景模型配置”

## 3.2 插件管理

当前：

1. `PluginManagePage.vue` 强依赖 `useActiveWorkspace()`
2. 插件接口均要求 `rootPath`
3. `PluginConfigManager` 读写 `.agent-workspace/domains/plugin-config.json`

目标：

1. 插件管理默认管理应用级插件库
2. 工作区仅负责插件启用覆盖策略
3. 无工作区时可完整使用插件管理页

## 3.3 工作台主界面

当前：

1. 直接暴露 `Run overview / Workflow board / Execution timeline / Evidence panel`
2. 操作按钮为 `Resume / Advance / Complete Node / Block Node / Return to Node`
3. Quick Input 直接 `understandAndStart()`

目标：

1. 第一层改为任务、进展、下一步、产出
2. 操作按钮改成用户语义
3. Quick Input 增加“任务草案确认”
4. 应用全局顶部导航吸顶，滚动时仍能切换工作区、工作台、模型配置、输出实验、结果沉淀和插件管理。

### 3.3.1 全局导航吸顶要求

当前 `App.vue` 中的顶层导航是应用级入口。后续 GUI 修改时需要将其做成 sticky header。

实现要求：

1. 导航容器使用 `position: sticky` 或等效布局固定在应用内容顶部。
2. `top` 需要结合 Electron 窗口内容区域和现有布局计算，避免遮挡。
3. 导航层需要明确背景、边框或阴影，滚动时保持可读。
4. 内容区需要预留顶部空间，避免页面标题或锚点被导航栏盖住。
5. 当前路由的 tab 保持高亮。
6. 小屏下允许横向滚动导航，但不能换行挤压主内容。
7. 不把页面内部操作按钮混入全局导航栏。

---

## 4. 研发拆分原则

本轮按四条线并行：

1. `主进程与存储边界`
2. `IPC 与类型契约`
3. `页面与交互改造`
4. `测试与迁移`

推荐并行方式：

1. 主进程先补应用级配置存储与新 IPC
2. 前端先接新 IPC，再切页面逻辑
3. 页面切完后再清理旧 workspace 依赖
4. 测试最后补迁移、回归、验收

---

## 5. 模块级实施方案

## 5.1 新增应用级路径解析器

### 目标

把应用级配置从工作区路径中拿出来，统一放到 Electron `userData` 下。

### 建议新增文件

`src-main/storage/app-path-resolver.ts`

### 建议职责

提供以下路径：

```text
userData/
  agent-config/
    model-config.json
    secrets.json
    plugin-registry.json
    preferences.json
```

### 最低接口

```ts
class AppPathResolver {
  get appConfigDir(): string
  get modelConfigPath(): string
  get secretsPath(): string
  get pluginRegistryPath(): string
  get preferencesPath(): string
}
```

### 注意事项

1. 不修改现有 `PathResolver` 的工作区职责
2. 应用级与工作区级路径分离
3. 目录创建采用与 `WorkspaceManager` 一致的容错策略

---

## 5.2 模型配置改造成应用级

### 目标

让现有模型配置逻辑默认为应用级配置，同时保留工作区覆盖扩展位。

### 实施策略

采用“两层配置 + 一层解析”：

1. 应用级默认配置
2. 工作区级覆盖配置
3. resolver 合并输出最终结果

### 建议数据结构

#### 应用级

```ts
interface AppModelConfig {
  providers: ModelProviderConfig[]
  models: ModelProfileConfig[]
  bindings: ModelBindingConfig[]
  defaultProviderId?: string | null
  defaultModelId?: string | null
}
```

#### 工作区级覆盖

```ts
interface WorkspaceModelOverride {
  enabled: boolean
  providers?: ModelProviderConfig[]
  models?: ModelProfileConfig[]
  bindings?: ModelBindingConfig[]
  defaultProviderId?: string | null
  defaultModelId?: string | null
}
```

### 必须补充的 Provider / Model 契约字段

当前 `contracts.ts` 字段仍偏最小化，无法完整表达 preset、认证、流式和协议差异。

本轮建议补充但保持向后兼容：

#### Provider 扩展字段

```ts
interface ModelProviderConfig {
  id: string
  name: string
  apiBaseUrl: string
  type: 'openai' | 'anthropic' | 'custom'
  providerProtocol?: 'openai-compatible' | 'anthropic-compatible' | 'custom'
  authMode?: 'authorization-bearer' | 'api-key-header' | 'custom-header'
  authHeaderName?: string
  chatCompletionsPath?: string
  modelsPath?: string
  supportsStreaming?: boolean
  presetSource?: 'openai' | 'anthropic' | 'deepseek' | 'mimo' | 'custom'
  apiKeyRef: SecretRef
  enabled: boolean
  createdAt: string
  updatedAt: string
}
```

#### Model 扩展字段

```ts
interface ModelProfileConfig {
  id: string
  providerId: string
  modelName: string
  displayName: string
  capabilities: string[]
  contextWindow: number | null
  supportsReasoning?: boolean
  supportsToolCall?: boolean
  supportsStreaming?: boolean
  deprecated?: boolean
  deprecationNote?: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}
```

### Provider preset 要求

普通用户路径必须优先走 preset，而不是手写 provider 细节。

推荐新增：

```ts
interface ProviderPreset {
  id: string
  name: string
  icon?: string
  providerType: 'openai' | 'anthropic' | 'custom'
  providerProtocol: 'openai-compatible' | 'anthropic-compatible' | 'custom'
  defaultBaseUrl: string
  chatCompletionsPath?: string
  modelsPath?: string
  authMode: 'authorization-bearer' | 'api-key-header' | 'custom-header'
  authHeaderName: string
  secretEnvName?: string
  supportsStreaming: boolean
  recommendedModels: Array<{
    id: string
    modelName: string
    displayName: string
    capabilities: string[]
    deprecated?: boolean
    deprecationNote?: string
  }>
}
```

建议新增文件：

`src-main/model-config/provider-presets.ts`

该文件至少输出：

```ts
getBuiltinProviderPresets(): ProviderPreset[]
getPresetById(id: string): ProviderPreset | undefined
```

### 必须支持的内置 Provider preset

#### OpenAI

```text
providerId: openai
providerProtocol: openai-compatible
defaultBaseUrl: https://api.openai.com/v1
authHeaderName: Authorization
authMode: authorization-bearer
supportsStreaming: true
```

#### Anthropic

```text
providerId: anthropic
providerProtocol: anthropic-compatible
defaultBaseUrl: https://api.anthropic.com
authHeaderName: x-api-key
supportsStreaming: true
```

#### DeepSeek

```text
providerId: deepseek
providerName: DeepSeek
providerProtocol: openai-compatible
defaultBaseUrl: https://api.deepseek.com
chatCompletionsPath: /chat/completions
modelsPath: /models
authHeaderName: Authorization
authMode: authorization-bearer
secretEnvName: DEEPSEEK_API_KEY
supportsStreaming: true
```

推荐模型：

```text
deepseek-v4-flash
deepseek-v4-pro
```

兼容旧模型但标记 deprecated：

```text
deepseek-chat
deepseek-reasoner
```

#### MiMo

```text
providerId: mimo
providerName: MiMo
providerProtocol: openai-compatible
defaultBaseUrl: https://token-plan-cn.xiaomimimo.com/v1
chatCompletionsPath: /chat/completions
modelsPath: /models
authMode: api-key-header 或 authorization-bearer
secretEnvName: MIMO_API_KEY
supportsStreaming: true
```

推荐模型：

```text
mimo-v2.5-pro
```

### 页面交互必须遵循的规则

普通用户路径：

1. 选择服务商
2. 系统自动填充：
   - Provider ID
   - Provider Name
   - Base URL
   - 协议
   - 认证方式
   - 推荐模型列表
3. 用户只填写：
   - API Key
   - 默认模型选择
4. 高级设置中才允许修改：
   - Base URL
   - 自定义 Header
   - Context Window
   - Binding
   - 工作区覆盖

### 服务商配置与模型选择的职责拆分

必须明确：

```text
服务商 = 配置连接
模型 = 选择能力
```

服务商阶段只解决：

1. 选择服务商
2. 填 API Key
3. 必要时修改 Base URL
4. 测试连接

模型阶段只解决：

1. 从该服务商候选模型中选择默认模型
2. 查看模型用途说明
3. 生成模型能力信息

### 服务商配置区与模型配置区的页面边界

模型配置页必须拆成两个职责明确的区域，不能继续表现成两组相似表单。

#### 服务商配置区

只负责：

1. 我接入哪家服务商
2. 连接信息是否正确
3. API Key 是否可用

普通用户默认只显示：

| 字段 | 交互方式 | 说明 |
| --- | --- | --- |
| 服务商 | 卡片 / 下拉选择 | OpenAI、Anthropic、DeepSeek、MiMo、自定义 |
| API Key | 输入框 | 唯一必填用户输入 |
| Base URL | 自动填充，默认弱化 | 必要时可编辑 |
| 连接测试 | 按钮 | 返回状态、耗时、失败原因 |

普通用户默认不显示：

1. Provider ID
2. Provider Name
3. Auth Header
4. modelsPath
5. chatCompletionsPath
6. supportsStreaming

这些字段只在高级设置中可见或可编辑。

#### 模型配置区

只负责：

1. 默认用哪个模型
2. 该模型适合什么用途
3. 该模型具备哪些能力

普通用户默认只显示：

| 字段 | 交互方式 | 说明 |
| --- | --- | --- |
| 模型 | 下拉 / 卡片选择 | 来自 preset candidate 或远端模型列表 |
| 模型说明 | 只读文本 | 例如“速度快”“适合复杂推理”“成本低” |
| 默认模型 | 单选 / 设为默认 | 选择后进入待保存状态 |
| 支持能力 | 标签展示 | reasoning、tool_call、streaming 等 |

普通用户默认不显示：

1. Model ID
2. Model Name
3. Capabilities 原始编辑框
4. Context Window 原始输入框
5. Provider ID

### 推荐交互流程要求

推荐流程必须按前后关系组织，而不是两个并列表单：

```text
选择服务商
  -> 填 API Key
  -> 必要时修改 Base URL
  -> 测试连接
  -> 载入 / 生成模型候选
  -> 选择默认模型
  -> 保存配置
```

页面实现时允许“测试连接”放在选择模型之后再次执行，但默认主路径必须先建立“连接成功”，再强调模型选择。

### 连接测试要求

连接测试不仅是按钮，还必须有结构化反馈：

1. 状态：成功 / 失败 / 降级
2. 耗时：例如 `420ms`
3. 当前检查地址
4. 失败原因

推荐返回结构：

```ts
interface ProviderConnectionCheckResult {
  ok: boolean
  latencyMs: number | null
  checkedUrl: string
  message: string | null
  recoverable: boolean
}
```

### 保存行为要求

推荐保存逻辑：

1. 连接测试通过后，允许保存 Provider
2. 模型选择完成后，保存默认模型
3. 如果用户只完成服务商配置但未选模型：
   - 页面允许提示“还未选择默认模型”
   - 但不应 silently create unusable state

建议最小保存门槛：

```text
Provider 已配置
API Key 已保存
默认模型已选择
```

否则状态应保持为：

```text
misconfigured
```

### 模型配置 GUI 的组织原则

本轮不要求把模型配置页“降级成小白向导”，也不要求删除高级能力。

本轮真正要求是：

```text
从“数据表管理页面”
改成“模型连接与路由配置页面”
```

也就是说，高级用户仍然可以配置复杂参数，但页面组织必须符合开发者心智，而不是数据库维护心智。

### 不允许继续沿用的页面心智

以下页面组织方式视为不符合本轮要求：

1. 一级结构仍然是 Provider / Model / Binding / Secret 四块并列
2. 用户像维护四张数据表一样逐条录入对象
3. 默认模型、使用场景模型、API Key 关系不清楚
4. 测试失败仍只有笼统的“连接失败”

### 推荐页面结构

模型配置页建议按以下结构实现：

```text
模型配置

当前默认配置
  - 服务商
  - 默认模型
  - 连接状态
  - 流式输出状态
  - 最近测试结果

服务商连接
  - 服务商类型
  - Base URL
  - API Key
  - 认证方式
  - 测试连接

可用模型
  - 从服务商同步 / 使用内置列表
  - 选择默认模型
  - 查看模型能力标签
  - 添加自定义模型

使用场景模型
  - 需求理解
  - 任务规划
  - 任务执行
  - 结果检查
  - 总结归档

高级设置
  - ID
  - Headers
  - Paths
  - Scope
  - Priority
  - 导入 / 导出
```

### 当前默认配置区要求

页面顶部必须始终有“当前默认配置”摘要区，至少展示：

1. 当前默认服务商
2. 当前默认模型
3. 连接状态
4. 是否支持流式输出
5. 最近测试结果

建议结构：

```ts
interface CurrentModelConfigSummary {
  providerName: string | null
  modelDisplayName: string | null
  connectionState: 'healthy' | 'degraded' | 'failed' | 'untested'
  supportsStreaming: boolean | null
  lastCheckedAt: string | null
  latencyMs: number | null
  message: string | null
}
```

### 开发者操作顺序要求

开发者进入页面后，应该按以下顺序理解并操作：

1. 配置服务商连接
2. 验证连接是否成功
3. 获取或选择可用模型
4. 设置默认模型
5. 按使用场景覆盖模型
6. 在高级设置中处理底层参数

如果页面仍要求开发者按下面顺序操作，则说明实现方向错误：

```text
先维护 Provider 表
再维护 Model 表
再维护 Binding 表
再维护 Secret 表
```

### 字段展示规则补充

| 字段 / 概念 | 普通模式 | 高级模式 |
| --- | --- | --- |
| ID | 不展示 | 可查看 |
| 能力 | 标签展示 | 可勾选 / 调整 |
| Binding | 使用场景模型配置 | 可查看底层 Binding 信息 |
| API Key | 可填写 / 修改 | 不展示 secret key 内部名称 |
| Base URL | 自动填充，可弱化 | 可编辑 |
| Auth Header | 自动选择 | 可编辑 |
| Scope / Priority | 不展示 | 可编辑 |
| Paths | 不展示 | 可编辑 |
| 测试错误 | 结构化结果 | 可查看更多细节 |

### 测试错误展示要求补充

测试失败不能只显示“连接失败”。

至少要展示：

1. 检查地址
2. 耗时
3. 状态码
4. 错误消息
5. 响应摘要（如可获取）

建议错误结构：

```ts
interface ConnectionTestErrorDetail {
  checkedUrl: string
  latencyMs: number | null
  statusCode?: number | null
  statusText?: string | null
  responseSnippet?: string | null
  message: string
}
```

普通用户路径不允许在模型阶段手写：

1. Model ID
2. Model Name
3. Capabilities
4. Context Window

这些信息必须来自：

1. Provider preset
2. 或远端模型列表
3. 或高级设置中的自定义模型

### 模型候选来源要求

第一阶段允许采用：

```text
preset candidates first
remote model list optional
```

也就是：

1. OpenAI / Anthropic / DeepSeek / MiMo 先内置推荐模型列表
2. 后续再扩展“拉取远端模型列表”
3. 页面结构和接口需要为远端拉取预留

建议新增接口预留：

```ts
listProviderModelCandidates(providerId: string): Promise<ModelCandidate[]>
```

建议模型候选结构：

```ts
interface ModelCandidate {
  id: string
  modelName: string
  displayName: string
  capabilities: string[]
  contextWindow?: number | null
  deprecated?: boolean
  description?: string
}
```

### “使用场景模型配置”要求

本轮只改模型配置页命名与交互，不要求同时重命名整个工作台内部运行时对象。

普通用户界面中不得直接暴露：

```text
Binding
role
modelId
providerId
scope
priority
```

模型配置页需要改成：

```text
使用场景模型配置
```

推荐默认场景：

1. 需求理解
2. 任务规划
3. 任务执行
4. 结果检查
5. 总结归档

推荐交互：

1. 每个场景一行
2. 默认显示“使用默认模型”
3. 用户只需要选择“使用哪个模型”
4. 系统自动生成底层 `ModelBindingConfig`
5. `scope / priority` 进入高级设置

建议前端文案：

```text
所有场景默认使用默认模型。你可以为某些场景单独选择更合适的模型。
```

自定义 Provider 才允许手写：

1. Provider ID
2. Provider Name
3. Base URL
4. Model Name
5. Auth Header

### Health Check 改造要求

当前健康检查策略过于固定，不足以覆盖新版 provider preset。

必须改成基于 ProviderPreset / ProviderConfig 驱动：

1. 优先使用 provider 中的 `modelsPath`
2. 根据 `authMode` 生成请求头
3. 支持 `Authorization: Bearer <key>`
4. 支持 `x-api-key: <key>` 或 `api-key: <key>`
5. 健康检查允许 provider 定义为 blocking 模式

建议统一方法：

```ts
buildProviderHeaders(provider, apiKey): Record<string, string>
buildModelsUrl(provider): string
```

### 建议改造方式

#### 第一步：不破坏现有 API，先补应用级方法

新增方法：

```ts
readAppConfig()
writeAppConfig()
getAppConfigState()
getAppConfigStatus()
setAppDefaultProvider()
setAppDefaultModel()
setAppSecret()
listAppSecretKeys()
```

#### 第二步：工作台解析改为“覆盖 -> 默认”

`useWorkbenchData.ts` 中工作台读取模型状态时：

1. 若存在当前工作区覆盖，优先使用覆盖
2. 否则读取应用级默认配置

#### 第三步：页面切换为应用级入口

`ModelConfigPage.vue`：

1. 去掉 `hasActiveWorkspace` 阻塞判断
2. 默认加载应用级配置
3. 将“工作区覆盖”移到高级设置区

### 建议 IPC 方案

#### 新增 IPC 命名

推荐不要继续复用带 `rootPath` 的老接口做硬改，建议新增应用级 IPC：

```text
app-model-config:read
app-model-config:state
app-model-config:add-provider
app-model-config:update-provider
app-model-config:delete-provider
app-model-config:add-model
app-model-config:update-model
app-model-config:delete-model
app-model-config:add-binding
app-model-config:update-binding
app-model-config:delete-binding
app-model-config:set-secret
app-model-config:get-secret-preview
app-model-config:delete-secret
app-model-config:list-secret-keys
app-model-config:set-default-provider
app-model-config:set-default-model
app-model-config:get-config-status
app-model-config:health-check
app-model-config:list-presets
app-model-config:list-model-candidates
```

#### 过渡期处理

旧接口保留一版，但标记 deprecated，不再被新页面调用。

### 影响文件

#### 主进程

- `src-main/model-config/model-config-manager.ts`
- `src-main/model-config/contracts.ts`
- `src-main/model-config/provider-presets.ts`（新增）
- `src-main/storage/app-path-resolver.ts`（新增）
- `electron/main.ts`

#### 前端桥接

- `electron/preload.ts`
- `src/electron-api.d.ts`

#### 页面

- `src/pages/ModelConfigPage.vue`
- `src/composables/useWorkbenchData.ts`

### 验收标准

1. 无工作区时可以打开模型配置页
2. 可以完成 provider/model/default model 最小配置
3. 新建工作区后直接可复用该模型配置
4. 工作台模型阻塞判断不再依赖 active workspace 内的配置文件
5. DeepSeek / MiMo 可作为内置 provider 被选择
6. 普通路径下不要求用户手写 provider id / model id
7. 模型配置页中 Binding 区改造成“使用场景模型配置”
8. 服务商配置区与模型配置区职责清晰，不再表现为两组相似表单

---

## 5.3 插件管理改造成应用级插件库

### 目标

将“安装、删除、升级、默认启停”提升到应用级；工作区只保留 override。

### 建议数据结构

#### 应用级插件库

```ts
interface AppPluginRegistry {
  installedPlugins: PluginEnablementRecord[]
  lastModifiedAt: string
}
```

#### 工作区覆盖

```ts
interface WorkspacePluginOverride {
  workspaceId: string
  overrides: Array<{
    pluginId: string
    enabled?: boolean
    configPatch?: Record<string, unknown>
  }>
  lastModifiedAt: string
}
```

### 实施策略

#### 第一步：把当前 `PluginConfigManager` 抽成两层

建议：

1. `AppPluginRegistryManager`
2. `WorkspacePluginOverrideManager`

如果不想一次拆太大，至少先让当前管理器支持：

1. 读写应用级插件库
2. 读写工作区覆盖
3. 提供最终解析结果

#### 第二步：插件管理页只接应用级插件库

页面只负责：

1. 查看已安装插件
2. 添加插件
3. 删除插件
4. 设置默认启用状态
5. 运行全局冲突检查

#### 第三步：工作区页面后续再接覆盖设置

本轮不必在工作区页面完整实现插件覆盖 UI，但数据结构和接口要预留。

### 建议 IPC 方案

新增应用级 IPC：

```text
app-plugin:list-all
app-plugin:list-enabled
app-plugin:get
app-plugin:preview-impact
app-plugin:save
app-plugin:remove
app-plugin:update-config
app-plugin:confirm-enable
app-plugin:conflict-check
```

工作区覆盖接口作为后续高级设置保留：

```text
workspace-plugin-override:read
workspace-plugin-override:write
workspace-plugin-override:resolve
```

### 影响文件

#### 主进程

- `src-main/plugins/plugin-config-manager.ts`
- `src-main/storage/app-path-resolver.ts`（新增）
- `electron/main.ts`

#### 前端桥接

- `electron/preload.ts`
- `src/electron-api.d.ts`

#### 页面

- `src/pages/PluginManagePage.vue`

### 验收标准

1. 无工作区时可进入插件管理页
2. 可查看、添加、删除、启停插件
3. 不再显示“请先选择工作区”
4. 应用级插件库与工作区 override 边界明确

---

## 5.4 `Return to Node` 契约修复

### 目标

修复当前明确 bug。

### 当前问题

前端发送：

```ts
{ targetNodeId: string }
```

运行器要求：

```ts
{ toNodeId: string }
```

### 修改要求

统一为：

```ts
interface ReturnTaskWorkflowInput {
  workspaceRootPath: string
  taskId: string
  toNodeId: string
  reason: string
}
```

### 影响文件

- `src/pages/WorkbenchPage.vue`
- `electron/preload.ts`
- `src/electron-api.d.ts`
- `electron/main.ts`

### 验收标准

1. 页面触发回流成功
2. 节点状态变化正确
3. 不出现参数名不匹配

---

## 5.5 首页改造成续作首页

### 目标

首页第一屏直接回答“我现在可以继续做什么”。

### 现有基础

`WorkspaceManager` 已有：

1. `listRecentWorkspaces()`
2. `getWorkspaceStats()`
3. `getRecentTasks(rootPath)`
4. `getBlockedTasks(rootPath)`

### 页面要求

`WorkspaceIndexPage.vue` 第一屏展示三块：

1. 继续上次任务
2. 需要你处理
3. 开始新任务

### 交互要求

1. 点击最近任务 -> 跳转工作台并恢复任务
2. 点击阻塞任务 -> 跳转工作台并定位阻塞任务
3. 点击开始新任务 -> 进入工作台输入区

### 建议实现

1. 继续复用 `workspace:recent-tasks` / `workspace:blocked-tasks`
2. 页面内聚合多个工作区结果
3. 可先做最近工作区下钻，不要求一次做全局复杂排序

### 影响文件

- `src/pages/WorkspaceIndexPage.vue`
- `electron/preload.ts`
- `src/electron-api.d.ts`

### 验收标准

1. 首页第一屏不是单纯目录列表
2. 用户可直接继续任务或处理阻塞

---

## 5.6 Quick Input 增加任务草案确认层

### 目标

把“理解输入”和“正式启动任务”拆开。

### 建议新增类型

```ts
interface TaskDraft {
  title: string
  taskType: string
  taskDomain: string
  workflowId: string
  estimatedSteps: string[]
  confirmationHints: string[]
}
```

### 建议新增接口

当前已有：

```ts
understandInput(rawInput)
understandAndStart(rootPath, rawInput)
```

建议补一个正式启动草案接口：

```text
task-draft:start
```

输入：

```ts
{
  rootPath: string
  draft: TaskDraft
  rawInput: string
}
```

### 页面流程

1. 用户输入描述
2. 调 `understandInput()`
3. 渲染草案卡片 / 弹层
4. 用户确认后调 `task-draft:start`

### 影响文件

- `src/pages/WorkbenchPage.vue`
- `src/composables/useWorkbenchData.ts`
- `src-main/runtime/input-understanding-service.ts`
- `electron/main.ts`

### 验收标准

1. 输入任务后不会直接启动
2. 用户先看到草案
3. 确认后才创建 conversation 和 task

---

## 5.6A 模型调用与流式输出能力补齐

### 目标

模型调用层必须支持统一的 stream / blocking 两种模式，供任务理解、长文本生成、步骤推进和过程记录复用。

### 当前现状

当前代码有模型配置与健康检查，但未形成统一模型调用抽象，也未在技术文档中固定流式事件格式。

### 本轮要求

必须新增统一的模型调用能力层，至少满足：

1. 可按 resolved profile 发起请求
2. 支持 `stream` / `blocking`
3. 能把 provider 协议差异收敛到统一事件
4. 为后续任务执行、结果总结、过程展示复用

### 建议新增类型

```ts
type ModelInvokeMode = 'stream' | 'blocking'

type ModelStreamEvent =
  | { type: 'start'; requestId: string; modelId: string }
  | { type: 'delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'tool_call_delta'; toolCallId: string; name?: string; argumentsDelta?: string }
  | { type: 'done'; usage?: unknown }
  | { type: 'error'; message: string; recoverable: boolean }
```

建议新增请求结构：

```ts
interface ModelInvokeInput {
  workspaceRootPath?: string
  role?: string
  providerId?: string
  modelId?: string
  mode: ModelInvokeMode
  messages: Array<{ role: string; content: string }>
  stream?: boolean
  tools?: unknown[]
  metadata?: Record<string, unknown>
}
```

### 建议新增文件

#### 主进程

- `src-main/model-runtime/model-invoke-service.ts`
- `src-main/model-runtime/provider-adapters/openai-compatible-adapter.ts`
- `src-main/model-runtime/provider-adapters/anthropic-compatible-adapter.ts`

#### 类型

- `src-main/model-runtime/contracts.ts`

### 统一能力要求

#### 默认模式

| 场景 | 模式 |
| --- | --- |
| 用户任务理解 | stream |
| 任务步骤过程说明 | stream |
| 长文本结果总结 | stream |
| 健康检查 | blocking |
| 简单分类 / 路由 | blocking |

#### Provider 能力兼容

1. 若 provider `supportsStreaming !== false`，默认允许 stream
2. 若 provider 不支持流式，则自动降级到 blocking
3. 降级行为要明确可观察，不可静默吞掉

### 前端映射要求

前端不应直接消费原始 chunk，而应将流式事件映射到产品区域：

1. 当前步骤说明
2. 最近进展
3. 产物草稿
4. 等待确认的信息

### 验收标准

1. 模型调用层可统一支持 OpenAI-compatible provider 的 stream
2. DeepSeek / MiMo provider 可标记 `supportsStreaming: true`
3. 不支持流式的 provider 能自动降级到 blocking
4. 统一流式事件结构可被后续任务执行链复用

---

## 5.7 工作台主界面改造

### 目标

第一层去掉内部引擎术语。

### 页面映射要求

| 当前 | 目标 |
| --- | --- |
| Run overview | 任务概览 |
| Workflow board | 任务步骤 |
| Execution timeline | 最近进展 |
| Evidence panel | 详情 |
| Artifact | 产出 |
| Trace | 过程记录 |
| TaskRuntime / Memory / Risk | 技术详情 |

### 按钮映射要求

| 当前 | 目标 |
| --- | --- |
| Resume | 继续任务 |
| Advance | 继续执行 |
| Complete Node | 标记这一步完成 |
| Block Node | 需要我处理 |
| Return to Node | 重新处理上一步 |

### 必须保留的语义差异

```text
继续任务 = 恢复现场
继续执行 = 推进 Agent
```

### 影响文件

- `src/pages/WorkbenchPage.vue`

### 验收标准

1. 默认视图不暴露过多内部术语
2. 技术详情可折叠查看

---

## 5.8 结果页改造成任务总结页

### 目标

完成态优先展示：

1. 本次完成内容
2. 本次产出
3. 未完成项
4. 风险/技术债
5. 下一步建议

### 页面要求

新增主入口：

```text
基于此结果继续
```

### 影响文件

- `src/pages/ResultsPage.vue`
- `src-main/results/*`

### 验收标准

1. 用户可从结果页直接继续任务
2. 页面不以 artifact id 为中心

---

## 6. 接口改造清单

## 6.1 需要新增的前端 API

### 应用级模型配置

```ts
readAppModelConfig()
getAppModelConfigState()
addAppProvider(provider)
updateAppProvider(providerId, patch)
deleteAppProvider(providerId)
addAppModel(model)
updateAppModel(modelId, patch)
deleteAppModel(modelId)
addAppBinding(binding)
updateAppBinding(bindingId, patch)
deleteAppBinding(bindingId)
setAppSecret(key, value)
getAppSecretPreview(key)
deleteAppSecret(key)
listAppSecretKeys()
setAppDefaultProvider(providerId)
setAppDefaultModel(modelId)
getAppModelConfigStatus()
healthCheckAppProvider(providerId)
```

### 应用级插件库

```ts
listAppPlugins()
listEnabledAppPlugins()
getAppPlugin(pluginId)
previewAppPluginImpact(pluginId, pluginType, action, input?)
saveAppPlugin(pluginConfig)
removeAppPlugin(pluginId)
updateAppPluginConfig(pluginId, patch)
confirmAppPluginEnable(pluginId)
checkAppPluginConflict(pluginIds)
```

### 任务草案

```ts
startTaskFromDraft(rootPath, draft, rawInput)
```

## 6.2 需要保留但标记废弃的 API

以下接口过渡期保留，但不允许新页面继续调用：

### 旧模型配置

所有 `readModelConfig(rootPath)` 风格接口

### 旧插件配置

所有 `listAllPlugins(rootPath)` 风格接口

### 处理要求

1. 在 `electron/preload.ts` 与 `src/electron-api.d.ts` 中增加注释标记 deprecated
2. 新页面只接新接口

---

## 7. 存储迁移要求

## 7.1 模型配置迁移

### 迁移场景

历史版本可能已经将模型配置写在某个工作区内。

### 建议策略

首次读取应用级配置时：

1. 若应用级配置存在，直接使用
2. 若应用级配置不存在：
   - 检查最近活跃工作区中是否存在旧版 workspace model config
   - 如存在，则复制到应用级配置
   - 写入 migration 标记

### 最低要求

1. 迁移失败不阻塞应用启动
2. 迁移过程有日志
3. 不自动删除旧工作区配置文件

## 7.2 插件配置迁移

### 建议策略

1. 若应用级插件库不存在
2. 且最近活跃工作区存在旧版 `plugin-config.json`
3. 则迁移为应用级插件库初始值

### 最低要求

1. 不自动删除旧文件
2. 迁移可重复执行但不得重复导入

---

## 8. 测试清单

## 8.1 单元测试

必须补：

1. 应用级路径解析器测试
2. 应用级 model config 读写测试
3. 应用级 plugin registry 读写测试
4. 模型配置迁移测试
5. 插件配置迁移测试
6. `Return to Node` 输入契约测试

## 8.2 集成测试

必须补：

1. 无工作区进入模型配置页
2. 无工作区进入插件管理页
3. 配置应用级模型后，新工作区直接可用
4. Quick Input -> 草案 -> 确认启动
5. 首页继续任务
6. 首页处理阻塞任务
7. 工作台回流成功

## 8.3 手工验收

至少走以下场景：

1. 首次安装后，先配置模型，再创建工作区
2. 不选工作区进入插件管理，安装插件后再进入工作区
3. 进入已有工作区，继续任务
4. 输入新任务，先确认草案，再启动
5. 完成任务后从结果页继续下一轮

---

## 9. Definition of Done

单项任务完成必须同时满足：

1. 页面功能可用
2. IPC 契约已同步到 preload 与 d.ts
3. 至少一条对应测试补齐
4. 不引入对旧工作区强依赖的新逻辑
5. 验收文案与页面文案已统一中文主流程语义

整轮交付完成必须同时满足：

1. 模型配置与插件管理均可脱离工作区使用
2. 首页具备续作入口
3. Quick Input 具备草案确认层
4. 工作台第一层已产品化
5. `Return to Node` bug 已修复
6. 结果页具备总结与继续入口

---

## 10. 开发顺序建议

建议按以下顺序开工：

1. `P0-A` 新增应用级路径解析器
2. `P0-B` 新增应用级模型配置服务与 IPC
3. `P0-C` 新增应用级插件服务与 IPC
4. `P0-D` 修复 `Return to Node`
5. `P0-E` 首页改造
6. `P0-F` Quick Input 草案确认
7. `P1-A` 工作台改版
8. `P1-B` 模型配置向导
9. `P1-C` 插件管理页文案与交互重做
10. `P2-A` 结果页改造
11. `P2-B` 跑通真实场景验收

---

## 11. 给开发的最后说明

本轮开发最关键的不是“把页面做漂亮”，而是把边界做对。

请统一按下面这条判断代码是否正确：

```text
如果一个能力在没有工作区时也应该可用，
那它就不应该默认存到 workspaceRootPath 下，也不应该要求 active workspace 才能进入页面。
```

本轮的正确实现口径：

```text
应用级负责能力，
工作区级负责业务数据，
工作台负责任务推进体验。
```
