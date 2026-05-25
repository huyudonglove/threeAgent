# AgentThee — 个人 Agent 工作台

基于 **Electron 30 + Vue 3 + TypeScript 5 + Vite 5** 构建的桌面端 AI Agent 工作台。

核心目标：**持续推进复杂任务，而不是重新开始聊天。**

界面围绕 `Run → Node → Evidence → Artifact` 链路设计，用户可随时恢复中断任务，查看每个节点的决策依据、产出物和风险项。

---

## 功能列表

- **工作区管理** — 多工作区初始化、首页索引、全局导航
- **会话 / 任务管理** — 会话创建、任务运行态 CRUD、状态迁移校验
- **输入理解与自动路由** — 用户输入自动识别意图、路由到对应工作流并启动任务
- **工作流引擎** — 领域流程加载 / 推进 / 阻塞 / 回流 / 完成，含断点恢复
- **模型配置** — Provider / Model / Binding / HealthCheck / Secrets 完整配置闭环
- **插件管理** — 插件启停、冲突检查、影响预览与高风险确认
- **记忆系统** — 记忆提交 / 查询 / turn-end 写入 / 冲突处理，接入真实会话回路
- **结果沉淀与复用** — 任务收尾总结、产物归档、复用建议
- **Trace 追踪** — 事件追加、segment 轮转、摘要读取，关键推进可回看

---

## 技术栈

| 层级          | 技术                                                     |
| ------------- | -------------------------------------------------------- |
| 前端框架      | Vue 3（`<script setup>` SFC）                            |
| 构建工具      | Vite 5                                                   |
| 类型系统      | TypeScript 5（`vue-tsc` 检查）                           |
| 桌面容器      | Electron 30                                              |
| Electron 集成 | `vite-plugin-electron` + `vite-plugin-electron-renderer` |
| 打包发布      | `electron-builder`                                       |
| 测试          | Vitest（179 个测试全部通过）                             |

---

## 开发说明

```bash
pnpm install   # 安装依赖
pnpm dev       # 开发模式（热重载）
pnpm test      # 运行测试
pnpm build     # 生产构建 + 打包桌面安装包
```

### 环境要求

- Node.js >= 18
- pnpm（推荐）

### 构建流程

1. `vue-tsc` — TypeScript 类型检查
2. `vite build` — 渲染进程打包
3. `electron-builder` — 生成桌面安装包（输出到 `release/`）

---

## 项目架构

```
agentThee/
├── electron/           # 主进程入口 + preload 安全桥接
├── src-main/           # 主进程业务模块
│   ├── contracts/      # 核心类型与状态枚举
│   ├── errors/         # 统一错误模型与 Result<T>
│   ├── storage/        # JSON/JSONL 存储、路径解析、工作区管理
│   ├── runtime/        # 会话/任务运行态、回流、变更请求、输入理解
│   ├── model-config/   # 模型配置、探活、密钥存储与脱敏
│   ├── artifacts/      # 产物索引与类型注册
│   ├── trace/          # 展示镜像与事件追踪
│   ├── workflows/      # 工作流注册、加载、推进、恢复
│   ├── plugins/        # 插件配置与冲突检查
│   ├── memory/         # Agent 记忆服务
│   ├── results/        # 结果沉淀与复用建议
│   └── validation/     # 六层校验系统
├── src/                # 渲染进程（Vue 3 页面与组件）
├── tests/              # Vitest 测试（179 个）
└── docs/               # 项目文档
```

---

## 里程碑

| 里程碑 | 名称             | 状态   |
| ------ | ---------------- | ------ |
| M1     | 底层真源可运行   | 已完成 |
| M2     | 任务与产物闭环   | 已完成 |
| M3     | 最小工作台可观察 | 已完成 |
| M4     | 扩展与继续能力   | 已完成 |
| M5     | 产品闭环验收     | 已完成 |
