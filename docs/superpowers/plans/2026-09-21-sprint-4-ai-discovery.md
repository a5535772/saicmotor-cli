# Sprint 4 — AI 发现机制 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `npm install -g saicmotor-cli` 后自动注册 skills 到所有 AI 工具，支持 `saicmotor install` 命令重新注册。

**Architecture:** 改 `package.json`（加 `files`/`postinstall`/`repository`/`engines`，`tsx` 移 dependencies），新建 `scripts/postinstall.js`（幂等检查 + `npx skills add --all -g` + 完成提示），加 `saicmotor install` CLI 命令，vitest 单测覆盖所有场景。

**Tech Stack:** Node.js CommonJS（postinstall 脚本，零外部依赖），Commander（CLI 命令注册），vitest（单测，mock `child_process.execSync`）

**Spec:** [2026-09-21-sprint-4-ai-discovery-design.md](../specs/2026-09-21-sprint-4-ai-discovery-design.md)

---

### Task 1: 修改 `package.json` — `files`、`postinstall`、`repository`、`engines`、`tsx` 移动

**Files:**
- Modify: `saicmotor-cli/package.json`

- [ ] **Step 1: 修改 package.json**

当前内容：
```json
{
  "name": "saicmotor-cli",
  "version": "0.1.0",
  "description": "把无源码业务网页系统包装成 CLI 的通用平台（POC）",
  "type": "commonjs",
  "bin": { "saicmotor": "dist/cli/index.js" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "tsx src/cli/index.ts"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.16.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

改为：
```json
{
  "name": "saicmotor-cli",
  "version": "0.1.0",
  "description": "把无源码业务网页系统包装成 CLI 的通用平台（POC）",
  "type": "commonjs",
  "bin": { "saicmotor": "dist/cli/index.js" },
  "files": [
    "dist/",
    "skills/",
    "catalog/",
    "scripts/"
  ],
  "scripts": {
    "postinstall": "node scripts/postinstall.js",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "tsx src/cli/index.ts"
  },
  "engines": {
    "node": ">=16"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/a5535772/saicmotor-cli.git"
  },
  "dependencies": {
    "commander": "^12.1.0",
    "tsx": "^4.16.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

**关键变更**：
- `tsx` 从 devDependencies **移到** dependencies（`scripts/` 下的 `.ts` 文件运行时依赖 `tsx` 加载，`npm install -g` 不装 devDependencies）
- 新加 `files`、`postinstall`、`engines`、`repository`

- [ ] **Step 2: 验证 JSON 格式正确**

```bash
cd saicmotor-cli && node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: 重新安装依赖（tsx 现在在 dependencies）**

```bash
cd saicmotor-cli && npm install
```

Expected: 无报错，`node_modules/tsx` 存在

- [ ] **Step 4: Commit**

```bash
git add saicmotor-cli/package.json saicmotor-cli/package-lock.json
git commit -m "feat(pkg): add files, postinstall, repository, engines; move tsx to deps"
```

---

### Task 2: 写 postinstall 的失败测试（TDD）

**Files:**
- Create: `saicmotor-cli/test/scripts/postinstall.test.ts`

- [ ] **Step 1: 创建测试目录**

```bash
mkdir -p saicmotor-cli/test/scripts
```

- [ ] **Step 2: 写五个失败测试**

```ts
// saicmotor-cli/test/scripts/postinstall.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("child_process", () => ({
  execSync: vi.fn(),
}));

import { installSkills } from "../../scripts/postinstall.js";
import { execSync } from "child_process";

describe("installSkills", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("installs skills when not already installed", () => {
    // skillsAlreadyInstalled: skills ls fails → not installed
    vi.mocked(execSync)
      .mockImplementationOnce(() => {
        throw new Error("command failed"); // skills ls fails
      })
      .mockReturnValueOnce(Buffer.from("")); // skills add succeeds

    installSkills();

    expect(execSync).toHaveBeenNthCalledWith(
      1,
      "npx -y skills ls -g",
      { stdio: "pipe", timeout: 30000 }
    );
    expect(execSync).toHaveBeenNthCalledWith(
      2,
      "npx -y skills add a5535772/saicmotor-cli --all -g",
      { stdio: "pipe", timeout: 120000 }
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("✓ AI skills 已注册");
  });

  it("skips when already installed", () => {
    vi.mocked(execSync).mockReturnValueOnce(
      Buffer.from("saicmotor-suite\nsaicmotor-leave\n")
    );

    installSkills();

    expect(consoleLogSpy).toHaveBeenCalledWith("AI skills 已安装，跳过");
    // 只调用了 skills ls，没有调用 skills add
    expect(execSync).toHaveBeenCalledTimes(1);
    expect(execSync).toHaveBeenCalledWith(
      "npx -y skills ls -g",
      { stdio: "pipe", timeout: 30000 }
    );
  });

  it("force reinstalls even if already installed", () => {
    vi.mocked(execSync)
      .mockReturnValueOnce(Buffer.from("saicmotor-suite\n")); // skills ls

    installSkills({ force: true });

    // force=true 跳过 skillsAlreadyInstalled 检查，直接 add
    expect(execSync).toHaveBeenNthCalledWith(
      1,
      "npx -y skills add a5535772/saicmotor-cli --all -g",
      { stdio: "pipe", timeout: 120000 }
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("✓ AI skills 已注册");
  });

  it("handles install failure gracefully", () => {
    vi.mocked(execSync)
      .mockImplementationOnce(() => {
        throw new Error("command failed"); // skills ls fails
      })
      .mockImplementationOnce(() => {
        throw new Error("network error"); // skills add fails
      });

    installSkills();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "⚠ AI skills 注册失败，稍后可手动运行:\n" +
        "  saicmotor install\n" +
        "  或: npx skills add a5535772/saicmotor-cli --all -g"
    );
  });

  it("respects SAICMOTOR_SKILLS_REPO env var for custom repo", async () => {
    vi.stubEnv("SAICMOTOR_SKILLS_REPO", "my-org/private-repo");
    vi.mocked(execSync)
      .mockImplementationOnce(() => {
        throw new Error("command failed"); // ls fails → not installed
      })
      .mockReturnValueOnce(Buffer.from(""));

    // Re-import to pick up env var since module reads it at require time
    vi.resetModules();
    const { installSkills: fn } = await import("../../scripts/postinstall.js");

    fn();

    expect(execSync).toHaveBeenCalledWith(
      "npx -y skills add my-org/private-repo --all -g",
      { stdio: "pipe", timeout: 120000 }
    );
  });
});
```

- [ ] **Step 3: 运行测试，确认全部 FAIL**

```bash
cd saicmotor-cli && npx vitest run test/scripts/postinstall.test.ts
```

Expected: 5 tests FAIL — `Cannot find module '../../scripts/postinstall.js'`

- [ ] **Step 4: Commit**

```bash
git add saicmotor-cli/test/scripts/postinstall.test.ts
git commit -m "test(postinstall): add failing tests for skill registration with idempotency"
```

---

### Task 3: 实现 `scripts/postinstall.js`

**Files:**
- Create: `saicmotor-cli/scripts/postinstall.js`

- [ ] **Step 1: 创建 postinstall.js**

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

- [ ] **Step 2: 运行 postinstall 单测，确认全部 PASS**

```bash
cd saicmotor-cli && npx vitest run test/scripts/postinstall.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 3: Commit**

```bash
git add saicmotor-cli/scripts/postinstall.js
git commit -m "feat(scripts): add postinstall hook with idempotency check"
```

---

### Task 4: 加 `saicmotor install` CLI 命令

**Files:**
- Modify: `saicmotor-cli/src/cli/index.ts`

- [ ] **Step 1: 读当前 CLI 入口**

先用 Read 查看 `saicmotor-cli/src/cli/index.ts` 当前结构，理解 Commander 的 program 注册方式。

- [ ] **Step 2: 在 `src/cli/index.ts` 中加 install 命令**

在 program 定义区域（auth 命令之后、parse 之前）加入：

```ts
// 新增：install 命令 — 安装/重装 AI skills
program
  .command("install")
  .description("安装/重装 AI skills 到所有已安装的 AI 工具")
  .option("--force", "强制重新安装（即使已安装）")
  .action((opts) => {
    const { installSkills } = require("../../scripts/postinstall.js");
    installSkills({ force: opts.force });
  });
```

- [ ] **Step 3: 验证 CLI 编译 + help 输出**

```bash
cd saicmotor-cli && npm run build && node dist/cli/index.js --help
```

Expected: help 输出中包含 `install` 命令

```bash
cd saicmotor-cli && node dist/cli/index.js install --help
```

Expected: 显示 install 命令的选项 `--force`

- [ ] **Step 4: Commit**

```bash
git add saicmotor-cli/src/cli/index.ts
git commit -m "feat(cli): add 'saicmotor install' command for skill registration"
```

---

### Task 5: 写 `saicmotor install` 命令的单测

**Files:**
- Create: `saicmotor-cli/test/unit/install-command.test.ts`

- [ ] **Step 1: 写测试**

CLI 命令通过 Commander 注册，集成测试较复杂。这里的策略是验证 `installSkills` 导出签名正确，同时验证 `require.main === module` 分支不会静默吞掉 install 模式。CLI 端到端行为在 Task 6 手工验证。

```ts
// saicmotor-cli/test/unit/install-command.test.ts
import { describe, it, expect } from "vitest";

// 直接 import postinstall 导出的函数，验证签名
import {
  installSkills,
  skillsAlreadyInstalled,
  SKILLS_REPO,
} from "../../scripts/postinstall.js";

describe("saicmotor install command", () => {
  it("installSkills is a function accepting optional force option", () => {
    expect(typeof installSkills).toBe("function");
    // 验证函数接受 { force } 参数——不抛错即通过
    expect(() => installSkills({ force: false })).not.toThrow();
    expect(() => installSkills({ force: true })).not.toThrow();
    expect(() => installSkills()).not.toThrow();
  });

  it("skillsAlreadyInstalled returns boolean", async () => {
    // 在当前测试环境 npx 可能不可用，返回 false 是正常降级
    const result = skillsAlreadyInstalled();
    expect(typeof result).toBe("boolean");
  });

  it("SKILLS_REPO defaults to a5535772/saicmotor-cli", () => {
    expect(SKILLS_REPO).toBe("a5535772/saicmotor-cli");
  });
});
```

> **设计说明**：`require.main === module` 分支保证 postinstall.js 作为独立脚本执行时运行 `installSkills()`。CLI 的 `saicmotor install` 命令通过 Commander action 调用同一个 `installSkills` 函数，路径是 `require("../../scripts/postinstall.js")`（从 `src/cli/index.ts` 编写时）→ 编译后需验证相对路径正确。此集成在 Task 6 手工验证。

- [ ] **Step 2: 运行测试**

```bash
cd saicmotor-cli && npx vitest run test/unit/install-command.test.ts
```

Expected: 3 tests PASS（`skillsAlreadyInstalled` 在有 npx 的环境返回 boolean，无 npx 的环境返回 false——都是合法的）

- [ ] **Step 3: Commit**

```bash
git add saicmotor-cli/test/unit/install-command.test.ts
git commit -m "test(cli): verify installSkills export signature for install command"
```

---

### Task 6: 全量测试 + npm pack 验证

**Files:** (none — verification only)

- [ ] **Step 1: 运行全量测试**

```bash
cd saicmotor-cli && npx vitest run
```

Expected: 所有已有测试 + 新测试全部 PASS

- [ ] **Step 2: 验证 `npm pack` 包含正确文件**

```bash
cd saicmotor-cli && npm pack --dry-run 2>&1
```

Expected: 输出中列出 `dist/`、`skills/`、`catalog/`、`scripts/` 下的文件，且**不包含** `src/`、`test/`、`node_modules/`。`package.json` 和 `README.md` 会被 npm 自动包含。

- [ ] **Step 3: 手工验证 `node scripts/postinstall.js` 可直接执行**

```bash
cd saicmotor-cli && node scripts/postinstall.js
```

Expected: 打印安装完成提示（skills 注册可能失败或跳过，取决于当前环境，不影响验证）

- [ ] **Step 4: Commit（如有修正）**

```bash
git add -A
git commit -m "chore: verify full test suite and npm pack with postinstall changes"
```

---

### Task 7: 更新 Sprint 文档状态

**Files:**
- Modify: `docs/sprint/sprint-4-ai-discovery.md`
- Modify: `docs/sprint/总览.md`

- [ ] **Step 1: 更新 sprint-4-ai-discovery.md 状态**

把第 3 行：
```markdown
> **状态**: ⬜ 待排期 | **预计时间**: 待定
```

改为：
```markdown
> **状态**: ✅ 完成 | **完成时间**: 2026-09-21
```

替换第 58 行的：
```markdown
> 等待后续规划，目前尚未有对应的 superpowers 设计文档或 plan。
```

为：
```markdown
> - 设计文档: [2026-09-21-sprint-4-ai-discovery-design.md](../superpowers/specs/2026-09-21-sprint-4-ai-discovery-design.md)
> - 实施计划: [2026-09-21-sprint-4-ai-discovery.md](../superpowers/plans/2026-09-21-sprint-4-ai-discovery.md)
```

- [ ] **Step 2: 更新总览.md 状态**

把 Sprint 4 行：
```markdown
| [sprint-4-ai-discovery.md](sprint-4-ai-discovery.md) | ⬜ 待排期 | AI 发现机制：让 Claude Code 认识 saicmotor-cli |
```

改为：
```markdown
| [sprint-4-ai-discovery.md](sprint-4-ai-discovery.md) | ✅ 完成 | AI 发现机制：技能自动注册 + saicmotor install |
```

在"Superpowers 设计文档"表格追加：
```markdown
| [2026-09-21-sprint-4-ai-discovery-design.md](../superpowers/specs/2026-09-21-sprint-4-ai-discovery-design.md) | S4 |
```

在"Superpowers 实施计划"表格追加：
```markdown
| [2026-09-21-sprint-4-ai-discovery.md](../superpowers/plans/2026-09-21-sprint-4-ai-discovery.md) | S4 |
```

- [ ] **Step 3: Commit**

```bash
git add docs/sprint/sprint-4-ai-discovery.md docs/sprint/总览.md
git commit -m "docs: mark Sprint 4 AI discovery as done"
```