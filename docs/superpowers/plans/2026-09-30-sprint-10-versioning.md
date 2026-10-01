# Sprint 10 — 版本号管理体系：实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将版本号收敛到 `packages/cli/package.json` 单一真相源，全体系动态读取；脚手架 `engine` 字段从 `^` 改为 `>=` 以消除 0.x 跨小版本陷阱。

**Architecture:** 新建 `version.ts` 导出 `getCoreVersion()` 作为全体系版本号的唯一读取函数；4 个源文件消费者从硬编码改为调用此函数；1 个独立同步脚本在 publish 时将 CLI version 拷到 SDK；5 个测试文件消除 `"0.8.0"` 字面量。

**Tech Stack:** TypeScript (CommonJS), Node.js, vitest, semver（已有依赖）

**Spec:** [2026-09-30-sprint-10-versioning-design.md](../../../../docs/superpowers/specs/2026-09-30-sprint-10-versioning-design.md)

## Global Constraints

- 版本号唯一真相源：`packages/cli/package.json` → `version`
- 只改脚手架生成的模板，不改现有插件的 manifest（plugin-leave / plugin-attendance / plugin-user）
- 不建 CI publish pipeline（同步脚本仅提供能力）
- `semver` 是已有生产依赖（`loader.ts` 已用），不需新增
- SDK `package.json` 的 `version` 字段静态保留，只在 `npm run sync-versions` 时覆写

## Review Focus

1. `getCoreVersion()` 在 dist 环境下应正确解析 `__dirname/../package.json`——若 TypeScript 编译后 `__dirname` 指向 `dist/src/` 而非 `dist/`，路径会错一层。验证：build 后在 `dist/` 外 `node -e "require('./packages/cli/dist/version').getCoreVersion()"` 应返回正确版本。
2. `sync-versions.mjs` 写入 SDK 的 `package.json` 后应保留末尾换行和 2-space indent——否则下次 `npm install` 可能改写。
3. 脚手架 init 时 `CORE_VERSION` 需在命令执行时计算——若模块顶层在 import 时计算而 `package.json` 尚不存在（理论上不可能，`saicmotor` 命令本身就从 CLI 包里启动），不会有问题。但测试环境中 vitest 的 `root` 可能与源码路径不一致，需确认 `getCoreVersion()` 的 `__dirname` 在测试中能正确解析。
4. `program.version(getCoreVersion())` 在 `--version` flag 下输出 commander 默认格式（裸版本号 + 换行），与 commander 行为一致，不应有额外前缀。
5. `suite.ts` 的 `version` 字段从硬编码变为模板字面量后，函数应保持纯返回 string——不应在函数内有副作用（如每次调用都读文件）。实现者应在模块顶层调用一次 `getCoreVersion()` 后缓存。

---

### Task 1: 创建 `version.ts` — `getCoreVersion()` 函数

**Files:**
- Create: `packages/cli/src/version.ts`
- Create: `packages/cli/test/unit/version.test.ts`

**Interfaces:**
- Produces: `export function getCoreVersion(): string` — 返回 `packages/cli/package.json` 的 `version` 字段；读取失败返回 `"0.0.0"`。函数内部做缓存（模块级私有变量，首次调用后不再读文件）。

- [ ] **Step 1: 编写测试 `packages/cli/test/unit/version.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { getCoreVersion } from "../../src/version";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("getCoreVersion", () => {
  it("返回 packages/cli/package.json 中的 version 字段", () => {
    const expected = JSON.parse(
      readFileSync(resolve(__dirname, "..", "..", "package.json"), "utf-8")
    ).version;
    expect(getCoreVersion()).toBe(expected);
  });

  it("两次调用返回相同值（缓存生效）", () => {
    expect(getCoreVersion()).toBe(getCoreVersion());
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/version.test.ts`
Expected: FAIL — module not found / function not exported

- [ ] **Step 3: 实现 `packages/cli/src/version.ts`**

```ts
import { readFileSync } from "fs";
import { resolve } from "path";

let cached: string | null = null;

export function getCoreVersion(): string {
  if (cached !== null) return cached;
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "..", "package.json"), "utf-8")
    ) as { version?: string };
    cached = pkg.version ?? "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/unit/version.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/version.ts packages/cli/test/unit/version.test.ts
git commit -m "feat: 创建 getCoreVersion() 统一版本读取函数"
```

---

### Task 2: Rewire 4 个源文件消费者到 `getCoreVersion()`

**Files:**
- Modify: `packages/cli/src/plugin/loader.ts:62-72` — 替换本地 `readCoreVersion` 为 `import { getCoreVersion } from "../version"`
- Modify: `packages/cli/src/cli/index.ts:16` — `version("0.8.0")` → `version(getCoreVersion())`
- Modify: `packages/cli/src/plugin/suite.ts:26` — `"version: 0.8.0"` → `` `version: ${getCoreVersion()}` ``
- Modify: `packages/cli/src/cli/tooling-cmds.ts:47,85` — `"^0.8.0"` → `">=${getCoreVersion()}"`

**Interfaces:**
- Consumes: `getCoreVersion()` from `packages/cli/src/version.ts` (Task 1)

- [ ] **Step 1: 修改 `loader.ts`**

删除本地函数 `readCoreVersion()`（第 62-70 行），`CORE_VERSION = readCoreVersion()` 改为 `import { getCoreVersion } from "../version"; const CORE_VERSION = getCoreVersion();`

- [ ] **Step 2: 修改 `index.ts`**

第 16 行：`version("0.8.0")` → 在文件顶部加 `import { getCoreVersion } from "../version"`，改为 `version(getCoreVersion())`

- [ ] **Step 3: 修改 `suite.ts`**

第 26 行：`"version: 0.8.0"` → 在文件顶部加 `import { getCoreVersion } from "../version"`，在模块顶层 `const SUITE_VERSION = getCoreVersion()` 然后模板字面量中使用。`generateSuiteSkill` 函数体内不调用 `getCoreVersion()`（避免每次调用读缓存以外的逻辑；缓存已无开销，但语义上模块常量更清晰）。

- [ ] **Step 4: 修改 `tooling-cmds.ts`**

在第 47 行（`"@saicmotor/sdk"` devDependency）和第 85 行（`engine` 字段）：`"^0.8.0"` → `">=${getCoreVersion()}"`。在文件顶部加 `import { getCoreVersion } from "../version"`，在模块顶层 `const CORE_VERSION = getCoreVersion()`，两处替换为 `` `>=${CORE_VERSION}` ``。

- [ ] **Step 5: 跑全量测试确认无回归**

Run: `npm test`
Expected: 全部 PASS，无新增失败

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/plugin/loader.ts packages/cli/src/cli/index.ts packages/cli/src/plugin/suite.ts packages/cli/src/cli/tooling-cmds.ts
git commit -m "refactor: 4 个消费者接入 getCoreVersion()，消除版本硬编码"
```

---

### Task 3: 创建 SDK 版本同步脚本

**Files:**
- Create: `scripts/sync-versions.mjs`
- Modify: `package.json` — scripts 块加 `"sync-versions"`

**Interfaces:**
- Produces: `node scripts/sync-versions.mjs` — 读 `packages/cli/package.json` version，覆写到 `packages/sdk/package.json` version，控制台打印 `Synced SDK version → x.y.z`

- [ ] **Step 1: 创建 `scripts/sync-versions.mjs`**

```mjs
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const cliPkg = JSON.parse(
  readFileSync(resolve(root, "packages", "cli", "package.json"), "utf-8")
);
const sdkPkgPath = resolve(root, "packages", "sdk", "package.json");
const sdkPkg = JSON.parse(readFileSync(sdkPkgPath, "utf-8"));

if (sdkPkg.version === cliPkg.version) {
  console.log(`SDK version already ${cliPkg.version}, no sync needed`);
  process.exit(0);
}

sdkPkg.version = cliPkg.version;
writeFileSync(sdkPkgPath, JSON.stringify(sdkPkg, null, 2) + "\n");
console.log(`Synced SDK version → ${cliPkg.version}`);
```

- [ ] **Step 2: 在根 `package.json` 的 `scripts` 块加 `"sync-versions"`**

```json
"sync-versions": "node scripts/sync-versions.mjs"
```

- [ ] **Step 3: 验证脚本**

Run: `node scripts/sync-versions.mjs`
Expected: 控制台输出 `Synced SDK version → 0.8.0`（或 `SDK version already 0.8.0, no sync needed`）
Verify: `node -e "console.log(require('./packages/sdk/package.json').version)"` 输出 `0.8.0`

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-versions.mjs package.json
git commit -m "feat: 添加 SDK 版本同步脚本 sync-versions.mjs"
```

---

### Task 4: 测试文件消除 `"0.8.0"` 硬编码

**Files:**
- Modify: `packages/cli/test/unit/tooling-cmds.test.ts` — 脚手架断言从 `"^0.8.0"` 改为 `>=` 格式 + test fixtures 用 `getCoreVersion()`
- Modify: `packages/cli/test/unit/plugin-cmds.test.ts` — fixture 中 `version: "0.8.0"` / `engine: "^0.8.0"` → `getCoreVersion()`
- Modify: `packages/cli/test/unit/plugin-registrar.test.ts` — fixture `version: "0.8.0"` / `engine: "^0.8.0"` → `getCoreVersion()`
- Modify: `packages/cli/test/unit/script.test.ts` — fixture `engine: "^0.8.0"` → `getCoreVersion()`
- Modify: `packages/cli/test/unit/state.test.ts` — fixture `version: "0.8.0"` + 断言 → `getCoreVersion()`

**Interfaces:**
- Consumes: `getCoreVersion()` from `packages/cli/src/version.ts` (Task 1)
- Consumes: `tooling-cmds.ts` 脚手架新输出格式 `>=` (Task 2)

**重要原则：**
- 脚手架输出断言（`tooling-cmds.test.ts:85`）：改为匹配 `>=` 前缀 + 当前版本号
- 插件 fixture（所有文件里模拟已安装插件的 `engine`/`version` 值）：用 `getCoreVersion()` 的真实值构造 `^` 或版本字符串——测试不再依赖 `"0.8.0"` 魔术字符串
- **不可** 把 fixture 里的 `engine: "^0.8.0"` 也改成 `>=`——那些是模拟**已有插件的 manifest**，它们的 `^` 声明是历史事实，测试要验证 engine 校验逻辑正确处理 `^` 声明

- [ ] **Step 1: 更新 `tooling-cmds.test.ts`**

  - 第 85 行 `expect(manifest.engine).toBe("^0.8.0")` → `expect(manifest.engine).toBe(">=0.8.0")`（或用 `getCoreVersion()` 动态构造期望值：`` expect(manifest.engine).toBe(`>=${getCoreVersion()}`) ``）
  - 第 134、160、170、202 行：fixture 中 `engine: "^0.8.0"` 保留不变（这些是验证 manifest 校验逻辑的 input，模拟旧插件）

- [ ] **Step 2: 更新 `plugin-cmds.test.ts`**

  - 所有 `version: "0.8.0"` 字面量 → `getCoreVersion()`
  - 所有 `engine: "^0.8.0"` 字面量 → `` `^${getCoreVersion()}` ``（注意保留 `^`——这些 fixture 模拟已有插件）
  - 第 247 行 `expect(result.data!.version).toBe("0.8.0")` → `.toBe(getCoreVersion())`

- [ ] **Step 3: 更新 `plugin-registrar.test.ts`**

  - 所有 `version: "0.8.0"` → `getCoreVersion()`
  - 所有 `engine: "^0.8.0"` → `` `^${getCoreVersion()}` ``

- [ ] **Step 4: 更新 `script.test.ts`**

  - 所有 `engine: "^0.8.0"` → `` `^${getCoreVersion()}` ``

- [ ] **Step 5: 更新 `state.test.ts`**

  - fixture 中 `version: "0.8.0"` → `getCoreVersion()`
  - 第 41 行 `expect(reloaded.plugins["@saicmotor/plugin-leave"].version).toBe("0.8.0")` → `.toBe(getCoreVersion())`

- [ ] **Step 6: 跑全量测试**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 7: Commit**

```bash
git add packages/cli/test/unit/
git commit -m "test: 消除测试中 0.8.0 版本硬编码，改用 getCoreVersion()"
```

---

## Self-Review

**1. Spec coverage:**
- 公共版本读取函数 → Task 1
- `program.version()` 动态读取 → Task 2 (step 2)
- suite SKILL.md 版本注入 → Task 2 (step 3)
- 脚手架 `^ → >=` → Task 2 (step 4)
- SDK 版本同步脚本 → Task 3
- 现有插件不动 → 无任务（不操作等于满足）
- 测试适配 → Task 4
- 验收标准：全部覆盖在 Task 2-4 的验证步骤中

**2. Step scan:** 每个 step 有明确的代码或命令，无 TBD/模糊描述。

**3. Type consistency:** `getCoreVersion()` 签名在所有 Task 的 Interfaces 中一致：`(): string`。

**4. Review Focus:** 5 条 Review Focus 中的关注点已融入各 Task——Task 1 确保 dist 路径正确、Task 2 确保 commander 输出正确、Task 3 确保 JSON 格式保留、Task 4 用全量测试覆盖回归。

**5. Proportion:** 4 个任务，计划长度约为 spec 的 1.5 倍——合理。