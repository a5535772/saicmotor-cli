# @saicmotor/cli

> 面向 AI Agent 的企业 CLI 工具平台——用 skill 编排任务，用 catalog 声明接口，用引擎自动执行。

---

## 这是什么

`@saicmotor/cli` 不是传统的命令行工具。它是一个**平台**：

- **对 AI Agent**：读 skills 知道什么时候调什么命令、怎么编排多步操作
- **对 CLI 引擎**：读 catalog JSON 动态生成命令，不改引擎只改声明
- **对人**：命令行一样用——`saicmotor leave balance query`

## 仓库结构

这是一个 npm workspaces monorepo，5 个包在 `packages/` 下：

```
packages/
├── cli/                  核心框架：引擎、认证、插件管理、CLI 入口
├── sdk/                  插件开发 SDK：类型、schema、helper
├── plugin-leave/         请假业务插件（参考实现）
├── plugin-attendance/    考勤业务插件（参考实现）
└── plugin-user/          用户信息插件（参考实现）
```

**依赖关系**：`cli` 依赖 `sdk`（runtime），三个插件各自依赖 `sdk`（devDependency）。

## 快速开始

```bash
# 安装核心
npm install -g @saicmotor/cli --registry=<内部 registry>

# 注册 AI skills
saicmotor install

# 安装业务插件
saicmotor plugin install leave --registry=<内部 registry>
saicmotor plugin install attendance --registry=<内部 registry>

# 配置网关 + 登录
# 编辑 ~/.saicmotor/config.json → { "gateway": "https://api.example.com" }
saicmotor auth login

# 跑一条命令
saicmotor leave balance query --format pretty
```

## 架构

```
AI Agent                    用户
   │                          │
   ▼                          ▼
 skills/SKILL.md          saicmotor <命令>
   │                          │
   └──────────┬───────────────┘
              ▼
         CLI 引擎
     ┌──────┼──────┐
     │  脚本覆盖？   │ ← 插件提供的自定义脚本
     │  HTTP 直连   │ ← 按 catalog 声明发请求
     └──────┼──────┘
            ▼
         网关
```

引擎对 `leave` 和 `attendance` 用同一套代码——区别只在插件提供的 catalog JSON。

## 文档

| 文档 | 给谁 |
|------|------|
| [howto/USER-GUIDE.md](howto/USER-GUIDE.md) | 终端用户 |
| [howto/PLUGIN-DEVELOPER.md](howto/PLUGIN-DEVELOPER.md) | 插件开发者 |
| [howto/framework/](howto/framework/) | 框架开发者 |

## 技术栈

Node ≥ 20 · TypeScript · Commander · Zod · Vitest