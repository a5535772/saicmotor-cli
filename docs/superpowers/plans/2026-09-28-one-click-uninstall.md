# 一键卸载 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户一条 `saicmotor uninstall`（或直接 `npm uninstall -g @saicmotor/cli`）即可清空 AI 客户端 skills、`~/.saicmotor` 本地数据与 npm 全局包三处残留，无交互确认。

**Architecture:** 在现有 `registrar.ts` 新增「按 `saicmotor-*` 前缀清空」函数；在 `src/install/` 新增 `uninstall()` 编排函数（清 skills → 删数据 → `npm uninstall -g` 自删）；在 `scripts/uninstall.js` 新增 preuninstall 兜底脚本（纯 JS、幂等、永不抛、npx 规避）；`package.json` 接 `preuninstall` 生命周期并补 `files`，`cli/index.ts` 注册顶层 `uninstall` 命令。

**Tech Stack:** TypeScript + Node ≥ 16（CommonJS）、Commander、vitest、npm lifecycle hooks。

**参考 spec:** `docs/superpowers/specs/2026-09-28-one-click-uninstall-design.md`

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `packages/cli/src/plugin/registrar.ts` | 修改：新增 `unregisterAllSkills()`（按前缀清空） |
| `packages/cli/src/install/uninstall.ts` | 新建：`uninstall()` 编排（清 skills → 删数据 → 自删包） |
| `packages/cli/src/cli/index.ts` | 修改：注册顶层 `uninstall` 命令 |
| `packages/cli/scripts/uninstall.js` | 新建：preuninstall 兜底脚本（纯 JS，无 TS 依赖） |
| `packages/cli/package.json` | 修改：`preuninstall` script + `files` 补 `scripts/uninstall.js` |
| `packages/cli/test/unit/uninstall.test.ts` | 新建：`unregisterAllSkills` + `uninstall()` 测试 |
| `packages/cli/test/unit/preuninstall-script.test.ts` | 新建：preuninstall 脚本测试（含 npx 规避 spawn 用例） |

> 说明：`scripts/uninstall.js` 是纯 `.js`（对标现有 `scripts/run.js`），不进 tsconfig 编译（`include` 只含 `src/**/*.ts` 与 `scripts/**/*.ts`），靠 `files` 字段随包发布。

---

### Task 1: `unregisterAllSkills()` 按前缀清空

**Files:**
- Modify: `packages/cli/src/plugin/registrar.ts`（在 `unregisterPluginSkills` 之后追加）
- Test: `packages/cli/test/unit/uninstall.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `packages/cli/test/unit/uninstall.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { unregisterAllSkills, AI_CLIENT_SKILL_DIRS } from "../../src/plugin/registrar";

const origDirs: Record<string, string> = { ...AI_CLIENT_SKILL_DIRS };

describe("unregisterAllSkills", () => {
  let tmpClient: string;

  beforeEach(() => {
    tmpClient = path.join(os.tmpdir(), `saicmotor-unregall-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
      fs.mkdirSync(AI_CLIENT_SKILL_DIRS[k], { recursive: true });
      fs.mkdirSync(path.join(AI_CLIENT_SKILL_DIRS[k], "saicmotor-suite"), { recursive: true });
      fs.mkdirSync(path.join(AI_CLIENT_SKILL_DIRS[k], "saicmotor-user"), { recursive: true });
      fs.mkdirSync(path.join(AI_CLIENT_SKILL_DIRS[k], "other-skill"), { recursive: true });
    }
  });

  afterEach(() => {
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    if (fs.existsSync(tmpClient)) fs.rmSync(tmpClient, { recursive: true, force: true });
  });

  it("removes all saicmotor-* entries, keeps others", () => {
    const removed = unregisterAllSkills();

    for (const dir of Object.values(AI_CLIENT_SKILL_DIRS)) {
      expect(fs.existsSync(path.join(dir as string, "saicmotor-suite"))).toBe(false);
      expect(fs.existsSync(path.join(dir as string, "saicmotor-user"))).toBe(false);
      expect(fs.existsSync(path.join(dir as string, "other-skill"))).toBe(true);
    }
    expect(removed).toContain("saicmotor-suite");
    expect(removed).toContain("saicmotor-user");
  });

  it("is idempotent (second call does not throw)", () => {
    unregisterAllSkills();
    expect(() => unregisterAllSkills()).not.toThrow();
  });

  it("does not throw when client dirs are empty", () => {
    unregisterAllSkills();
    unregisterAllSkills();
    expect(() => unregisterAllSkills()).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/cli && npx vitest run test/unit/uninstall.test.ts`
Expected: FAIL — `unregisterAllSkills is not a function`（导入不存在）。

- [ ] **Step 3: 实现 `unregisterAllSkills`**

在 `packages/cli/src/plugin/registrar.ts` 的 `unregisterPluginSkills` 函数（第 118-123 行）之后追加：

```ts
/**
 * 卸载全部 saicmotor skills：扫描各 AI 客户端目录，删除所有 `saicmotor-` 前缀的条目。
 * 不依赖 state.json 完整——即使用户手动删过状态，残留 junction 也能被兜住。
 * 幂等：删除不存在的条目是 no-op。返回已删除的 skill 名（去重）。
 */
export function unregisterAllSkills(): string[] {
  const removed = new Set<string>();

  for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS)) {
    if (!fs.existsSync(clientSkillsDir)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(clientSkillsDir);
    } catch {
      continue;
    }

    for (const name of entries) {
      if (!name.startsWith("saicmotor-")) continue;
      const target = path.join(clientSkillsDir, name);
      try {
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink() || stat.isDirectory()) {
          fs.rmSync(target, { recursive: true, force: true });
          removed.add(name);
        }
      } catch {
        // 删除失败不阻断卸载流程
      }
    }
  }

  return [...removed];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/cli && npx vitest run test/unit/uninstall.test.ts`
Expected: PASS（3 个用例）。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/plugin/registrar.ts packages/cli/test/unit/uninstall.test.ts
git commit -m "feat: add unregisterAllSkills prefix-based cleanup"
```

---

### Task 2: `uninstall()` 编排函数

**Files:**
- Create: `packages/cli/src/install/uninstall.ts`
- Test: `packages/cli/test/unit/uninstall.test.ts`（追加）

- [ ] **Step 1: 写失败测试**

在 `packages/cli/test/unit/uninstall.test.ts` 顶部导入区追加：

```ts
import { vi } from "vitest";
import { uninstall } from "../../src/install/uninstall";
```

并在文件末尾追加第二个 describe：

```ts
describe("uninstall", () => {
  const origHome = process.env.SAICMOTOR_HOME;
  let tmpHome: string;
  let tmpClient: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmpHome = path.join(os.tmpdir(), `saicmotor-uninstall-home-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    process.env.SAICMOTOR_HOME = tmpHome;
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(path.join(tmpHome, "config.json"), "{}", "utf8");

    tmpClient = path.join(os.tmpdir(), `saicmotor-uninstall-client-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
      fs.mkdirSync(AI_CLIENT_SKILL_DIRS[k], { recursive: true });
      fs.mkdirSync(path.join(AI_CLIENT_SKILL_DIRS[k], "saicmotor-suite"), { recursive: true });
    }
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    if (origHome === undefined) delete process.env.SAICMOTOR_HOME;
    else process.env.SAICMOTOR_HOME = origHome;
    if (fs.existsSync(tmpHome)) fs.rmSync(tmpHome, { recursive: true, force: true });
    if (fs.existsSync(tmpClient)) fs.rmSync(tmpClient, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("clears skills and local data, respects SAICMOTOR_HOME", () => {
    uninstall({ selfRemove: false });

    expect(fs.existsSync(tmpHome)).toBe(false);
    for (const dir of Object.values(AI_CLIENT_SKILL_DIRS)) {
      expect(fs.existsSync(path.join(dir as string, "saicmotor-suite"))).toBe(false);
    }
  });

  it("is idempotent (second call does not throw)", () => {
    uninstall({ selfRemove: false });
    expect(() => uninstall({ selfRemove: false })).not.toThrow();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/cli && npx vitest run test/unit/uninstall.test.ts`
Expected: FAIL — `Cannot find module '../../src/install/uninstall'`。

- [ ] **Step 3: 实现 `uninstall()`**

新建 `packages/cli/src/install/uninstall.ts`：

```ts
// src/install/uninstall.ts
// 一键卸载编排：清 skills → 删本地数据 → 自删 npm 包
import fs from "node:fs";
import { execSync } from "node:child_process";
import { unregisterAllSkills } from "../plugin/registrar";
import { saicmotorDir } from "../config";

export const PKG_NAME = "@saicmotor/cli";

export interface UninstallOptions {
  /** 是否自删 npm 全局包（测试时置 false，避免真实 npm uninstall） */
  selfRemove?: boolean;
}

export function uninstall({ selfRemove = true }: UninstallOptions = {}): void {
  // 1. 清 skills（幂等）
  const removed = unregisterAllSkills();
  console.log(
    removed.length > 0
      ? `✓ 已清除 ${removed.length} 个 saicmotor skills`
      : "✓ 无 saicmotor skills 需要清除"
  );

  // 2. 删本地数据（尊重 SAICMOTOR_HOME）
  const home = saicmotorDir();
  if (fs.existsSync(home)) {
    fs.rmSync(home, { recursive: true, force: true });
    console.log(`✓ 已删除本地数据 ${home}`);
  } else {
    console.log("✓ 无本地数据需要删除");
  }

  // 3. 自删 npm 包
  if (!selfRemove) return;

  try {
    execSync(`npm uninstall -g ${PKG_NAME}`, { stdio: "inherit" });
  } catch {
    console.error(`⚠ npm 包自删失败，请手动执行: npm uninstall -g ${PKG_NAME}`);
  }

  console.log(
    "卸载完成。验证：saicmotor --version 应不可用；各 AI 客户端 skills 目录应无 saicmotor-* 条目"
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/cli && npx vitest run test/unit/uninstall.test.ts`
Expected: PASS（5 个用例：Task 1 的 3 个 + 本 Task 的 2 个）。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/src/install/uninstall.ts packages/cli/test/unit/uninstall.test.ts
git commit -m "feat: add uninstall orchestrator"
```

---

### Task 3: preuninstall 兜底脚本 `scripts/uninstall.js`

**Files:**
- Create: `packages/cli/scripts/uninstall.js`
- Test: `packages/cli/test/unit/preuninstall-script.test.ts`（新建）

- [ ] **Step 1: 写失败测试**

新建 `packages/cli/test/unit/preuninstall-script.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(new URL("../../scripts/uninstall.js", import.meta.url));
const { cleanup, isNpx } = require("../../scripts/uninstall.js") as {
  cleanup: (opts?: { homedir?: string }) => void;
  isNpx: () => boolean;
};

describe("preuninstall script: cleanup", () => {
  let tmpHome: string;

  beforeEach(() => {
    tmpHome = path.join(os.tmpdir(), `saicmotor-preuninstall-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpHome, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpHome)) fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  it("removes saicmotor-* skills and .saicmotor data, keeps others", () => {
    const claudeSkills = path.join(tmpHome, ".claude", "skills");
    const agentsSkills = path.join(tmpHome, ".agents", "skills");
    fs.mkdirSync(claudeSkills, { recursive: true });
    fs.mkdirSync(agentsSkills, { recursive: true });
    fs.mkdirSync(path.join(claudeSkills, "saicmotor-suite"), { recursive: true });
    fs.mkdirSync(path.join(agentsSkills, "saicmotor-user"), { recursive: true });
    fs.mkdirSync(path.join(claudeSkills, "other-skill"), { recursive: true });
    fs.mkdirSync(path.join(tmpHome, ".saicmotor"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".saicmotor", "config.json"), "{}", "utf8");

    cleanup({ homedir: tmpHome });

    expect(fs.existsSync(path.join(claudeSkills, "saicmotor-suite"))).toBe(false);
    expect(fs.existsSync(path.join(agentsSkills, "saicmotor-user"))).toBe(false);
    expect(fs.existsSync(path.join(claudeSkills, "other-skill"))).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, ".saicmotor"))).toBe(false);
  });

  it("is idempotent and never throws on missing dirs", () => {
    expect(() => cleanup({ homedir: tmpHome })).not.toThrow();
    expect(() => cleanup({ homedir: tmpHome })).not.toThrow();
  });
});

describe("preuninstall script: npx guard", () => {
  const origNpmCommand = process.env.npm_command;

  afterEach(() => {
    if (origNpmCommand === undefined) delete process.env.npm_command;
    else process.env.npm_command = origNpmCommand;
  });

  it("isNpx returns true under npm exec", () => {
    process.env.npm_command = "exec";
    expect(isNpx()).toBe(true);
    delete process.env.npm_command;
    expect(isNpx()).toBe(false);
  });

  it("script exits without cleaning when npm_command=exec", () => {
    const tmpHome = path.join(os.tmpdir(), `saicmotor-preuninstall-npx-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(path.join(tmpHome, "config.json"), "{}", "utf8");

    const res = spawnSync(process.execPath, [scriptPath], {
      env: { ...process.env, npm_command: "exec", SAICMOTOR_HOME: tmpHome },
      encoding: "utf8",
    });

    expect(res.status).toBe(0);
    expect(fs.existsSync(tmpHome)).toBe(true); // 未被删

    fs.rmSync(tmpHome, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/cli && npx vitest run test/unit/preuninstall-script.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/uninstall.js'`（脚本尚不存在）。

- [ ] **Step 3: 实现 preuninstall 脚本**

新建 `packages/cli/scripts/uninstall.js`：

```js
#!/usr/bin/env node
// preuninstall hook: 卸载 @saicmotor/cli 时清理 saicmotor skills 与本地数据。
// 幂等、永不抛、npx（npm exec）场景直接跳过，绝不阻断 npm uninstall 本身。

const fs = require("fs");
const path = require("path");
const os = require("os");

function saicmotorHome(homedir = os.homedir()) {
  return process.env.SAICMOTOR_HOME || path.join(homedir, ".saicmotor");
}

function clientSkillDirs(homedir = os.homedir()) {
  return [
    path.join(homedir, ".claude", "skills"),
    path.join(homedir, ".agents", "skills"),
    path.join(homedir, ".codebuddy", "skills"),
  ];
}

function cleanup({ homedir = os.homedir() } = {}) {
  // 1. 清除 saicmotor-* skills（幂等）
  for (const dir of clientSkillDirs(homedir)) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.startsWith("saicmotor-")) continue;
      try {
        fs.rmSync(path.join(dir, name), { recursive: true, force: true });
      } catch {
        // 删除失败不阻断
      }
    }
  }

  // 2. 删除本地数据
  try {
    fs.rmSync(saicmotorHome(homedir), { recursive: true, force: true });
  } catch {
    // 删除失败不阻断
  }
}

function isNpx() {
  return process.env.npm_command === "exec";
}

if (require.main === module) {
  if (isNpx()) {
    process.exit(0);
  }
  cleanup();
}

module.exports = { cleanup, isNpx };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/cli && npx vitest run test/unit/preuninstall-script.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: 提交**

```bash
git add packages/cli/scripts/uninstall.js packages/cli/test/unit/preuninstall-script.test.ts
git commit -m "feat: add preuninstall cleanup script with npx guard"
```

---

### Task 4: 接线（package.json + cli 命令注册）与全量回归

**Files:**
- Modify: `packages/cli/package.json`
- Modify: `packages/cli/src/cli/index.ts`
- Test: `packages/cli/test/unit/uninstall.test.ts`（追加自删降级用例）

- [ ] **Step 1: 写自删降级失败测试**

在 `packages/cli/test/unit/uninstall.test.ts` 文件顶部（`import` 之后、第一个 `describe` 之前）追加 `vi.mock`：

```ts
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));
```

在 `describe("uninstall", ...)` 内追加用例（放在「clears skills...」之后）：

```ts
  it("prints manual command when npm self-remove fails", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(execSync).mockImplementationOnce(() => {
      throw new Error("EBUSY");
    });

    uninstall(); // selfRemove 默认 true，走 execSync

    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("npm uninstall -g @saicmotor/cli")
    );
  });
```

> 注意：`vi.mock("node:child_process", ...)` 会让整个模块的 `execSync` 被替换为 mock，仅影响 `uninstall.ts` 中该 import。`uninstall()` 内其他逻辑（清 skills、删数据）不受影响。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/cli && npx vitest run test/unit/uninstall.test.ts`
Expected: FAIL — 该新用例先跑，但 `uninstall()` 已存在，用例实际应立即通过；若因 `vi.mock` 作用域导致 `execSync` 未被替换，则按报错调整 `vi.mocked` 调用。以测试实际输出为准。

- [ ] **Step 3: 修改 `package.json`**

在 `packages/cli/package.json` 中：

1. `files` 数组末尾追加 `"scripts/uninstall.js"`（在 `"scripts/run.js"` 之后）。
2. `scripts` 对象追加 `"preuninstall": "node scripts/uninstall.js"`。

改后相关片段：

```json
  "files": [
    "README.md",
    "dist/src/**/*.js",
    "dist/scripts/**/*.js",
    "skills/**/*.md",
    "catalog/**/*.json",
    "scripts/run.js",
    "scripts/uninstall.js",
    "saicmotor.config.json"
  ],
  "scripts": {
    "prepublishOnly": "npm run build && npm test",
    "preuninstall": "node scripts/uninstall.js",
    "build": "tsc -p tsconfig.json",
    "clean": "node -e \"fs.rmSync('dist',{recursive:true,force:true})\"",
    "test": "vitest run",
    "dev": "tsx src/cli/index.ts"
  },
```

- [ ] **Step 4: 注册顶层 `uninstall` 命令**

在 `packages/cli/src/cli/index.ts`：

1. 第 12 行 `import { installSkills } from "../install/skills";` 之后追加：

```ts
import { uninstall } from "../install/uninstall";
```

2. 在 `install` 命令注册块（第 66-72 行）之后追加：

```ts
program
  .command("uninstall")
  .description("卸载 saicmotor：清除全部 skills 与本地数据，并自删 npm 全局包")
  .action(() => {
    uninstall();
  });
```

- [ ] **Step 5: 运行全量测试**

Run: `cd packages/cli && npm test`
Expected: 全绿（原 66+ 用例 + 新增用例），无失败。

- [ ] **Step 6: 构建验证 TS 编译通过**

Run: `cd packages/cli && npm run build`
Expected: exit 0，`dist/src/install/uninstall.js` 与 `dist/src/plugin/registrar.js` 生成，无 TS 报错。

- [ ] **Step 7: 提交**

```bash
git add packages/cli/package.json packages/cli/src/cli/index.ts packages/cli/test/unit/uninstall.test.ts
git commit -m "feat: wire uninstall command and preuninstall lifecycle"
```

---

## 完成定义（Done）

- [ ] `saicmotor uninstall` 命令存在，清 skills + 删 `~/.saicmotor` + 自删 npm 包，无交互确认
- [ ] `npm uninstall -g @saicmotor/cli` 触发 preuninstall 脚本，静默清理 skills + 数据，永不阻断卸载
- [ ] npx（`npm_command=exec`）场景 preuninstall 脚本零清理
- [ ] 所有清理幂等，尊重 `SAICMOTOR_HOME`
- [ ] 全量测试绿 + `npm run build` 通过
