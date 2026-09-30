# AI 手工验证指南 — saicmotor-cli Sprint 4

> **写给下一个 AI Agent**：以下是你在这个工作空间需要做的全部事情。按顺序执行即可。

## 当前状态

Sprint 4（AI 发现机制）代码已全部开发完成，自动化测试全部通过（16 套件 / 66 tests）。

**你现在要做的是手工验证——确认真实安装链路完整可用，而不只是 mock 测试。**

## 工作空间

```
cd D:\work\things\saicmotor-cli-all\saicmotor-cli
├── src/                    # CLI 源码（TypeScript）
├── dist/                   # tsc 编译产物
├── scripts/
│   ├── postinstall.js      # ★ Sprint 4 核心：skills 注册脚本
│   ├── leave/
│   └── attendance/
├── skills/                 # 4 个 SKILL.md
├── test/                   # vitest 测试
├── catalog/services/       # API 声明
└── docs/                   # 技术文档
    ├── ARCHITECTURE.md
    ├── superpowers/specs/  # 设计文档（S1-S4）
    ├── superpowers/plans/  # 实施计划（S1-S4）
    ├── sprint/             # Sprint 文档 + 总览 + 验收记录
    └── history/            # 认证模型分析
```

## 验证清单

### 1. 全量测试回归

```bash
cd D:\work\things\saicmotor-cli-all\saicmotor-cli
npm run build
npx vitest run
```

**预期**：16 passed, 66 tests all green

### 2. 编译产物验证

```bash
npm run build
node dist/cli/index.js --help
```

**预期**：help 输出中包含 `install` 子命令：

```
Commands:
  leave         ...
  attendance    ...
  install [options]   安装/重装 AI skills 到所有已安装的 AI 工具
  auth          ...
```

再验证 install 子命令的 help：

```bash
node dist/cli/index.js install --help
```

**预期**：显示 `--force` 选项：

```
Options:
  --force  强制重新安装（即使已安装）
```

### 3. `npm pack` 文件清单验证

```bash
npm pack --dry-run 2>&1
```

**关键检查**：
- ✅ 包含 `dist/`、`skills/`、`catalog/`、`scripts/` 下的所有文件
- ✅ 包含 `scripts/postinstall.js`
- ❌ **不包含** `src/`、`test/`、`node_modules/`

### 4. postinstall 脚本手工执行

```bash
node scripts/postinstall.js
```

**预期输出类似**：

```
saicmotor CLI 安装完成。
AI skills 已安装，跳过              # 或 "✓ AI skills 已注册"（取决于当前环境）
  首次使用前请运行: saicmotor auth login
  探索命令: saicmotor --help
```

> 这是手工验证——会真实跑 `npx skills ls -g` 和 `npx skills add`。如果当前机器上已装过 saicmotor skills，会打印"已安装，跳过"。如果没有 npx 或网络不通，会打印警告但不会报错退出。

### 5. 环境变量覆盖验证

```bash
set SAICMOTOR_SKILLS_REPO=test-org/test-repo
node scripts/postinstall.js
```

**预期**：输出中应该看到 `test-org/test-repo`（而不是 `a5535772/saicmotor-cli`）：

```
⚠ AI skills 注册失败，稍后可手动运行:
  saicmotor install
  或: npx skills add test-org/test-repo --all -g
```

### 6. 测试文件确认

确认以下 2 个新测试文件存在且测试通过：

```bash
npx vitest run test/scripts/postinstall.test.ts
npx vitest run test/unit/install-command.test.ts
```

**预期**：各 5 tests PASS（共 10 tests）

## 如果全部通过

Sprint 4 验证完毕，可以准备发布。发布前还需要：

1. 确定 skills 仓库的实际 URL（目前默认 `a5535772/saicmotor-cli`，通过 `SAICMOTOR_SKILLS_REPO` 覆盖）
2. `npm version patch` 打版本号
3. `npm publish` 发布到目标 registry

## 如果某一步失败

- **步骤 1 失败**：检查 `npm install` 是否已跑，`tsc` 编译是否成功
- **步骤 2 失败**：检查 `src/cli/index.ts` 中 install 命令的 `require("../../scripts/postinstall.js")` 路径
- **步骤 3 失败**：检查 `package.json` 的 `files` 字段
- **步骤 4 失败**：检查 Windows 下 `execSync` 的编码问题（可能需要 `.setEncoding('utf8')`）
- **步骤 5 失败**：检查 `SKILLS_REPO` 变量是否在 require 时读取（module 级别）

---

## 关键代码锚点

| 文件 | 关键内容 |
|------|----------|
| `package.json:6-10` | `files` 数组 |
| `package.json:12` | `"postinstall": "node scripts/postinstall.js"` |
| `package.json:36` | `tsx` 在 dependencies（不是 devDependencies） |
| `scripts/postinstall.js:26-31` | `skillsAlreadyInstalled()` 幂等检查 |
| `scripts/postinstall.js:33-48` | `installSkills({ force })` |
| `scripts/postinstall.js:50-56` | `require.main === module` 入口 |
| `src/cli/index.ts` | `program.command("install")` 块（`registerAuth` 之前） |
| `test/scripts/postinstall.test.ts` | 5 个单测（无 mock，用 `__setExecSync` 注入） |
| `test/unit/install-command.test.ts` | 5 个签名验证测试 |

## 架构背景

- **Sprint 4 目标**：`npm install -g` 后 AI 工具自动认识 saicmotor-cli
- **机制**：postinstall → `npx skills add --all -g` → skills 装到所有 AI 工具
- **安装顺序兼容**：`saicmotor install` 可随时重新注册（先装 CLI 后装 agent 也 OK）
- **幂等保护**：`skillsAlreadyInstalled()` 先检查再安装
- **配置化**：`SAICMOTOR_SKILLS_REPO` 覆盖仓库地址