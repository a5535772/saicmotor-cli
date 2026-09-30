# 00 — 一页了解全貌

> 🎯 **电梯演讲**：saicmotor-cli 是一个面向 AI Agent 的插件化企业 CLI 平台。它让你用声明式 JSON 描述 API，AI Agent 就能自动发现并执行你的业务命令——你不需要写任何前端页面。

## 核心概念图

```
                        ┌─────────────────────────────────────┐
                        │         🌐 AI Agent（决策者）         │
                        │    Claude Code / Cursor / CodeBuddy   │
                        │    "帮我查年假余额"                    │
                        └──────────────┬──────────────────────┘
                                       │ 读路由表
                                       ▼
                        ┌─────────────────────────────────────┐
                        │       📖 saicmotor-suite（入口）      │
                        │    ┌─────────────────────────────┐   │
                        │    │ 意图         →  业务 Skill   │   │
                        │    │ 请假 / 年假  →  saicmotor-leave │
                        │    │ 考勤 / 打卡  →  saicmotor-attendance │
                        │    └─────────────────────────────┘   │
                        └──────────────┬──────────────────────┘
                                       │ 匹配路由
                                       ▼
                        ┌─────────────────────────────────────┐
                        │       🛠️ CLI 引擎（执行者）          │
                        │                                      │
                        │  saicmotor leave balance query       │
                        │       ↓                              │
                        │  [参数校验] → [获取 Token]            │
                        │       ↓                              │
                        │  [GET /api/leave/balance]             │
                        └──────────────┬──────────────────────┘
                                       │ HTTP
                                       ▼
                        ┌─────────────────────────────────────┐
                        │       🏭 企业网关 / 业务系统           │
                        └─────────────────────────────────────┘
```

## 一分钟看懂：一个请假命令的完整旅程

以 `saicmotor leave balance query` 为例：

```
你输入命令                           CLI 做了什么
─────────────────────────────────────────────────────────
saicmotor leave balance query   →   Commander 解析命令
    │                                 ↓
    │                            loadPlugins()（无参数）自动扫描 linked + node_modules 双根
    │                                 ↓
    │                            从插件 catalog JSON 找到 leave.balance.query
    │                                 ↓
    │                            检查是否有自定义脚本（没有 → 走 HTTP 直连）
    │                                 ↓
    │                            从磁盘读取 token（~/.saicmotor/token.json）
    │                                 ↓
    │                            GET http://网关/api/leave/balance
    │                                 ↓
    │                            网关返回 { code: 0, data: {...} }
    │                                 ↓
    │                            检查 code==0 → 格式化输出
    │                                 ↓
终端输出 JSON/Table/Pretty      ←   stdout
```

## 系统的六个关键角色

| 角色 | 是什么 | 类比 |
|------|--------|------|
| **AI Agent** | Claude Code 等 AI 编程助手 | 聪明的秘书——你说"帮我查年假"，它知道怎么拼命令 |
| **Skill** | 一个 SKILL.md 文件 | 秘书的岗位手册——告诉 AI "你能做什么、怎么做" |
| **Catalog** | 声明式 JSON 文件 | API 说明书——"这个接口叫什么、参数是什么、请求方式" |
| **CLI 引擎** | @saicmotor/cli 核心 | 执行者——拼 URL、发 HTTP、处理认证、格式化输出 |
| **SDK** | @saicmotor/sdk 共享类型包 | 类型契约——CLI 和插件共享同一份 zod schema、错误类、类型定义 |
| **插件** | 独立 npm 包（plugin-*） | 功能模块——业务系统以独立包分发，不碰核心代码 |
| **SDK** | @saicmotor/sdk 纯类型包 | 类型字典——插件开发者写脚本时获得类型提示和 zod 校验 |

## 三层开发者模型

```
┌──────────────────────────────────────────────┐
│  🧠 Skill 层    │  SKILL.md                 │  插件开发者写
│                 │  "告诉 AI 怎么用你的命令"     │
├──────────────────────────────────────────────┤
│  📋 Catalog 层  │  catalog/services/*.json   │  插件开发者写
│                 │  "声明 API 接口长什么样"     │
├──────────────────────────────────────────────┤
│  ⚙️ Engine 层   │  src/engine/*.ts           │  核心团队维护
│                 │  "HTTP 管线 / 认证 / 输出"   │
└──────────────────────────────────────────────┘
```

**关键洞察**：加新业务系统只改上面两层——写一份 catalog JSON + 一份 SKILL.md，引擎和插件框架不动。

## 数据目录一览

```
~/.saicmotor/
├── config.json          ← 我的网关地址
├── token.json           ← 我的登录 token（600 权限）
├── credentials.json     ← 我的密码（600 权限，password 模式）
└── plugins/
    ├── linked/           ← dev 调试中的插件（junction 映射）
    │   └── plugin-xxx/
    ├── node_modules/     ← npm 安装的正式插件
    │   └── @saicmotor/
    │       ├── plugin-leave/
    │       ├── plugin-attendance/
    │       └── plugin-user/
    └── state.json        ← 插件启用/禁用状态 + 各插件已安装版本
```

## 你能回答这些吗？

1. `saicmotor leave balance query` 这个命令中，`leave`、`balance`、`query` 各对应 catalog JSON 的什么字段？
2. 加一个新业务（如报销系统），核心团队需要改代码吗？插件开发者需要写哪两个文件？
3. token 缓存在哪里？过期后怎么触发重新登录？

> **答案** → [A1 FAQ §自测答案](./A1-faq.md#自测答案)

## 下一步

- 想深入理解核心概念？→ [01 核心概念](./01-concepts.md)
- 想直接看架构？→ [02 系统架构](./02-architecture.md)
- 想动手开发插件？→ [10 插件开发指南](./10-plugin-development.md)