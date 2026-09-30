# Sprint 4 — AI 发现机制 测试计划与验收记录

> **日期**: 2026-09-21 | **状态**: ✅ 全部通过

## 测试计划

### 测试层级

| 层 | 工具 | 覆盖范围 |
|----|------|----------|
| 单测 | vitest | postinstall.js 所有逻辑分支、installSkills 签名 |
| 构建验证 | tsc + node | CLI 编译 + `saicmotor install` 注册 |
| 包发布验证 | npm pack | `files` 字段正确性 |
| 全量回归 | vitest run | 16 套件 66 测试零回归 |

### 测试用例矩阵

#### postinstall.js（5 用例）

| # | 用例 | 场景 | 结果 |
|---|------|------|------|
| 1 | `installs skills when not already installed` | skills ls 失败 → 执行 skills add → 输出 `✓ AI skills 已注册` | ✅ PASS |
| 2 | `skips when already installed` | skills ls 返回已有 saicmotor-* skills → 跳过 | ✅ PASS |
| 3 | `force reinstalls even if already installed` | force=true 时跳过幂等检查，直接 skills add | ✅ PASS |
| 4 | `handles install failure gracefully` | ls + add 都失败 → 打印 `⚠ AI skills 注册失败` + 手动恢复命令 | ✅ PASS |
| 5 | `respects SAICMOTOR_SKILLS_REPO env var` | 环境变量覆盖 repo → 命令包含自定义 repo | ✅ PASS |

#### installSkills 签名验证（5 用例）

| # | 用例 | 场景 | 结果 |
|---|------|------|------|
| 1 | `installSkills accepts optional { force } parameter` | 三种调用方式（无参/false/true）都不抛错 | ✅ PASS |
| 2 | `installSkills with force=false skips when already installed` | 仅调 ls，不调 add | ✅ PASS |
| 3 | `installSkills with force=true always runs skills add` | 强制执行 skills add | ✅ PASS |
| 4 | `skillsAlreadyInstalled returns boolean` | 返回类型为 boolean | ✅ PASS |
| 5 | `SKILLS_REPO defaults to a5535772/saicmotor-cli` | 默认仓库地址正确 | ✅ PASS |

#### CLI 构建验证

| # | 检查项 | 结果 |
|---|--------|------|
| 1 | `tsc` 编译通过 | ✅ |
| 2 | `saicmotor --help` 包含 `install` 命令 | ✅ |
| 3 | `saicmotor install --help` 显示 `--force` 选项 | ✅ |
| 4 | `require("../../scripts/postinstall.js")` 路径在 dist 下正确 | ✅ |

#### npm pack 验证

| # | 检查项 | 结果 |
|---|--------|------|
| 1 | 包含 `dist/` 目录所有文件 | ✅ |
| 2 | 包含 `skills/` 目录 4 个 SKILL.md | ✅ |
| 3 | 包含 `catalog/` 目录 2 个 JSON | ✅ |
| 4 | 包含 `scripts/` 目录（含 postinstall.js） | ✅ |
| 5 | **不**包含 `src/`、`test/`、`node_modules/` | ✅ |
| 6 | 包含 `package.json`（npm 自动） | ✅ |

### 全量回归

```
16 passed · 66 tests · all green · 2.19s
```

所有已有测试（Sprint 1-3）零回归。

## 验收记录

### 功能实现

| 需求 | 状态 |
|------|------|
| `package.json` 加 `files`/`postinstall`/`repository`/`engines` | ✅ |
| `tsx` 从 devDependencies 移到 dependencies | ✅ |
| `scripts/postinstall.js` 静默注册 skills + 幂等检查 | ✅ |
| `saicmotor install` 命令（支持 `--force`） | ✅ |
| `SAICMOTOR_SKILLS_REPO` 环境变量可覆盖仓库地址 | ✅ |
| 安装顺序兼容（先装 CLI 后装 agent → `saicmotor install`） | ✅ |
| 多 AI 工具兼容（`npx skills add --all`） | ✅ |

### 文件变更清单

| 文件 | 动作 | 提交 |
|------|------|------|
| `saicmotor-cli/package.json` | 修改 | `68fa708` |
| `saicmotor-cli/scripts/postinstall.js` | 新建 | `fc4c674` |
| `saicmotor-cli/src/cli/index.ts` | 修改 | `49da5a0` |
| `saicmotor-cli/test/scripts/postinstall.test.ts` | 新建 | `f298376` + `c4dee7a` |
| `saicmotor-cli/test/unit/install-command.test.ts` | 新建 | `2ecd8b3` |
| `docs/sprint/sprint-4-ai-discovery.md` | 修改 | `c20381b` |
| `docs/sprint/总览.md` | 修改 | `c20381b` |
| `docs/superpowers/specs/2026-09-21-sprint-4-ai-discovery-design.md` | 新建 | `d3d9608` |
| `docs/superpowers/plans/2026-09-21-sprint-4-ai-discovery.md` | 新建 | `d3d9608` |

### 提交链

```
68fa708 feat(pkg): add files, postinstall, repository, engines; move tsx to deps
f298376 test(postinstall): add failing tests for skill registration with idempotency
fc4c674 feat(scripts): add postinstall hook with idempotency check
c4dee7a test(postinstall): update tests to use injectable execSync for CJS compatibility
49da5a0 feat(cli): add 'saicmotor install' command for skill re-registration
2ecd8b3 test(cli): verify installSkills export signature for install command
d3d9608 chore: verify full test suite (66 tests pass) and npm pack output
c20381b docs: mark Sprint 4 AI discovery as done
```

## 总结

Sprint 4 **AI 发现机制** 已完整实现并通过所有测试。核心交付：

1. **自动安装链路**：`npm install -g` 后自动注册 skills 到所有 AI 工具
2. **安装顺序兼容**：`saicmotor install` 命令允许随时重新注册
3. **幂等保护**：已安装不重复请求
4. **配置化**：`SAICMOTOR_SKILLS_REPO` 支持私有仓库部署
5. **零回归**：66 个测试全部通过