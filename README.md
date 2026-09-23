# @saicmotor/cli

> **@saicmotor/cli** — 面向 AI Agent 的企业 CLI 工具平台：用 skill 编排任务，用 catalog 声明接口，用引擎自动执行。

[![Status](https://img.shields.io/badge/status-POC-蓝色)](#现状)
[![Tests](https://img.shields.io/badge/tests-46/46%20passed-绿色)](@saicmotor/cli)

---

## 一句话

`@saicmotor/cli` 是一个 **面向 AI Agent 的 CLI 平台**。

- **对 AI Agent**：读 `skills/SKILL.md` 知道什么时候调什么命令、按什么顺序编排
- **对 CLI 引擎**：读 `catalog/services/*.json` 动态生成命令，不改引擎只改 JSON
- **对人**：命令行一样用——`saicmotor leave balance query`

---

## 三层架构

| 层 | 目录 | 做什么 | 给谁用 |
|---|---|---|---|
| 🧠 **编排层** | `skills/` | 教 AI 什么时候用什么命令、多步怎么组合 | AI Agent |
| 📋 **声明层** | `catalog/services/` | 声明 API 的 path、method、参数类型，零逻辑 | CLI 引擎 |
| ⚙️ **执行层** | `src/engine/` | 校验 → 认证 → HTTP 请求 → 输出，纯函数式流水线 | CLI 引擎 |

加新系统只改上面两层——{新增 skill 编排逻辑，新增catalog声明接口}，引擎不动。

---

## 现状

| 项目 | 状态 |
|------|------|
| CLI 核心 | ✅ 可用（2 个系统、8 个模块引擎、46 个测试） |
| 认证 | ✅ password 类型（用户名 + 密码 → token） |
| 测试基础设施 | ✅ mock-gateway + mock-services（Spring Boot） |
| AI skill | 🟡 4 个 SKILL.md 已写，待对接 `npx skills add`（Sprint 4） |
| 可插拔 auth | ⬜ Sprint 5 |

→ Sprint 详情：[docs/sprint/总览.md](docs/sprint/总览.md)

---

## 怎么工作

### AI Agent 路径

```mermaid
flowchart LR
    USER["🤖 AI Agent<br/>用户说：帮我请年假"]
    SKILL["🧠 读取 skills/<br/>saicmotor-suite → saicmotor-leave"]
    CATALOG["📋 读取 catalog/<br/>leave.json → leave.balance.query"]
    CLI["⚙️ saicmotor leave balance query"]

    USER --> SKILL --> CATALOG --> CLI
```

AI Agent 不用记住任何参数——它先读 `skills/saicmotor-leave/SKILL.md`，知道先查余额（`leave balance query`）再提交申请（`leave applications submit`），需要确认时提示用户加 `--yes`。

### CLI 执行路径

```
saicmotor leave applications submit --start-date 2026-09-21 --reason 年假 --yes

  ┌─ catalog/services/leave.json   ← 声明 "applications.submit" 是什么接口
  │
  ├─ Commander 动态注册命令          ← 不写死，扫描 catalog 自动生成
  │
  ├─ 引擎流水线
  │   ├─ 检测脚本覆盖（scripts/）      ← 有则走脚本，无则 HTTP 回放
  │   ├─ coerceFields()             ← 校验参数、类型转换（string→int）
  │   ├─ ensureToken()              ← 有缓存用缓存，无缓存自动登录
  │   ├─ buildUrl()                 ← 拼接 config.gateway + servicePath + method.path
  │   ├─ send()                     ← HTTP 请求（含 Bearer token）
  │   ├─ 401？                      ← 清缓存 → 重登 → 重试一次
  │   └─ checkEnvelope()            ← 校验 code==0
  │
  └─ 输出 { ok: true, data: { application_id: "APP-1" } }
```

**关键事实：**

- CLI 是通用的——`leave` 和 `attendance` 用同一套引擎，区别只在 catalog JSON
- 命令结构：`saicmotor <服务> <资源> <方法> [参数]`
- 所有 HTTP 请求经网关（`saicmotor.config.json → defaults.gateway`，默认 `http://localhost:8081`）
- 脚本覆盖：`scripts/` 下有同名 TS 文件就走脚本，否则 HTTP 直接回放

→ 完整架构：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## 实际命令

### 可用系统

```bash
$ saicmotor --help

Commands:
  attendance      考勤
  leave           请假
  auth            登录认证
```

### 请假

```bash
saicmotor auth login --username zhangsan --password 123456

# 查年假余额（GET，无参数）
saicmotor leave balance query

# 提交请假（POST — 需 --yes 确认）
saicmotor leave applications submit \
  --start-date 2026-09-21 \
  --end-date 2026-09-22 \
  --reason 年假 \
  --yes

# 三种输出格式
saicmotor leave balance query --format json      # JSON 信封（默认）
saicmotor leave balance query --format table     # 表格
saicmotor leave balance query --format pretty    # 美化

# 预览请求不发送
saicmotor leave applications submit ... --dry-run
```

### 考勤

```bash
# 查本月打卡记录
saicmotor attendance records query

# 补卡
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --yes
```

---

## 开发

> 完整开发者指南见 [howto/DEVELOPER.md](howto/DEVELOPER.md)——环境搭建、新增业务系统、添加 skill、测试、发版流程。

### 前提

- Node ≥ 20
- 本地开发：克隆本仓库，`npm install` 后 `npm link` 注册全局命令
- 测试假后端：需 Java 17 + Maven（仅运行 mock-* 时需要）

### 安装

```bash
npm install -g @saicmotor/cli --registry=http://localhost:4873
```

本地开发（源码）：

```bash
cd saicmotor-cli
npm install
npm link          # 全局注册 saicmotor 命令（改源码后 npm run build 即时生效）
npm run build     # ts → js
```

解除注册：

```bash
npm unlink -g     # 在项目目录里执行
```

不想全局注册也可以用 `npx tsx` 直接跑源码：

```bash
npx tsx src/cli/index.ts --help
npx tsx src/cli/index.ts leave balance query
```

### 运行测试

```bash
npm test          # 66 个测试（16 文件），全部纯 TypeScript
```

测试不需要 Java——`test/helpers/server.ts` 用 Node 起 mock HTTP server 替代整套 Java 栈。

### 起假后端

```bash
# 终端 1：网关（端口 8081）
cd mock-gateway
mvn spring-boot:run

# 终端 2：业务系统（端口 8080）
cd mock-services
mvn spring-boot:run

# 预置账号：zhangsan/123456
```

---

## 仓库结构

```
.
├── saicmotor-cli/              ← 🎯 npm 包（@saicmotor/cli）
│   ├── src/cli/                  命令面：index.ts 动态注册命令
│   ├── src/engine/               通用引擎：catalog / run / http / output
│   ├── src/auth/                 认证：store / login / session / transport
│   ├── src/schema/catalog.ts     catalog JSON 的 zod 校验
│   ├── catalog/services/         声明式数据（leave.json · attendance.json）
│   ├── scripts/                  脚本覆盖（leave/applications/submit.ts）
│   ├── skills/                   AI agent 方向盘（4 个 SKILL.md）
│   ├── test/                     66 测试（unit + integration + scripts）
│   ├── docs/                      架构 / Sprint / 设计文档 / 踩坑
│   ├── howto/INSTALL.md           用户安装指南
│   └── howto/DEVELOPER.md         开发者指南
│
├── mock-gateway/               ← 🧪 模拟网关（Spring Boot）
│   └── 认证 + Token 校验 + X-User-Id 注入 + 转发
│
├── mock-services/              ← 🧪 模拟业务系统（Spring Boot）
│   └── LeaveController · AttendanceController
│
├── feishu-cli/                 ← 📖 飞书 CLI（参考，只读）
│
├── docs/
│   ├── sprint/                   Sprint 管理
│   └── superpowers/              设计稿 + 实施计划
│
└── 思考/                        笔记
```

---

## 技术栈

| 项 | 选择 | 原因 |
|----|------|------|
| 运行时 | Node ≥ 20 + TypeScript 5 | 内置 `fetch`，零 HTTP 依赖 |
| 命令行 | commander | 支持动态子命令注册 |
| 校验 | zod | 字段级错误信息 |
| 测试 | vitest | 原生 TS，快 |
| 数据 | JSON（catalog） | 声明式，人和 AI 都能读 |

---

## 安全

- 凭证存储 `~/.saicmotor/credentials.json`，`mode 0600`
- 可环境变量覆盖：`SAICMOTOR_USERNAME` / `SAICMOTOR_PASSWORD`
- 写操作（POST/PUT/DELETE）默认拒绝，需 `--yes` 或 `--dry-run`
- Token 不过期不重登，仅 401 时清缓存 + 重登 + 重试一次
- 成功数据 → stdout + exit 0；错误 → stderr + JSON 信封 + 语义化退出码