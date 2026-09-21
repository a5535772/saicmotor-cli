# Sprint 4 — AI 发现机制 设计文档

> **日期**: 2026-09-21 | **状态**: ✅ 已设计 | **关联 Sprint**: [sprint-4-ai-discovery.md](../../sprint/sprint-4-ai-discovery.md)

## 1. 目标

让 `npm install -g saicmotor-cli` 之后，AI 工具（Claude Code、Trae、Codex、Cursor、CodeBuddy 等）自动认识 saicmotor-cli、知道什么时候用、怎么用。

## 2. 现状

Skills 内容已全部完成（Sprint 3），无需修改：

| Skill | 文件 | 作用 |
|-------|------|------|
| `saicmotor-suite` | `skills/saicmotor-suite/SKILL.md` | 聚合路由入口，按用户意图分派子 skill |
| `saicmotor-leave` | `skills/saicmotor-leave/SKILL.md` | 请假：查余额、提交申请、编排规则 |
| `saicmotor-attendance` | `skills/saicmotor-attendance/SKILL.md` | 考勤：打卡记录、补卡申请 |
| `saicmotor-shared` | `skills/saicmotor-shared/SKILL.md` | 认证/配置/排障，被所有子 skill 引用 |

缺失的是**自动化安装链路**——`package.json` 没有 `postinstall`，没有 `files` 字段，`npm install -g` 后 skills 不会自动注册到 AI 工具。

## 3. 机制

```
npm install -g saicmotor-cli
        │
        ├── ① CLI 进 PATH
        │    package.json: { "bin": { "saicmotor": "dist/cli/index.js" } }
        │    终端可以直接敲 saicmotor xxx（已实现）
        │
        ├── ② Skill 自动注册到所有 AI 工具
        │    postinstall 触发 → npx -y skills add <repo> --all -g
        │    --all = --skill '*' --agent '*' -y
        │    skills 安装到各 AI 工具的 skill 目录
        │    Claude Code: ~/.claude/skills/
        │    Trae/Codex/Cursor/CodeBuddy: 各自约定目录
        │
        └── ③ AI 工具启动时自动扫描并加载
             SKILL.md frontmatter 声明 requires.bins: ["saicmotor"]
             → AI 工具检查系统里有没有 saicmotor 命令
             → 有则加载 skill，按 description 触发路由
```

### 3.1 为什么能兼容多 AI 工具

- **SKILL.md 格式是通用的**：所有主流 AI 工具都认 `SKILL.md` 的 frontmatter + markdown 结构，不绑定任何特定工具
- **`npx skills add --all`**：`--agent '*'` 负责跨工具分发，`skills` CLI 本身知道每个工具的 skill 目录在哪
- **我们的 4 个 SKILL.md 已经是工具无关的**：文件路径引用用 `../` 相对路径，不包含 Claude Code 专属指令

## 4. 变更清单

| # | 文件 | 动作 | 说明 |
|---|------|------|------|
| 1 | `saicmotor-cli/package.json` | 修改 | 加 `files`、`postinstall`、`repository`、`engines`；`tsx` 移到 dependencies |
| 2 | `saicmotor-cli/scripts/postinstall.js` | 新建 | 静默安装 skills + 幂等检查 + 完成提示 |
| 3 | `saicmotor-cli/src/cli/index.ts` | 修改 | 加 `saicmotor install` 子命令 |
| 4 | `saicmotor-cli/test/scripts/postinstall.test.ts` | 新建 | 单测：正常安装、失败降级、环境变量覆盖、幂等跳过 |
| 5 | `saicmotor-cli/test/unit/install-command.test.ts` | 新建 | 单测：`saicmotor install` 命令调用 installSkills |

### 4.1 `package.json` 变更

```diff
{
  "bin": { "saicmotor": "dist/cli/index.js" },
+ "files": [
+   "dist/",
+   "skills/",
+   "catalog/",
+   "scripts/"
+ ],
  "scripts": {
+   "postinstall": "node scripts/postinstall.js",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "tsx src/cli/index.ts"
  },
+ "engines": {
+   "node": ">=16"
+ },
+ "repository": {
+   "type": "git",
+   "url": "git+https://github.com/a5535772/saicmotor-cli.git"
+ }
}
```

**dependencies 变更**：`tsx` 从 devDependencies **移到** dependencies。原因：`scripts/` 下的 `.ts` 文件在运行时由 `src/engine/script.ts` 通过 `await import(file)` 动态加载，Node.js 原生不支持 `import .ts`，必须依赖 `tsx` 的 TypeScript 加载器。`npm install -g` 不安装 devDependencies，发布后脚本调度功能会直接报错。

**要点**：

- `dist/` — 编译后的 CLI（运行时必需）
- `skills/` — SKILL.md 文件随包分发（`npx skills add` 从 GitHub 拉取，npm 包里留一份备用）
- `catalog/` + `scripts/` — CLI 运行时必需
- `engines.node >= 16` — 和 feishu-cli 对齐，保证 Node 版本兼容
- `repository` — npm 包页面显示仓库链接，也是 `npx skills add` 的默认来源

### 4.2 `scripts/postinstall.js`

纯 Node.js CommonJS 脚本，零外部依赖（只用了 `child_process` + `fs` + `path`），跨平台兼容。

#### 行为

```
npm install -g saicmotor-cli
        │
        └── postinstall 触发
              ├── ① npx -y skills add <repo> --all -g
              │      从 GitHub 拉 skills/ → 安装到所有 AI 工具的 skill 目录
              │      超时 120s，失败不阻塞 CLI（catch → 打印手动注册提示）
              │
              └── ② 打印完成提示
                     "saicmotor CLI 安装完成。
                      首次使用前请运行: saicmotor auth login
                      探索命令: saicmotor --help"
```

#### 配置化

Skills 源地址通过环境变量 `SAICMOTOR_SKILLS_REPO` 覆盖：

```bash
# 默认（公开 GitHub）
SAICMOTOR_SKILLS_REPO="a5535772/saicmotor-cli"

# 私有仓库（未来切换）
export SAICMOTOR_SKILLS_REPO="my-org/private-skills-repo"
```

当 `SAICMOTOR_SKILLS_REPO` 指向私有仓库时，用户机器需要有该仓库的访问权限（GitHub token / SSH key）。

#### 代码

```js
// scripts/postinstall.js
const { execSync } = require("child_process");

const SKILLS_REPO =
  process.env.SAICMOTOR_SKILLS_REPO || "a5535772/saicmotor-cli";

function skillsAlreadyInstalled() {
  try {
    const out = execSync("npx -y skills ls -g", {
      stdio: "pipe",
      timeout: 30000,
    });
    return /^saicmotor-/m.test(out.toString());
  } catch {
    return false;
  }
}

function installSkills({ force = false } = {}) {
  if (!force && skillsAlreadyInstalled()) {
    console.log("AI skills 已安装，跳过");
    return;
  }

  try {
    execSync(`npx -y skills add ${SKILLS_REPO} --all -g`, {
      stdio: "pipe",
      timeout: 120000,
    });
    console.log("✓ AI skills 已注册");
  } catch {
    console.log(
      `⚠ AI skills 注册失败，稍后可手动运行:\n` +
        `  saicmotor install\n` +
        `  或: npx skills add ${SKILLS_REPO} --all -g`
    );
  }
}

module.exports = { installSkills, skillsAlreadyInstalled, SKILLS_REPO };

if (require.main === module) {
  console.log("\nsaicmotor CLI 安装完成。");
  installSkills();
  console.log("  首次使用前请运行: saicmotor auth login");
  console.log("  探索命令: saicmotor --help\n");
}
```

#### 错误处理

| 场景 | 行为 |
|------|------|
| skills 已安装（postinstall 自动模式） | 打印 `AI skills 已安装，跳过` |
| `saicmotor install --force` | 跳过幂等检查，强制重新安装 |
| `npx skills add` 成功 | 打印 `✓ AI skills 已注册` |
| 网络不通 / GitHub 不可达 | catch 后打印警告 + 手动注册命令，exit 0 |
| 超时（120s） | 同上 |
| 用户机器没有 `npx` | 同上 |

### 4.3 `src/cli/index.ts` — `saicmotor install` 命令

**问题**：用户可能先装 saicmotor-cli 再装 AI Agent。postinstall 时 AI 工具的 skill 目录还不存在，skills 永远装不上。用户需要一种方式重新触发 skills 注册。

**方案**：参考 feishu-cli 的 `lark-cli install`，增加 `saicmotor install` 子命令。用户装了新 AI 工具后，只需运行 `saicmotor install` 即可将 skills 注册到新工具。

```ts
// src/cli/index.ts 中新增
import { execSync } from "child_process";

const SKILLS_REPO =
  process.env.SAICMOTOR_SKILLS_REPO || "a5535772/saicmotor-cli";

program
  .command("install")
  .description("安装/重装 AI skills 到所有已安装的 AI 工具")
  .option("--force", "强制重新安装（即使已安装）")
  .action((opts) => {
    const { installSkills } = require("../scripts/postinstall.js");
    installSkills({ force: opts.force });
  });
```

**CLI 命令树**：

```
saicmotor                 # 主入口
├── leave                 # 请假（已有）
├── attendance            # 考勤（已有）
├── auth                  # 认证（已有）
└── install               # 新：安装/重装 AI skills
```

### 4.4 `scripts/postinstall.js` — 幂等 + 可重入

**新增能力**：
- `skillsAlreadyInstalled()` — postinstall 时做幂等检查，避免重复 `npx skills add`
- `installSkills({ force })` — `saicmotor install` 调用时可传 `--force` 跳过检查
- postinstall 自动模式：已安装则跳过，不浪费网络请求
- `saicmotor install --force`：强制重新安装（比如 skills 有更新）

### 4.5 `test/scripts/postinstall.test.ts`

| 测试 | 场景 | 断言 |
|------|------|------|
| `installs skills when not already installed` | `skills ls` throw（未安装），`skills add` 成功 | stdout 包含 `✓ AI skills 已注册` |
| `skips when already installed` | `skills ls` 返回含 `saicmotor-` 的输出 | stdout 包含 `AI skills 已安装，跳过`，不调用 `skills add` |
| `force reinstalls even if already installed` | `skills ls` 返回已安装，但 force=true | 调用 `skills add`，stdout 包含 `✓ AI skills 已注册` |
| `handles install failure gracefully` | `skills ls` throw，`skills add` throw | stdout 包含 `⚠ AI skills 注册失败` |
| `respects SAICMOTOR_SKILLS_REPO` | 环境变量覆盖 | `execSync` 的命令中包含自定义 repo |

测试策略：mock `child_process.execSync`，根据输入命令（`skills ls` vs `skills add`）返回不同结果。

### 4.6 `test/unit/install-command.test.ts`

验证 `saicmotor install` CLI 命令正确调用 `installSkills`：

| 测试 | 场景 | 断言 |
|------|------|------|
| `saicmotor install executes installSkills` | 运行 `saicmotor install` | postinstall 的 `installSkills` 被调用 |
| `saicmotor install --force passes force flag` | 运行 `saicmotor install --force` | 调用 `installSkills({ force: true })` |

## 5. 不在范围

- **不新建 `AGENTS.md`**：当前仓库结构下，`skills/` 已完整覆盖 AI 使用 saicmotor-cli 的所有场景。`AGENTS.md` 是给 AI 参与代码开发的指引，与"让 AI 发现 CLI"无关，后续按需另加
- **不改 skill 内容**：4 个 SKILL.md 在 Sprint 3 已完成，内容符合工具无关要求，无需修改
- **不做交互式安装向导**：postinstall 采用静默 + 提示模式（中等交互），不做 feishu-cli 式的 TUI 向导
- **不发 npm 包**：发布动作属于运维操作，不在本次开发范围

## 6. 测试策略

| 层 | 测试 | 工具 |
|----|------|------|
| 单测 | postinstall.js 三个场景（mock execSync） | vitest |
| 手工验证 | `npm pack` 检查 `files` 包含正确的文件 | shell |
| 手工验证 | `npm link` 后执行 `node scripts/postinstall.js` | shell |

集成测试不在此范围——`npx skills add` 是外部工具，需要真实 GitHub 和网络，适合发布前手工验证。

## 7. 与 feishu-cli 对比

| 维度 | feishu-cli | saicmotor-cli（本次设计） |
|------|-----------|--------------------------|
| postinstall 入口 | `node scripts/install.js`（二进制下载） | `node scripts/postinstall.js`（skills 注册） |
| Skills 安装 | `npx skills add larksuite/cli -y -g` | `npx skills add a5535772/saicmotor-cli --all -g` |
| 交互模式 | 4 步 TUI 向导 + `@clack/prompts` | 静默 + 一行提示（中等交互） |
| 多 AI 工具 | 通过 `skills add` 和通用 SKILL.md 格式 | 同样机制，`--all` 分发到所有工具 |
| 二进制分发 | Go 编译的独立二进制（install.js 负责下载） | TypeScript 编译 + Node 运行（`npm install -g` 即完成） |
| 配置化 | 无环境变量覆盖 skills repo | `SAICMOTOR_SKILLS_REPO` 环境变量 |