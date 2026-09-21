# Sprint 3 Scripts 调度机制 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现三层架构中缺失的 scripts 层调度机制——引擎执行 method 前检测同名脚本，存在则走脚本，否则 HTTP 回放。

**Architecture:** 不改 catalog schema，用路径约定 `scripts/{系统}/{资源}/{方法}.ts` 覆盖同名 method。新增 `engine/script.ts` 负责「检测脚本 + 动态加载 + 执行」。`run.ts` 在 `coerceFields` 之后、`ensureToken` 之前插一个脚本检测分支。

**Tech Stack:** TypeScript (CommonJS), Node.js, vitest, zod（无新依赖）。

**Spec:** `docs/superpowers/specs/2026-09-21-sprint-3-script-scheduling-design.md`

## Global Constraints

- 引擎不可变：加新系统只改 catalog JSON 或写 script，不动引擎代码
- catalog 永不写逻辑（无 if/else、循环、数据转换）
- 脚本路径约定：`scripts/{serviceName}/{resourceName}/{methodName}.ts`
- 脚本「有则走脚本，无则 HTTP 回放」，行为不改变现有 HTTP 路径
- 脚本值已由 `coerceFields` 处理，脚本不得重复做参数解析/类型转换
- 遵循现有代码风格：`import type` 用于类型，中文注释，单文件单一职责
- `scriptsDir()` 需支持 `SAICMOTOR_SCRIPTS` 环境变量覆盖（对齐现有 `SAICMOTOR_CATALOG` 模式，测试需要隔离目录）

---

### Task 0: 修复审核发现的 catalog / 文档瑕疵

**Files:**
- Modify: `saicmotor-cli/catalog/services/attendance.json`（补 `early_days` 字段）
- Modify: `saicmotor-cli/doc/ARCHITECTURE.md`（skills 从 🟡 改 🟢）

审核报告发现两处小瑕疵：`records.query` 的 `responseBody` 漏了 `early_days`（SKILL.md 和 mock 都返回了，catalog 没声明）；skills 已经提前做好但 ARCHITECTURE.md 仍标黄。

- [ ] **Step 1: 补 catalog 的 early_days 字段**

`attendance.json` 的 `records.query.responseBody` 改为：

```json
"responseBody": {
  "work_days": { "type": "integer", "example": 22 },
  "late_days": { "type": "integer", "example": 1 },
  "early_days": { "type": "integer", "example": 0 }
}
```

- [ ] **Step 2: ARCHITECTURE.md 里 skills 标记 🟡 → 🟢**

第 5 节目录结构、第 4.1 节目录层级里 `skills/` 及四个 SKILL.md 的 🟡 改为 🟢，注释「Sprint 3/4」改为「已完成」。

- [ ] **Step 3: 跑全部测试确认 catalog 仍通过校验**

Run: `cd saicmotor-cli && npx vitest run`
Expected: PASS（`catalog-load.test.ts` / `catalog-schema.test.ts` 不受影响）。

- [ ] **Step 4: Commit**

```bash
git add saicmotor-cli/catalog/services/attendance.json saicmotor-cli/doc/ARCHITECTURE.md
git commit -m "fix(catalog): add missing early_days field; mark skills as done"
```

---

### Task 1: 脚本调度核心模块 + 环境变量覆盖

**Files:**
- Modify: `saicmotor-cli/src/config.ts:53-55`（`scriptsDir()` 加 env 覆盖）
- Create: `saicmotor-cli/src/engine/script.ts`

**Interfaces:**
- Consumes: `Config`（`../config`）、`Service`/`Method`（`../schema/catalog`）、`RunResult`（`./run`，type-only）、`SaicmotorError`（`./errors`）、`scriptsDir`（`../config`）
- Produces:
  - `interface ScriptContext { config; service; method; values; dryRun; ensureToken }`
  - `type ScriptFn = (ctx: ScriptContext) => Promise<RunResult>`
  - `scriptFileFor(serviceName, resourceName, methodName): string`
  - `findScript(serviceName, resourceName, methodName): string | null`
  - `executeScript(file, ctx): Promise<RunResult>`

- [ ] **Step 1: 写 `scriptsDir()` 覆盖测试（先行失败）**

在现有 `test/unit/config.test.ts` 里 `describe("config")` 下追加一个测试：

```typescript
import { loadConfig, saicmotorDir, scriptsDir } from "../../src/config";
// 顶部 import 行补 scriptsDir

it("scriptsDir respects SAICMOTOR_SCRIPTS env override", () => {
  process.env.SAICMOTOR_SCRIPTS = "/tmp/scripts";
  expect(scriptsDir()).toBe("/tmp/scripts");
});
```

`afterEach` 里补一行 `delete process.env.SAICMOTOR_SCRIPTS;`（已有 `afterEach` 里加）。

- [ ] **Step 2: 运行确认失败**

Run: `cd saicmotor-cli && npx vitest run test/unit/config.test.ts`
Expected: FAIL — `scriptsDir is not exported`（`scriptFileFor` 尚未存在，`scriptsDir` 无 env 覆盖）。这一步主要验证测试写法正确，若 `scriptsDir` 已存在则测试因 env 未生效而失败。

- [ ] **Step 3: 修改 config.ts 让 env 覆盖生效**

```typescript
export function scriptsDir(): string {
  return process.env.SAICMOTOR_SCRIPTS ?? path.join(__dirname, "..", "scripts");
}
```

- [ ] **Step 4: 创建 engine/script.ts**

```typescript
import fs from "node:fs";
import path from "node:path";
import type { Config } from "../config";
import { scriptsDir } from "../config";
import type { Service, Method } from "../schema/catalog";
import type { RunResult } from "./run";
import { SaicmotorError } from "./errors";

export interface ScriptContext {
  config: Config;
  service: Service;
  method: Method;
  /** coerceFields 已处理过的参数值，脚本不重复解析 */
  values: Record<string, unknown>;
  dryRun: boolean;
  /** 脚本内如需调用其他 API，可自行获取 token */
  ensureToken: () => Promise<string>;
}

export type ScriptFn = (ctx: ScriptContext) => Promise<RunResult>;

export function scriptFileFor(serviceName: string, resourceName: string, methodName: string): string {
  return path.join(scriptsDir(), serviceName, resourceName, `${methodName}.ts`);
}

export function findScript(serviceName: string, resourceName: string, methodName: string): string | null {
  const file = scriptFileFor(serviceName, resourceName, methodName);
  return fs.existsSync(file) ? file : null;
}

export async function executeScript(file: string, ctx: ScriptContext): Promise<RunResult> {
  const mod: unknown = await import(file);
  const fn: unknown = (mod as { default?: unknown }).default ?? mod;
  if (typeof fn !== "function") {
    throw new SaicmotorError("spec", `脚本未默认导出函数: ${file}`);
  }
  return (fn as ScriptFn)(ctx);
}
```

- [ ] **Step 5: 运行 config + script 相关测试通过**

Run: `cd saicmotor-cli && npx vitest run test/unit/config.test.ts`
Expected: PASS（config 全部测试通过）。

- [ ] **Step 6: Commit**

```bash
git add saicmotor-cli/src/config.ts saicmotor-cli/src/engine/script.ts saicmotor-cli/test/unit/config.test.ts
git commit -m "feat(engine): add script dispatch module + scriptsDir env override"
```

---

### Task 2: run.ts 脚本检测分支 + 签名变更

**Files:**
- Modify: `saicmotor-cli/src/engine/run.ts`（`runMethod` 加 `resourceName`/`methodName` 参数，`coerceFields` 后加脚本检测）

**Interfaces:**
- Consumes: `findScript`/`executeScript`（`./script`）、`ensureToken`（`../auth/session`）
- Produces: 新签名 `runMethod(config, service, resourceName, methodName, method, raw, opts)`

关键行为变更：脚本检测在 `coerceFields` 之后、`ensureToken` 之前。脚本内部通过 `ctx.ensureToken` 自己拿 token；无脚本时走原有 dryRun / HTTP 逻辑，行为不变。

- [ ] **Step 1: 修改 run.ts**

`runMethod` 签名与开头改为：

```typescript
import { findScript, executeScript } from "./script";

export async function runMethod(
  config: Config,
  service: Service,
  resourceName: string,
  methodName: string,
  method: Method,
  raw: Record<string, string | undefined>,
  opts: { dryRun?: boolean } = {},
): Promise<RunResult> {
  const values = coerceFields(method.requestBody ?? {}, raw);

  // 脚本覆盖：检测到同名脚本 → 走脚本（脚本内部自行处理 dryRun 与 token）
  const scriptFile = findScript(service.name, resourceName, methodName);
  if (scriptFile) {
    return executeScript(scriptFile, {
      config,
      service,
      method,
      values,
      dryRun: !!opts.dryRun,
      ensureToken: () => ensureToken(config),
    });
  }

  if (opts.dryRun) {
    return {
      ok: true,
      data: {
        dryRun: true,
        request: { method: method.httpMethod, url: buildUrl(config, service.servicePath, method), body: buildBody(method, values) },
      },
    };
  }
  let token = await ensureToken(config);
  let resp = await execute(config, service.servicePath, method, token, values);
  if (resp.status === 401) {
    clearToken();
    token = await ensureToken(config, { force: true });
    resp = await execute(config, service.servicePath, method, token, values);
  }
  checkEnvelope(resp);
  return { ok: true, data: (resp.body as Record<string, unknown> | undefined)?.data };
}
```

（`execute`、`checkEnvelope` 两个私有函数保持不变。）

- [ ] **Step 2: 修改 cli/index.ts 传参**

`src/cli/index.ts` 中 `action` 回调里那行改为：

```typescript
const result = await runMethod(config, service, resourceName, methodName, method, raw, { dryRun: !!opts.dryRun });
```

`resourceName` 和 `methodName` 已是外层 `Object.entries` 循环的键，直接可用。

- [ ] **Step 3: 更新既有调用点（编译期强制）**

下列文件里所有 `runMethod(...)` 调用，在 `service` 之后插入 `resourceName`/`methodName` 两个字符串参数：

`test/unit/run.test.ts`（`service` 定义在文件顶部，`resources.balance.methods.query`）：

```typescript
await runMethod(config, service, "balance", "query", method, {});
await runMethod(config, service, "balance", "query", method, {}, { dryRun: true });
// 其余三处同理，resourceName="balance", methodName="query"
```

`test/integration/leave-gateway.test.ts`：

```typescript
await runMethod(config, service, "balance", "query", balanceMethod, {});
await runMethod(config, service, "applications", "submit", submitMethod, { start_date: "...", end_date: "...", reason: "年假" });
// 以及该文件其余 runMethod 调用按对应 resource/method 补参数
```

`test/integration/attendance-gateway.test.ts`：

```typescript
await runMethod(config, service, "records", "query", recordsMethod, {});
await runMethod(config, service, "corrections", "submit", submitMethod, { date: "...", reason: "..." });
// 其余同理
```

- [ ] **Step 4: 运行全部测试确认无回归**

Run: `cd saicmotor-cli && npx vitest run`
Expected: PASS — 既有 50 个测试全部通过（签名变更后 HTTP 路径行为不变）。

- [ ] **Step 5: Commit**

```bash
git add saicmotor-cli/src/engine/run.ts saicmotor-cli/src/cli/index.ts saicmotor-cli/test/unit/run.test.ts saicmotor-cli/test/integration/leave-gateway.test.ts saicmotor-cli/test/integration/attendance-gateway.test.ts
git commit -m "feat(engine): route method through script when one exists"
```

---

### Task 3: 验证脚本 scripts/attendance/corrections/submit.ts

**Files:**
- Create: `saicmotor-cli/scripts/attendance/corrections/submit.ts`

**Interfaces:**
- Consumes: `ScriptContext`（`../../../src/engine/script`）、`buildUrl`/`buildBody`（`../../../src/engine/request`）、`applyAuth`（`../../../src/auth/transport`）、`send`（`../../../src/engine/http`）、`SaicmotorError`（`../../../src/engine/errors`）

验证脚本证明调度机制生效：先打一行日志证明被调用，然后复用引擎原语走 HTTP 提交。dryRun 时返回预览。

- [ ] **Step 1: 写验证脚本**

```typescript
import type { ScriptContext } from "../../../src/engine/script";
import { buildUrl, buildBody } from "../../../src/engine/request";
import { applyAuth } from "../../../src/auth/transport";
import { send } from "../../../src/engine/http";
import { SaicmotorError } from "../../../src/engine/errors";

export default async function submit(ctx: ScriptContext) {
  console.error("[script] 补卡申请前校验通过");

  if (ctx.dryRun) {
    return { ok: true as const, data: { dryRun: true, note: "script: preview" } };
  }

  const token = await ctx.ensureToken();
  const url = buildUrl(ctx.config, ctx.service.servicePath, ctx.method);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  applyAuth(headers, ctx.config, token);
  const resp = await send({
    method: ctx.method.httpMethod,
    url,
    headers,
    body: buildBody(ctx.method, ctx.values),
  });
  if (resp.status >= 400) {
    throw new SaicmotorError("upstream", `上游 HTTP ${resp.status}`);
  }
  return { ok: true as const, data: (resp.body as Record<string, unknown> | undefined)?.data };
}
```

- [ ] **Step 2: 提交脚本**

```bash
git add saicmotor-cli/scripts/attendance/corrections/submit.ts
git commit -m "feat(scripts): verification script for attendance corrections submit"
```

---

### Task 4: engine/script.ts 单元测试 + runMethod 调度集成测试

**Files:**
- Create: `saicmotor-cli/test/unit/script.test.ts`

**Interfaces:**
- Consumes: `findScript`/`scriptFileFor`/`executeScript`/`ScriptContext`（`../../src/engine/script`）、`runMethod`（`../../src/engine/run`）、`loadConfig`（`../../src/config`）、`writeCredentials`（`../../src/auth/store`）、`startServer`/`MockServer`（`../helpers/server`）、`Service`（`../../src/schema/catalog`）

测试覆盖：路径生成、脚本检测、脚本执行、runMethod 走脚本不走 HTTP、无脚本回退 HTTP、dryRun 传参、ctx.ensureToken 可用。

- [ ] **Step 1: 写测试文件**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findScript, scriptFileFor, executeScript, type ScriptFn } from "../../src/engine/script";
import { runMethod } from "../../src/engine/run";
import { loadConfig } from "../../src/config";
import { writeCredentials } from "../../src/auth/store";
import { startServer, MockServer } from "../helpers/server";
import type { Service } from "../../src/schema/catalog";

const service: Service = {
  name: "attendance",
  servicePath: "/attendance",
  resources: {
    corrections: {
      methods: {
        submit: {
          id: "corrections.submit",
          path: "/corrections",
          httpMethod: "POST",
          requestBody: { date: { type: "string", required: true }, reason: { type: "string", required: true } },
        },
      },
    },
  },
};

describe("script scheduling", () => {
  let tmp: string;
  let server: MockServer | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-scripts-"));
    process.env.SAICMOTOR_HOME = tmp;
    process.env.SAICMOTOR_SCRIPTS = tmp;
    writeCredentials({ username: "zhangsan", password: "123456" });
  });

  afterEach(async () => {
    delete process.env.SAICMOTOR_HOME;
    delete process.env.SAICMOTOR_SCRIPTS;
    fs.rmSync(tmp, { recursive: true, force: true });
    await server?.close();
  });

  it("scriptFileFor builds system/resource/method path", () => {
    expect(scriptFileFor("attendance", "corrections", "submit")).toBe(path.join(tmp, "attendance", "corrections", "submit.ts"));
  });

  it("findScript returns path when file exists, null otherwise", () => {
    const dir = path.join(tmp, "attendance", "corrections");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "submit.ts"), "export default async function(){}");
    expect(findScript("attendance", "corrections", "submit")).toBe(path.join(dir, "submit.ts"));
    expect(findScript("attendance", "corrections", "nope")).toBeNull();
  });

  it("runMethod dispatches to script and skips HTTP", async () => {
    const dir = path.join(tmp, "attendance", "corrections");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "submit.ts"),
      'export default async function (ctx) { return { ok: true, data: { from: "script", values: ctx.values } }; }',
    );

    // 网关指向不可达地址——若走 HTTP 会失败
    const config = { ...loadConfig(), gateway: "http://127.0.0.1:1" };
    const method = service.resources.corrections.methods.submit;
    const result = await runMethod(config, service, "corrections", "submit", method, { date: "2026-09-21", reason: "忘记打卡" });

    expect((result.data as any).from).toBe("script");
    expect((result.data as any).values).toEqual({ date: "2026-09-21", reason: "忘记打卡" });
  });

  it("falls back to HTTP when no script", async () => {
    server = await startServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/auth/login") return res.end(JSON.stringify({ code: 0, data: { token: "tok" } }));
      res.end(JSON.stringify({ code: 0, data: { ok: true } }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    const method = service.resources.corrections.methods.submit;
    const result = await runMethod(config, service, "corrections", "submit", method, { date: "2026-09-21", reason: "x" });
    expect(result.data).toEqual({ ok: true });
  });

  it("passes dryRun true and ensureToken into script context", async () => {
    const dir = path.join(tmp, "attendance", "corrections");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "submit.ts"),
      'export default async function (ctx) { const t = await ctx.ensureToken(); return { ok: true, data: { dryRun: ctx.dryRun, token: typeof t } }; }',
    );

    server = await startServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, data: { token: "tok-abc" } }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    const method = service.resources.corrections.methods.submit;
    const result = await runMethod(config, service, "corrections", "submit", method, { date: "2026-09-21", reason: "x" }, { dryRun: true });

    expect((result.data as any).dryRun).toBe(true);
    expect((result.data as any).token).toBe("string");
  });
});
```

- [ ] **Step 2: 运行确认失败（TDD：先失败再补实现）**

Run: `cd saicmotor-cli && npx vitest run test/unit/script.test.ts`
Expected: 若 Task 1/2 已完成则大部分通过；此步目的是暴露任何契约不一致（例如 `executeScript` 导入 `.ts` 在 vitest 下是否正常）。若动态 `import()` 临时 `.ts` 在 vitest 下报错，改用 `.mjs` 后缀 + 纯 ESM 内容，并同步修正 `scriptFileFor` 的后缀逻辑。

- [ ] **Step 3: 运行全部测试**

Run: `cd saicmotor-cli && npx vitest run`
Expected: PASS — 总计 55 个测试（原 50 + config 1 + script 4）。

- [ ] **Step 4: Commit**

```bash
git add saicmotor-cli/test/unit/script.test.ts
git commit -m "test(engine): script scheduling dispatch + fallback coverage"
```

---

### Task 5: 文档同步

**Files:**
- Modify: `saicmotor-cli/doc/ARCHITECTURE.md`
- Modify: `docs/sprint/sprint-3-catalog-script-skill.md`
- Modify: `docs/sprint/总览.md`

- [ ] **Step 1: 更新 ARCHITECTURE.md 状态标记**

- 第 5 节目录结构中 `scripts/` 从 🟡 改 🟢，注释改为「已实现：脚本覆盖 HTTP」。
- 第 6 节 run.ts 编排流程图里，在 `coerceFields` 后补一个菱形「有脚本？→ 走脚本」分支。
- 第 3 节「关键规则」表补一行：`脚本覆盖 | scripts/{系统}/{资源}/{方法}.ts 存在 → 走脚本，否则 HTTP 回放`。

- [ ] **Step 2: 更新 sprint-3 文档**

把「待办项：等待后续规划」改为「已完成：scripts 调度机制 + 验证脚本 + 单测」。

- [ ] **Step 3: 更新总览**

`sprint-3-catalog-script-skill.md` 状态从 ⬜ 待排期改为 ✅ 完成。

- [ ] **Step 4: Commit**

```bash
git add saicmotor-cli/doc/ARCHITECTURE.md docs/sprint/sprint-3-catalog-script-skill.md docs/sprint/总览.md
git commit -m "docs: mark Sprint 3 script scheduling as done"
```

---

## 已知局限（不在本计划范围）

- 生产构建 `tsc` 只编译 `src/`，`scripts/*.ts` 不进入 `dist/`。当前 dev（tsx）与测试（vitest）可直接 `import()` 动态加载 `.ts`；生产 `node dist/cli/index.js` 下脚本加载方式需在后续 sprint 单独规划（例如脚本编译出 bundle，或运行时用 esbuild 转译）。
- 脚本错误处理为最小实现：仅校验「默认导出是函数」，脚本内部抛错会向上冒泡为 `spec`/`upstream` 错误，不做更细的归一。