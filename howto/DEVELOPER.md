# saicmotor-cli 开发者指南

> 面向接手此项目的开发者——如何搭建环境、新增业务系统、添加 skill、编写脚本覆盖。

---

## 1. 环境搭建

### 前置条件

- Node.js ≥ 16（推荐 20+）
- npm ≥ 9
- Git

### 克隆并安装

```bash
git clone https://github.com/a5535772/saicmotor-cli.git
cd saicmotor-cli
npm install        # 安装依赖（commander + zod + TypeScript + vitest）
npm run build      # TypeScript → dist/
```

### 本地开发

```bash
npm run dev        # tsx 热执行，免编译 → 改完就生效
npm test           # 运行全部测试（66 个）
npm run build      # 完整编译
```

### 全局注册（本地调试用）

```bash
npm link           # 全局注册 saicmotor 命令，指向本地 dist/
```

> 调试完记得 `npm unlink` 解绑。

---

## 2. 项目结构

```
saicmotor-cli/
├── saicmotor.config.json     ← 🔧 唯一配置源（repo / installUrl / defaults.gateway）
├── package.json
├── tsconfig.json
│
├── src/                      ← 源码
│   ├── cli/                  # 命令层：动态注册命令、auth、错误处理
│   │   ├── index.ts          # 入口：扫描 catalog → 注册 commander 命令
│   │   ├── auth.ts           # login / logout / status
│   │   └── error.ts          # 五类错误 → JSON 信封 + 退出码
│   ├── engine/               # 通用引擎（不含业务知识）
│   │   ├── catalog.ts        # 加载 catalog JSON + zod 校验
│   │   ├── config.ts         # 配置加载（默认 → 文件 → 环境变量）
│   │   ├── session.ts        # Token 缓存 + 401 自动重登
│   │   ├── request.ts        # URL 拼接 · 参数转换 · body 拼装
│   │   ├── http.ts           # fetch 封装 · 超时 · JSON 解析
│   │   ├── extract.ts        # 按路径从响应取值
│   │   ├── output.ts         # json / table / pretty
│   │   ├── errors.ts         # 五类错误归一
│   │   └── run.ts            # 编排流水线
│   ├── auth/                 # 认证模块
│   └── schema/catalog.ts     # catalog JSON 的 zod schema
│
├── catalog/services/         ← 📋 声明式 API（一个系统一个 JSON）
│   ├── leave.json
│   └── attendance.json
│
├── skills/                   ← 🧠 AI 编排规则
│   ├── saicmotor-suite/      # 聚合路由入口
│   ├── saicmotor-leave/      # 请假编排
│   ├── saicmotor-attendance/ # 考勤编排
│   └── saicmotor-shared/     # 公共（认证/配置/排障）
│
├── scripts/                  ← 📜 核心脚本
│   ├── run.js                # bin shim 入口
│   ├── postinstall.js        # AI skills 注册
│   ├── leave/applications/   # 请假脚本覆盖
│   └── attendance/corrections/ # 考勤脚本覆盖
│
├── dist/                     ← 编译产物（已提交到 git）
├── test/                     ← 测试
│   ├── unit/                 # 12 个模块的单测
│   ├── integration/          # 网关集成测试
│   ├── scripts/              # 脚本测试
│   └── helpers/server.ts     # Mock HTTP 服务器
│
├── docs/                     ← 文档
│   ├── ARCHITECTURE.md       # 架构设计
│   ├── sprint/               # Sprint 进度
│   ├── superpowers/          # 设计文档
│   └── lessons-learned-the-hard-way/  # 踩坑记录
│
└── howto/
    ├── INSTALL.md            # 用户安装指南
    └── DEVELOPER.md           # 你正在读的这个文件
```

---

## 3. 配置体系

### 3.1 saicmotor.config.json（唯一配置源）

```json
{
  "repo": "a5535772/saicmotor-cli",
  "installUrl": "https://github.com/a5535772/saicmotor-cli/tarball/master",
  "repository": "https://github.com/a5535772/saicmotor-cli",
  "defaults": {
    "gateway": "http://localhost:8081"
  }
}
```

| 字段 | 谁在用 | 用途 |
|------|--------|------|
| `repo` | `scripts/postinstall.js` | skills 仓库地址 |
| `installUrl` | `scripts/run.js`、文档 | 全局安装命令 |
| `repository` | 文档 | 仓库链接 |
| `defaults.gateway` | `src/config.ts` | CLI 默认网关 |

**公司部署**：改这一个文件，重新构建即可。不需要改任何源码。

### 3.2 运行时配置

用户侧配置优先级（`src/config.ts` → `loadConfig()`）：

```
SAICMOTOR_GATEWAY 环境变量（最高）
    ↓
~/.saicmotor/config.json 用户配置
    ↓
saicmotor.config.json 内置默认
    ↓
"http://localhost:8081" 硬编码兜底（最低）
```

### 3.3 环境变量一览

| 变量 | 作用 | 优先级 |
|------|------|:---:|
| `SAICMOTOR_GATEWAY` | 网关地址 | 最高 |
| `SAICMOTOR_SKILLS_REPO` | skills 仓库 | 最高 |
| `SAICMOTOR_USERNAME` | 用户名（CI/CD） | 替代文件 |
| `SAICMOTOR_PASSWORD` | 密码（CI/CD） | 替代文件 |
| `SAICMOTOR_HOME` | 数据目录 | 默认 `~/.saicmotor` |
| `SAICMOTOR_CATALOG` | catalog 目录 | 默认 `catalog/services/` |
| `SAICMOTOR_SCRIPTS` | scripts 目录 | 默认 `scripts/` |

---

## 4. 新增业务系统

加一个"报销"系统为例。**不改引擎代码**，只加数据文件。

### 4.1 创建 catalog JSON

`catalog/services/expense.json`：

```json
{
  "name": "expense",
  "title": "报销",
  "resources": {
    "list": {
      "methods": {
        "query": {
          "description": "查询报销记录",
          "httpMethod": "GET",
          "path": "/expense/list",
          "responseDataPath": "data.items"
        }
      }
    },
    "applications": {
      "methods": {
        "submit": {
          "description": "提交报销申请",
          "httpMethod": "POST",
          "path": "/expense/applications",
          "requestBody": {
            "amount": { "type": "number", "description": "金额" },
            "category": { "type": "string", "description": "类别" },
            "description": { "type": "string", "description": "说明" }
          }
        }
      }
    }
  }
}
```

**不需要改引擎，CLI 自动注册命令**：

```bash
saicmotor expense list query --format table
saicmotor expense applications submit --amount 100 --category 差旅 --description 出差 --yes
```

### 4.2 创建 skill

`skills/saicmotor-expense/SKILL.md`：

```markdown
---
name: saicmotor-expense
version: 1.0.0
description: "saicmotor 报销管理：查询报销记录、提交报销申请"
metadata:
  requires:
    bins: ["saicmotor"]
---

# 报销管理

先读 `../saicmotor-shared/SKILL.md` 了解认证和配置。

## 查询报销

saicmotor expense list query --format table

## 提交报销

saicmotor expense applications submit --amount <金额> --category <类别> --description <说明> --yes
```

### 4.3 （可选）编写脚本覆盖

如果默认 HTTP 回放不够用（跨 API 调用、数据加工等），在 `scripts/expense/applications/submit.ts` 写脚本。按 `系统/资源/方法` 路径对应即可。

---

## 5. 新增 skill

每个 skill 就是一个 `skills/<name>/SKILL.md` 文件。约定：

- **前缀** `saicmotor-`
- **格式**：frontmatter（name/version/description/metadata）+ markdown 正文
- **shared 引用**：每个子 skill 开头写"先读 `../saicmotor-shared/SKILL.md`"

### skill 引用关系

```
saicmotor-suite          ← 聚合路由入口
├── saicmotor-leave
├── saicmotor-attendance
├── saicmotor-expense     ← 新增的系统
└── saicmotor-shared      ← 公共能力（被所有 skill 引用）
```

### skill 注册

skill 通过 `npx skills add` 注册。用户安装时 `postinstall` 自动调用，也可手动：

```bash
saicmotor install --force    # 等价于 npx skills add ... --all -g
```

---

## 6. 测试

### 运行测试

```bash
npm test              # 全量（66 个）
npx vitest test/unit/config.test.ts   # 单文件
```

### 测试结构

| 目录 | 内容 | 数量 |
|------|------|:---:|
| `test/unit/` | 引擎模块单测（12 模块） | 文件级 |
| `test/integration/` | 网关端到端 | 2 文件 |
| `test/scripts/` | postinstall 脚本测试 | 1 文件 |

### 写测试的要点

- **config 测试**：需要 mock `SAICMOTOR_HOME` 环境变量，指向临时目录
- **postinstall 测试**：使用 `__setExecSync()` 注入 mock 函数
- **集成测试**：使用 `test/helpers/server.ts` 的 mock HTTP 服务器，不依赖 Java

---

## 7. 构建与发版

### 编译

```bash
npm run build    # tsc -p tsconfig.json → dist/
```

**注意**：`dist/` 已提交到 git。每次改源码后必须重新编译并提交新的 dist/。

### 本地验证安装

```bash
# 1. 先删旧版
npm uninstall -g saicmotor-cli

# 2. 本地 link（模拟全局安装）
npm link
saicmotor --help

# 3. 验证通过后 unlink
npm unlink
```

### 发版流程

1. 改源码 → `npm run build` → 提交 dist/
2. 更新 `package.json` 版本号
3. `git push`
4. 用户通过 tarball URL 安装（或在公司发布到内部 npm registry）

---

## 8. 常见开发场景

### 调接口加字段

只需改 `catalog/services/xxx.json` 的 `requestBody`，CLI 自动生成对应 `--field` 参数。

### 写操作加前置校验

在对应 `scripts/<系统>/<资源>/<方法>.ts` 中写校验逻辑。脚本优先于 HTTP 回放。

### 新增认证方式

改 `src/config.ts` 的 `AuthConfig` 接口 + `src/auth/` 模块。catalog 和 engine 不动。

### 修改默认网关

改 `saicmotor.config.json` 的 `defaults.gateway` → `npm run build` → 提交。不需要改源码。

---

## 9. 相关文档

- [架构设计](../docs/ARCHITECTURE.md) — 完整架构说明
- [安装指南](INSTALL.md) — 给用户看的安装文档
- [Sprint 进度](../docs/sprint/总览.md) — 迭代计划
- [踩坑记录](../docs/lessons-learned-the-hard-way/) — 已知问题与历史教训