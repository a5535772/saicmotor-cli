# Sprint 9 代码质量收尾 + SDK 契约收口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 SDK 收口为插件契约的单一真相源（catalog zod schema、脚本上下文、窄化 Config、SaicmotorError），并落地 6 项有界修复，闭环 Sprint 8 评审遗留的 10 个发现。

**Architecture:** 分两阶段。阶段 A 先把 4 组重复/过宽的类型与错误类收口到 `@saicmotor/sdk`（C1 类型重复、C7 死 API、A7 契约过宽、L6 错误类搬移），CLI 与插件改为从 SDK import；阶段 B 再做 6 项独立的有界修复（S3+S4 路径围栏、L4 冲突文案、C3 warnings channel、A1 死参数、S5 去 token 插值、C5 补注释）。SDK 先构建、CLI/插件后构建（root `npm run build` 已是此顺序）。

**Tech Stack:** TypeScript（strict, CommonJS, ES2022）、zod ^3.23.8、vitest、npm workspaces（5 包：cli / sdk / plugin-user / plugin-leave / plugin-attendance）。

**Spec:** `docs/sprint/sprint-9/sprint-9-code-quality-sdk-consolidation.md`（决策依据见 `docs/sprint/sprint-1-8/sprint-8-code-quality-review-2.0.md` 第六、七章）

## Global Constraints

- SDK 是唯一真相源：CLI 与插件对 catalog 类型、脚本上下文、`SaicmotorError` 一律 `import` 自 `@saicmotor/sdk`，不再保留本地副本。
- zod 版本 `^3.23.8`，已是 sdk 的 runtime dependency，新增 schema 不引入新依赖。
- 构建顺序固定：SDK → CLI/插件。每完成 SDK 变更必须 `npm run build --workspace=packages/sdk` 后再动 CLI/插件。
- 类型错误零容忍：每包 `tsc` 必须 0 error；测试命令为 `npm run test --workspaces`。
- CLI 内部完整 `Config`/`AuthConfig` 保留在 `packages/cli/src/config.ts`（含 9 个 auth 字段），仅 SDK 侧窄化——CLI 内部继续用完整配置，SDK 只暴露插件真正消费的 `{ gateway: string }`。
- `SaicmotorError` 的 `category` 取值恒为 `"validation" | "auth" | "network" | "upstream" | "spec"`，对应 exitCode 2/3/4/5/6，不得增改。

## Review Focus

1. **跨包错误识别**：插件脚本抛出的 `SaicmotorError` 是插件自己 `node_modules` 里那份 SDK 构造的，CLI 的 `handleError` 必须用结构判断（认 `category` + `exitCode`），`instanceof` 会因两份 SDK 副本而失灵。→ Task 5 测试覆盖。
2. **路径穿越**：`service/resource/method` 拼进 `path.join` 时含 `../` 必须被拦在 base 目录内，不能逃逸到 `SAICMOTOR_SCRIPTS` 或插件 scripts 目录之外。→ Task 6 测试覆盖。
3. **插件 catalog 单文件损坏**：一个坏 JSON 只能丢该 service，不能拖垮整个插件，且必须产生一条 warning。→ Task 8 测试覆盖。
4. **service 名冲突**：冲突 warning 必须点名胜者与败者（"当前 X 生效，若要 Y 生效请 disable X"），让用户知道该 disable 谁。→ Task 7 测试覆盖。
5. **窄化 Config 的类型兼容**：插件脚本只读 `ctx.config.gateway` 仍要能通过类型检查，且 CLI 传入完整 `Config`（含 `auth`）仍能赋给窄化的 `ScriptContext.config`。→ Task 3 测试覆盖。

---

### Task 1: SDK 收口 catalog zod schema（C1 — SDK 侧）

**Files:**
- Create: `packages/sdk/src/catalog.ts`
- Delete: `packages/sdk/src/catalog-types.ts`
- Modify: `packages/sdk/src/index.ts:5`
- Create: `packages/sdk/test/catalog.test.ts`
- Delete: `packages/cli/test/unit/catalog-schema.test.ts`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: SDK 导出 `FieldSchema`/`MethodSchema`/`ResourceSchema`/`ServiceSchema`（zod）与类型 `Field`/`Method`/`Resource`/`Service`（`z.infer`）。Task 2 依赖这些导出。

- [ ] **Step 1: 写失败测试** —— 新建 `packages/sdk/test/catalog.test.ts`，内容从 `packages/cli/test/unit/catalog-schema.test.ts` 原样搬移，仅改 import 为 `import { ServiceSchema } from "../src/catalog";`（保留 `valid` fixture 与 3 个用例：`accepts a valid service` / `rejects missing servicePath` / `rejects unknown httpMethod`）。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/sdk && npx vitest run test/catalog.test.ts`
Expected: FAIL，报 `Cannot find module '../src/catalog'`

- [ ] **Step 3: 实现** —— 新建 `packages/sdk/src/catalog.ts`，把 `packages/cli/src/schema/catalog.ts` 的 `FieldSchema`/`MethodSchema`/`ResourceSchema`/`ServiceSchema` 与 `Field`/`Method`/`Resource`/`Service`（`z.infer`）四个类型**逐字搬入**。删除 `packages/sdk/src/catalog-types.ts`。`packages/sdk/src/index.ts` 第 5 行 `export type { Field, Method, Resource, Service } from "./catalog-types"` 改为：
  ```ts
  export { FieldSchema, MethodSchema, ResourceSchema, ServiceSchema } from "./catalog";
  export type { Field, Method, Resource, Service } from "./catalog";
  ```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/sdk && npx vitest run test/catalog.test.ts && npm run build`
Expected: PASS + `tsc` 0 error

- [ ] **Step 5: 删除已搬移的 CLI 测试**

Run: `rm packages/cli/test/unit/catalog-schema.test.ts`（该 schema 测试已随 schema 一起迁入 SDK）

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/catalog.ts packages/sdk/src/catalog-types.ts packages/sdk/src/index.ts packages/sdk/test/catalog.test.ts packages/cli/test/unit/catalog-schema.test.ts
git commit -m "refactor(sdk): 收口 catalog zod schema 至 SDK（C1）"
```

---

### Task 2: CLI 改用 SDK catalog schema（C1 — CLI 侧）

**Files:**
- Delete: `packages/cli/src/schema/catalog.ts`
- Modify: `packages/cli/src/engine/script.ts:5`
- Modify: `packages/cli/src/engine/catalog.ts:3`
- Modify: `packages/cli/src/plugin/loader.ts:5`
- Modify: `packages/cli/src/engine/request.ts:2`
- Modify: `packages/cli/src/engine/run.ts:2`
- Modify: `packages/cli/test/unit/request.test.ts:4`
- Modify: `packages/cli/test/unit/run.test.ts:9`
- Modify: `packages/cli/test/unit/script.test.ts:11`

**Interfaces:**
- Consumes: Task 1 的 SDK 导出（`ServiceSchema` 值 + `Service`/`Method`/`Field` 类型）
- Produces: CLI 无 `schema/catalog.ts`；后续 Task 6/8 在 `script.ts`/`loader.ts` 内继续工作

- [ ] **Step 1: 删除并重指 import** —— 删除 `packages/cli/src/schema/catalog.ts`（`schema/` 目录随之清空）。将上述 8 处 `../schema/catalog` / `../../src/schema/catalog` 的 import 改为从 `@saicmotor/sdk` 导入，保持导入符号不变：
  - `script.ts:5` `import type { Service, Method } from "../schema/catalog"` → `from "@saicmotor/sdk"`
  - `catalog.ts:3` `import { ServiceSchema, type Service } from "../schema/catalog"` → `from "@saicmotor/sdk"`
  - `loader.ts:5` `import { ServiceSchema, type Service } from "../schema/catalog"` → `from "@saicmotor/sdk"`
  - `request.ts:2` `import type { Method, Field } from "../schema/catalog"` → `from "@saicmotor/sdk"`
  - `run.ts:2` `import type { Service, Method } from "../schema/catalog"` → `from "@saicmotor/sdk"`
  - 三个测试文件同理，仅改 `from` 目标为 `"@saicmotor/sdk"`

- [ ] **Step 2: 构建 + 全量测试**

Run: `npm run build --workspace=packages/cli && npm run test --workspace=packages/cli`
Expected: `tsc` 0 error + 全部用例 PASS（`catalog-load.test.ts`、`request.test.ts`、`run.test.ts`、`script.test.ts` 等）

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/schema/catalog.ts packages/cli/src/engine/script.ts packages/cli/src/engine/catalog.ts packages/cli/src/plugin/loader.ts packages/cli/src/engine/request.ts packages/cli/src/engine/run.ts packages/cli/test/unit/request.test.ts packages/cli/test/unit/run.test.ts packages/cli/test/unit/script.test.ts
git commit -m "refactor(cli): catalog 类型改从 @saicmotor/sdk 导入（C1）"
```

---

### Task 3: 窄化 SDK Config 并去重脚本上下文（A7 + C1）

**Files:**
- Modify: `packages/sdk/src/config-types.ts`
- Modify: `packages/sdk/src/index.ts:4`
- Modify: `packages/sdk/test/context.test.ts`
- Modify: `packages/sdk/README.md`（`Config, AuthConfig` 行 + `config` 字段说明）
- Modify: `packages/cli/src/engine/script.ts`（删除本地 `ScriptContext`/`ScriptFn`，改从 SDK import）
- Modify: `packages/cli/src/engine/run.ts`（删除本地 `RunResult`，改从 SDK import）

**Interfaces:**
- Consumes: Task 1/2 的 SDK 类型导出
- Produces: SDK `Config = { gateway: string }`（删除 `AuthConfig`）；CLI 不再自带 `ScriptContext`/`ScriptFn`/`RunResult`。Task 5（L6）在 `script.ts` 内继续

- [ ] **Step 1: 写失败测试** —— 修改 `packages/sdk/test/context.test.ts`：把两处 `config` 对象字面量的 `auth: {...}` 字段删掉，只留 `config: { gateway: "https://api.example.com" }`（第 8-22 行与第 50-64 行）。其余断言不变。

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/sdk && npx vitest run test/context.test.ts`
Expected: FAIL（当前 SDK `Config` 仍要求 `auth`，缺 `auth` 编译不通过）

- [ ] **Step 3: 实现 SDK 侧窄化** —— `packages/sdk/src/config-types.ts` 改为：
  ```ts
  /** 插件脚本可见的配置子集——仅暴露 gateway，不透出 CLI 认证内部实现 */
  export interface Config {
    gateway: string;
  }
  ```
  删除 `AuthConfig` 接口。`packages/sdk/src/index.ts:4` 改为 `export type { Config } from "./config-types";`（移除 `AuthConfig`）。`packages/sdk/README.md`：导出类型列表删 `AuthConfig`，`config` 字段说明改为 `当前配置（仅 gateway）`。

- [ ] **Step 4: 运行 SDK 测试确认通过**

Run: `cd packages/sdk && npx vitest run && npm run build`
Expected: PASS + `tsc` 0 error

- [ ] **Step 5: 去重 CLI 侧** ——
  - `packages/cli/src/engine/script.ts`：删除 `ScriptContext` 接口（11-18 行）与 `ScriptFn` 类型（20 行）及 `import type { Config } from "../config"`（3 行，删除后不再被引用）；`import type { RunResult } from "./run"`（6 行）改为从 SDK 导入；新增 `import type { ScriptContext, ScriptFn, RunResult } from "@saicmotor/sdk";`
  - `packages/cli/src/engine/run.ts`：删除 `RunResult` 接口（11-14 行），新增 `import type { RunResult } from "@saicmotor/sdk";`

- [ ] **Step 6: 构建 + CLI 全量测试**

Run: `npm run build --workspace=packages/cli && npm run test --workspace=packages/cli`
Expected: `tsc` 0 error + 全绿（`script.test.ts`/`run.test.ts` 尤其关注：完整 `Config` 仍可赋给窄化后的 `ScriptContext.config`）

- [ ] **Step 7: Commit**

```bash
git add packages/sdk/src/config-types.ts packages/sdk/src/index.ts packages/sdk/test/context.test.ts packages/sdk/README.md packages/cli/src/engine/script.ts packages/cli/src/engine/run.ts
git commit -m "refactor(sdk): 窄化 Config 为 { gateway } 并去重脚本上下文类型（A7/C1）"
```

---

### Task 4: 删除 definePlugin（C7）

**Files:**
- Modify: `packages/sdk/src/manifest.ts`（删 `definePlugin`）
- Modify: `packages/sdk/src/index.ts:1`
- Modify: `packages/sdk/test/manifest.test.ts`
- Modify: `packages/sdk/README.md`

**Interfaces:**
- Consumes: 无新依赖
- Produces: SDK 只保留 `validateManifest`（校验未知输入的形态），`definePlugin` 移除

- [ ] **Step 1: 写失败测试** —— 修改 `packages/sdk/test/manifest.test.ts`：import 移除 `definePlugin`；删除 `definePlugin returns validated manifest` 与 `definePlugin throws on invalid input` 两个用例（34-43 行）。

- [ ] **Step 2: 实现** —— `packages/sdk/src/manifest.ts` 删除 `definePlugin`（28-31 行）；`packages/sdk/src/index.ts:1` 改为 `export { PluginManifestSchema, validateManifest } from "./manifest";`。`packages/sdk/README.md`：删除「导出的工具」列表里的 `definePlugin` 行与「写 manifest」整段（44-58 行），替换为一句说明：manifest 是 JSON 文件（`saicmotor.plugin.json`），无需 TS 构造助手。

- [ ] **Step 3: 运行测试 + 构建**

Run: `cd packages/sdk && npx vitest run && npm run build`
Expected: PASS（`validateManifest` 用例全保留）+ `tsc` 0 error

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/manifest.ts packages/sdk/src/index.ts packages/sdk/test/manifest.test.ts packages/sdk/README.md
git commit -m "refactor(sdk): 删除死 API definePlugin，只留 validateManifest（C7）"
```

---

### Task 5: SaicmotorError 收口至 SDK + 结构判断（L6）

**Files:**
- Create: `packages/sdk/src/error.ts`
- Create: `packages/sdk/test/error.test.ts`
- Modify: `packages/sdk/src/index.ts`（新增导出）
- Delete: `packages/cli/src/engine/errors.ts`
- Modify: `packages/cli/src/cli/error.ts`（结构判断 + 导出 `isSaicmotorError`）
- Modify: 以下 12 个 CLI 源文件的 `SaicmotorError` import 从 `./errors`/`../engine/errors` → `@saicmotor/sdk`：
  `cli/error.ts`、`engine/script.ts`、`auth/session.ts`、`engine/http.ts`、`cli/auth.ts`、`engine/request.ts`、`engine/run.ts`、`auth/loopback.ts`、`engine/output.ts`、`auth/password.ts`、`auth/exchange.ts`、`auth/open.ts`
- Modify: `packages/cli/test/unit/errors.test.ts`（import + 新增结构判断用例）
- Modify: `packages/plugin-leave/scripts/leave/applications/submit.ts`
- Modify: `packages/plugin-attendance/scripts/attendance/corrections/submit.ts`
- Modify: `packages/plugin-leave/package.json`（`@saicmotor/sdk` devDependencies → dependencies）
- Modify: `packages/plugin-attendance/package.json`（同上）

**Interfaces:**
- Consumes: Task 1/2/3 的 SDK 类型导出
- Produces: SDK 导出 `SaicmotorError`/`EXIT_CODES`（值）与 `ErrorCategory`/`UpstreamInfo`（类型）；CLI 导出 `isSaicmotorError(e: unknown): e is SaicmotorError`。插件脚本与后续所有任务依赖此错误类。

- [ ] **Step 1: 写失败测试** —— 新建 `packages/sdk/test/error.test.ts`，内容为（从 `packages/cli/test/unit/errors.test.ts` 的 SaicmotorError 用例搬移，import 改 `../src/error`）：
  ```ts
  import { describe, it, expect } from "vitest";
  import { SaicmotorError } from "../src/error";

  describe("SaicmotorError", () => {
    it("maps each category to its exit code", () => {
      expect(new SaicmotorError("validation", "x").exitCode).toBe(2);
      expect(new SaicmotorError("auth", "x").exitCode).toBe(3);
      expect(new SaicmotorError("network", "x").exitCode).toBe(4);
      expect(new SaicmotorError("upstream", "x").exitCode).toBe(5);
      expect(new SaicmotorError("spec", "x").exitCode).toBe(6);
    });
    it("carries upstream info and hint", () => {
      const e = new SaicmotorError("upstream", "余额不足", { upstream: { code: 1001, message: "leave balance" }, hint: "h" });
      expect(e.upstream?.code).toBe(1001);
      expect(e.hint).toBe("h");
    });
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/sdk && npx vitest run test/error.test.ts`
Expected: FAIL（`../src/error` 不存在）

- [ ] **Step 3: 实现 SDK 错误类** —— 新建 `packages/sdk/src/error.ts`，把 `packages/cli/src/engine/errors.ts` 的 `ErrorCategory`/`EXIT_CODES`/`UpstreamInfo`/`SaicmotorError` **逐字搬入**。`packages/sdk/src/index.ts` 追加：
  ```ts
  export { SaicmotorError, EXIT_CODES } from "./error";
  export type { ErrorCategory, UpstreamInfo } from "./error";
  ```

- [ ] **Step 4: 运行 SDK 测试 + 构建**

Run: `cd packages/sdk && npx vitest run && npm run build`
Expected: PASS + `tsc` 0 error

- [ ] **Step 5: 删除 CLI 本地错误类并重指 import** —— 删除 `packages/cli/src/engine/errors.ts`；把上列 12 个源文件的 `SaicmotorError` import 改为 `from "@saicmotor/sdk"`（`error.ts` 一文件同时做 Step 6 的结构判断改造）。

- [ ] **Step 6: handleError 结构判断** —— `packages/cli/src/cli/error.ts` 改为：
  ```ts
  import { type SaicmotorError } from "@saicmotor/sdk";
  import { formatEnvelope } from "../engine/output";

  /** 结构判断：跨包（插件与 CLI 各有一份 @saicmotor/sdk）时 instanceof 会失灵，认 category + exitCode */
  export function isSaicmotorError(e: unknown): e is SaicmotorError {
    return (
      typeof e === "object" && e !== null &&
      typeof (e as { category?: unknown }).category === "string" &&
      typeof (e as { exitCode?: unknown }).exitCode === "number"
    );
  }

  export function handleError(e: unknown): void {
    if (isSaicmotorError(e)) {
      console.error(formatEnvelope(false, undefined, { type: e.category, message: e.message, hint: e.hint, upstream: e.upstream }));
      process.exit(e.exitCode);
      return;
    }
    console.error(String(e));
    process.exit(1);
  }
  ```

- [ ] **Step 7: CLI 测试** —— `packages/cli/test/unit/errors.test.ts`：删除原 `describe("SaicmotorError")` 整块（4-16 行，类测试已随类迁入 SDK 的 `error.test.ts`），改为只测结构判断：
  ```ts
  import { describe, it, expect } from "vitest";
  import { isSaicmotorError } from "../../src/cli/error";

  describe("isSaicmotorError", () => {
    it("recognizes a structurally-similar error from another SDK copy", () => {
      const alien = { name: "SaicmotorError", message: "x", category: "upstream", exitCode: 5 } as unknown;
      expect(isSaicmotorError(alien)).toBe(true);
    });
    it("rejects a plain Error", () => {
      expect(isSaicmotorError(new Error("boom"))).toBe(false);
    });
    it("rejects an object missing category or exitCode", () => {
      expect(isSaicmotorError({ message: "x", category: "upstream" })).toBe(false);
    });
  });
  ```

- [ ] **Step 8: 运行 CLI 测试 + 构建**

Run: `npm run build --workspace=packages/cli && npm run test --workspace=packages/cli`
Expected: `tsc` 0 error + 全绿

- [ ] **Step 9: 插件脚本改用 SDK 错误类** —— 两个 `submit.ts` 顶部把本地 `class UpstreamError extends Error {...}`（3-11 行）整体删除，import 行改为：
  ```ts
  import { SaicmotorError } from "@saicmotor/sdk";
  import type { ScriptContext, ScriptFn, RunResult } from "@saicmotor/sdk";
  ```
  抛错行（33 行）`throw new UpstreamError("upstream", \`上游 HTTP ${resp.status}\`)` 改为：
  ```ts
  throw new SaicmotorError("upstream", `上游 HTTP ${resp.status}`);
  ```
  （原实现把分类字符串 `"upstream"` 塞进了 `code` 字段；改为正确的 category=upstream + 人类可读 message。）

- [ ] **Step 10: 插件运行时依赖** —— 两个插件 `package.json` 把 `"@saicmotor/sdk": "*"` 从 `devDependencies` 移到 `dependencies`（脚本现在**运行时** `require("@saicmotor/sdk")`，published 安装时 SDK 必须能被插件 `node_modules` 解析）。

- [ ] **Step 11: 全仓构建 + 测试**

Run: `npm run build && npm run test --workspaces`
Expected: 5 包 `tsc` 0 error + 全绿

- [ ] **Step 12: Commit**

```bash
git add packages/sdk/src/error.ts packages/sdk/test/error.test.ts packages/sdk/src/index.ts packages/cli/src/engine/errors.ts packages/cli/src/cli/error.ts packages/cli/src/engine/script.ts packages/cli/src/auth/session.ts packages/cli/src/engine/http.ts packages/cli/src/cli/auth.ts packages/cli/src/engine/request.ts packages/cli/src/engine/run.ts packages/cli/src/auth/loopback.ts packages/cli/src/engine/output.ts packages/cli/src/auth/password.ts packages/cli/src/auth/exchange.ts packages/cli/src/auth/open.ts packages/cli/test/unit/errors.test.ts packages/plugin-leave/scripts/leave/applications/submit.ts packages/plugin-attendance/scripts/attendance/corrections/submit.ts packages/plugin-leave/package.json packages/plugin-attendance/package.json
git commit -m "refactor(sdk): SaicmotorError 收口至 SDK，handleError 改结构判断（L6）"
```

---

### Task 6: findScript 路径围栏（S3 + S4）

**Files:**
- Modify: `packages/cli/src/engine/script.ts`（`findScript` 内加围栏 helper）
- Test: `packages/cli/test/unit/script.test.ts`

**Interfaces:**
- Consumes: Task 2/3/5 的 SDK 类型（`Service`/`Method`/`ScriptContext`/`SaicmotorError`）
- Produces: `findScript` 对 `service/resource/method` 中的 `../` 拒绝逃逸

- [ ] **Step 1: 写失败测试** —— 在 `packages/cli/test/unit/script.test.ts` 的 `script scheduling` describe 内新增：
  ```ts
  it("findScript rejects path traversal (../ escapes scripts base)", () => {
    const dir = path.join(tmp, "attendance", "corrections");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "submit.ts"), "export default async function(){}");
    // 在 base 外写一个同名文件，若围栏失效会被命中
    const outside = path.join(tmp, "..", "evil.ts");
    fs.writeFileSync(outside, "export default async function(){}");
    expect(findScript("..", "evil", "submit")).toBeNull();
  });
  ```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/cli && npx vitest run test/unit/script.test.ts -t "path traversal"`
Expected: FAIL（当前 `path.join("..", "evil", "submit")` 会拼出 `../evil/submit`，命中外逃文件）

- [ ] **Step 3: 实现围栏** —— 在 `packages/cli/src/engine/script.ts` 增加 helper，并在 `findScript` 内对每个 base 目录的候选路径做校验（`rel` 来自 `path.join(serviceName, resourceName, methodName)`）：
  ```ts
  function within(base: string, candidate: string): boolean {
    const rel = path.relative(path.resolve(base), path.resolve(candidate));
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  }
  ```
  对三处拼候选路径的位置（`SAICMOTOR_SCRIPTS` 覆盖、插件 scripts 目录、编译产物/源码树）逐个：先 `const candidate = path.join(base, \`${rel}.js\`)`，仅当 `within(base, candidate)` 为真才继续 `firstExisting`/`existsSync`；否则跳过。`rel` 本身含 `..` 时被 `within` 拦下。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/cli && npx vitest run test/unit/script.test.ts`
Expected: PASS（含原有 6 个用例 + 新增穿越用例）

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/engine/script.ts packages/cli/test/unit/script.test.ts
git commit -m "fix(engine): findScript 增加路径围栏，阻断 ../ 穿越（S3+S4）"
```

---

### Task 7: 插件冲突 warning 点名胜者/败者（L4）

**Files:**
- Modify: `packages/cli/src/plugin/loader.ts:120-129`
- Test: `packages/cli/test/unit/plugin-loader.test.ts`

**Interfaces:**
- Consumes: Task 2/5 的 SDK 类型
- Produces: 冲突 warning 文案含胜者与败者名

- [ ] **Step 1: 写失败测试** —— 在 `plugin-loader.test.ts` 的 `detects service name conflicts between plugins` 用例上加强断言（原用例已断言 warning 含「冲突」，新增断言点名）：
  ```ts
  const conflictWarning = result.warnings.find((w: string) => w.includes("冲突"))!;
  expect(conflictWarning).toContain("@saicmotor/plugin-alpha");   // 胜者（先加载）
  expect(conflictWarning).toContain("@saicmotor/plugin-beta");    // 败者
  expect(conflictWarning).toContain("disable");
  ```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/cli && npx vitest run test/unit/plugin-loader.test.ts -t "conflicts"`
Expected: FAIL（当前文案不含 `disable`）

- [ ] **Step 3: 实现** —— `packages/cli/src/plugin/loader.ts` 冲突分支（120-129 行）warning 文案改为：
  ```ts
  warnings.push(
    `service "${svc.name}" 冲突：${manifest.name} 与 ${existing.manifest.name} 均提供。当前 ${existing.manifest.name} 生效；若要 ${manifest.name} 生效请先 plugin disable ${existing.manifest.name}`,
  );
  ```
  （语义不变：first-wins，`existing` 为先加载的胜者。）

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/cli && npx vitest run test/unit/plugin-loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/plugin/loader.ts packages/cli/test/unit/plugin-loader.test.ts
git commit -m "fix(plugin): 冲突 warning 点名胜者/败者与 disable 指引（L4）"
```

---

### Task 8: 插件 catalog 解析错误并入 warnings（C3）

**Files:**
- Modify: `packages/cli/src/plugin/loader.ts`（`loadPluginServices` 签名 + 内部 + 调用点）
- Test: `packages/cli/test/unit/plugin-loader.test.ts`

**Interfaces:**
- Consumes: Task 2/5/7 的 loader.ts 现状
- Produces: `loadPluginServices(pkgRoot, manifest): { services: Service[]; warnings: string[] }`

- [ ] **Step 1: 写失败测试** —— 在 `plugin-loader.test.ts` 的 `skips bad catalog JSON silently (other services still load)` 用例上加强断言：
  ```ts
  expect(result.warnings.some((w: string) => w.includes("校验失败") || w.includes("解析失败"))).toBe(true);
  ```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd packages/cli && npx vitest run test/unit/plugin-loader.test.ts -t "bad catalog JSON"`
Expected: FAIL（当前坏 JSON 静默丢弃，无 warning）

- [ ] **Step 3: 实现** —— `loadPluginServices` 返回类型改为 `{ services: Service[]; warnings: string[] }`，内部 catch（185-188 行）里 `warnings.push(\`插件 ${manifest.name} catalog 校验失败 (${file}): ${(e as Error).message}\`)`；`loadPlugins` 调用点（121 行）改为 `const { services, warnings: svcWarnings } = loadPluginServices(pkgRoot, manifest); warnings.push(...svcWarnings);`，并删除原注释里的「后续重构时统一传递」TODO。

- [ ] **Step 4: 运行测试确认通过**

Run: `cd packages/cli && npx vitest run test/unit/plugin-loader.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/plugin/loader.ts packages/cli/test/unit/plugin-loader.test.ts
git commit -m "fix(plugin): loadPluginServices 返回 warnings，坏 catalog 不再静默丢弃（C3）"
```

---

### Task 9: 删除 loadPlugins 死参数（A1）

**Files:**
- Modify: `packages/cli/src/plugin/loader.ts:76`（删 `_config` 参数 + 删 `Config` import）
- Modify: `packages/cli/src/plugin/suite.ts:6`
- Modify: `packages/cli/src/cli/plugin-cmds.ts:326`
- Modify: `packages/cli/src/cli/index.ts:22`
- Modify: `packages/cli/src/engine/script.ts:54`
- Test: `packages/cli/test/unit/plugin-loader.test.ts`（`loadPlugins(makeTestConfig())` → `loadPlugins()`，删 `makeTestConfig`）

**Interfaces:**
- Consumes: Task 5/8 的 loader.ts 现状
- Produces: `loadPlugins(): LoadResult`（无参）

- [ ] **Step 1: 实现** —— `loader.ts:76` 改 `export function loadPlugins(): LoadResult {`，删除 `import type { Config } from "../config";`（6 行，删除后不再被引用）。4 个调用点改为无参：
  - `suite.ts:6` `plugins ?? loadPlugins(loadConfig()).plugins` → `plugins ?? loadPlugins().plugins`（`loadConfig` import 若无他处使用一并删）
  - `plugin-cmds.ts:326` `loadPlugins(loadConfig())` → `loadPlugins()`
  - `index.ts:22` `loadPlugins(config)` → `loadPlugins()`
  - `script.ts:54` `loadPlugins(loadConfig())` → `loadPlugins()`（`loadConfig` import 若无他处使用一并删）

- [ ] **Step 2: 更新测试** —— `plugin-loader.test.ts` 中 15 处 `loadPlugins(makeTestConfig())` 全改 `loadPlugins()`，删除 `makeTestConfig` 函数（51-53 行，若不再被引用）。

- [ ] **Step 3: 构建 + 全量测试**

Run: `npm run build --workspace=packages/cli && npm run test --workspace=packages/cli`
Expected: `tsc` 0 error + 全绿

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/plugin/loader.ts packages/cli/src/plugin/suite.ts packages/cli/src/cli/plugin-cmds.ts packages/cli/src/cli/index.ts packages/cli/src/engine/script.ts packages/cli/test/unit/plugin-loader.test.ts
git commit -m "refactor(plugin): 删除 loadPlugins 死参数 _config（A1）"
```

---

### Task 10: 登录提示去掉 token 片段（S5）

**Files:**
- Modify: `packages/cli/src/cli/auth.ts:25`

**Interfaces:**
- Consumes: Task 5 的 `SaicmotorError`
- Produces: 登录成功提示不含 token 内容

- [ ] **Step 1: 实现** —— `auth.ts:25` `console.log(\`已登录，token 已缓存（${token.slice(0, 8)}…）\`)` 改为 `console.log("已登录，token 已缓存");`。

- [ ] **Step 2: 构建 + 测试**

Run: `npm run build --workspace=packages/cli && npm run test --workspace=packages/cli`
Expected: `tsc` 0 error + 全绿（`auth-login.test.ts` 若断言了旧文案，同步改断言为 `已登录，token 已缓存`）

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/cli/auth.ts packages/cli/test/unit/auth-login.test.ts
git commit -m "fix(cli): 登录提示去除 token 片段（S5）"
```

---

### Task 11: 补 9 处空 catch 注释（C5）

**Files:**
- Modify: `packages/cli/src/config.ts:27`
- Modify: `packages/cli/src/plugin/state.ts:23`
- Modify: `packages/cli/src/plugin/registrar.ts:140`
- Modify: `packages/cli/src/plugin/loader.ts:21,35,65,178`
- Modify: `packages/cli/src/cli/plugin-cmds.ts:139`
- Modify: `packages/cli/src/engine/catalog.ts:11`

**Interfaces:**
- Consumes: 无类型变更，纯注释
- Produces: 每处 catch 附带「为何吞掉是安全/有意」的一句话

- [ ] **Step 1: 实现** —— 给下列 9 处 `catch` 各补一句注释（不改任何逻辑）。行号是编写计划时的快照，前面 Task 2/7/8/9 可能已让行号漂移，**以「描述」为准定位 catch**（如 loader.ts 里 `scanEntries` 的根目录 readdir catch）：

| 位置 | 注释内容（要点） |
|------|-----------------|
| `config.ts:27` | 包内 `saicmotor.config.json` 缺失/损坏时回退空配置，不阻断启动 |
| `state.ts:23` | state.json 缺失/损坏时回退空插件表，是**有意降级**——文件损坏不阻断 CLI 启动（代价是已装插件列表看似清空，属可接受） |
| `registrar.ts:140` | 客户端 skills 目录读取失败跳过该客户端，不阻断卸载 |
| `loader.ts:21` | 插件根目录不存在/不可读时返回空候选，不阻断扫描 |
| `loader.ts:35` | scoped 目录读取失败跳过该 scope，不阻断扫描 |
| `loader.ts:65` | package.json 读取失败回退版本 "0.0.0"，engine 校验自会兜底 |
| `loader.ts:178` | catalog/services 目录读取失败跳过，不阻断其他插件 |
| `plugin-cmds.ts:139` | npm 卸载失败不阻断 state 清理，结果附 error 字段提示手动卸载 |
| `catalog.ts:11` | 核心 catalog 目录读取失败回退空列表 + 空 warning，不阻断启动 |

- [ ] **Step 2: 构建（纯注释，无需跑测试，但需编译通过）**

Run: `npm run build --workspace=packages/cli`
Expected: `tsc` 0 error

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/config.ts packages/cli/src/plugin/state.ts packages/cli/src/plugin/registrar.ts packages/cli/src/plugin/loader.ts packages/cli/src/cli/plugin-cmds.ts packages/cli/src/engine/catalog.ts
git commit -m "docs(plugin): 补 9 处空 catch 的降级语义注释（C5）"
```

---

## 收尾

全部 11 个任务完成后：

- [ ] 运行 `npm run build && npm run test --workspaces`，确认 5 包 0 error、全绿。
- [ ] 运行 `npm run clean --workspaces --if-present && npm run build` 一次干净构建，确认无残留旧产物（尤其 `packages/cli/dist/engine/errors.js`、`packages/cli/dist/schema/`、`packages/sdk/dist/catalog-types.*` 应已消失）。
- [ ] 更新 `docs/sprint/sprint-1-8/sprint-8-code-quality-review-2.0.md` 第七章总览：把 10 项（S3+S4/L4/L6/C3/A1/S5/C5 与 C1/C7/A7）状态从「待排期」改为「✅ 已完成（Sprint 9）」。
- [ ] 更新 `docs/sprint/总览.md` 的 Sprint 9 行状态。
