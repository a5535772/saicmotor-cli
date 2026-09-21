# leo-cli POC 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 leo-cli 的最小可用版本——用声明式 `skill.json` 驱动，把无源码的「请假系统」通过回放 HTTP 请求包装成 CLI 命令（`leo leave submit` / `leo leave list`），账号密码登录拿 cookie，端到端跑通「spec → 会话 → 参数注入 → 回放 → 输出」。

**Architecture:** 引擎不可变（npm 包）+ spec 可重生成（`~/.leo/skills/<system>/skill.json`）+ skill 方向盘（自动生成 `skill.md`）。核心是一条确定性执行链：`loadSkill` → `ensureSession`（密码登录拿 cookie）→ `buildRequest`（参数注入）→ `send`（回放）→ `checkSuccess`（按 responseContract）→ `output`。技术栈 Node + TypeScript（CommonJS）+ commander + zod + vitest；HTTP 用内置 `fetch`。

**Tech Stack:** Node ≥ 20，TypeScript 5，commander，zod，vitest，内置 `node:http` 做测试 mock。

**POC 具体化说明（相对 spec 的两处对齐）：**
1. `enum` 参数的 `values` 用 **map**（`{显示: 值}`，如 `{"事假":"1"}`），不用 spec 示例里的对象数组。
2. spec 里的 `csrf` / `pagination` / `raw` / SSO / csv·ndjson 本次**不实现**，只保留 schema 位，代码不写。

---

## 文件结构

> 所有相对路径都以新建的项目根 `leo-cli/`（`D:\work\things\2026.09.17.custom-cli\leo-cli\`，与 `feishu-cli/` 同级）为基准；本计划的 `git init` 也在该目录执行。

```
leo-cli/
  package.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  examples/leave/skill.json        # 用户拷到 ~/.leo/skills/leave/ 的样例
  src/
    schema/skill.ts                # zod schema + 全部类型
    engine/errors.ts               # LeoError 分类 + 退出码
    engine/config.ts               # 路径解析 + toKebab/toCamel 工具
    engine/template.ts             # {{变量}} 插值 + 参数强转
    engine/extract.ts              # 点路径取值 getByPath
    engine/spec.ts                 # loadSkill：读文件 + zod 校验
    engine/http.ts                 # send()：fetch 回放 + 网络错误
    engine/request.ts              # buildRequest：参数注入 → 具体请求
    engine/session.ts              # ensureSession：登录 + cookie 缓存 + 401 重登
    engine/run.ts                  # runCommand 编排 + checkSuccess
    engine/output.ts               # json/table 格式化 + 统一信封
    gen/md.ts                      # skill.md 生成器
    auth/store.ts                  # 凭证读写（明文字符串，mode 0600）
    cli/index.ts                   # commander 动态命令 + auth/skill 子命令
  test/
    helpers/server.ts              # 本地 node:http mock server
    unit/*.test.ts
    integration/leave.test.ts
```

运行期配置（用户机器）：
```
~/.leo/                               # 或 $LEO_HOME 覆盖
  skills/leave/skill.json
  skills/leave/skill.md
  credentials/leave.json              # mode 0600
  sessions/leave.json                 # 登录 cookie 缓存，mode 0600
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/engine/errors.ts`（空，下一步填）——不，先只建骨架与空目录

- [ ] **Step 1: 初始化 package.json**

```json
{
  "name": "leo-cli",
  "version": "0.1.0",
  "description": "把无源码业务网页系统包装成 CLI 的通用平台（POC）",
  "type": "commonjs",
  "bin": { "leo": "dist/cli/index.js" },
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

- [ ] **Step 2: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["test/**/*.test.ts"] },
});
```

- [ ] **Step 4: .gitignore**

```
node_modules/
dist/
.leo/
```

- [ ] **Step 5: 安装依赖并验证**

Run: `npm install`
Expected: 无错误，`node_modules/` 生成。

- [ ] **Step 6: Commit**

```bash
git init
git add package.json tsconfig.json vitest.config.ts .gitignore package-lock.json
git commit -m "chore: scaffold leo-cli TypeScript project"
```

---

## Task 2: 错误分类（engine/errors.ts）

**Files:**
- Create: `src/engine/errors.ts`
- Test: `test/unit/errors.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { LeoError } from "../../src/engine/errors";

describe("LeoError", () => {
  it("maps each category to its exit code", () => {
    expect(new LeoError("validation", "x").exitCode).toBe(2);
    expect(new LeoError("auth", "x").exitCode).toBe(3);
    expect(new LeoError("network", "x").exitCode).toBe(4);
    expect(new LeoError("upstream", "x").exitCode).toBe(5);
    expect(new LeoError("spec", "x").exitCode).toBe(6);
  });
  it("carries upstream info and hint", () => {
    const e = new LeoError("upstream", "余额不足", { upstream: { code: 1001, message: "leave balance" }, hint: "h" });
    expect(e.upstream?.code).toBe(1001);
    expect(e.hint).toBe("h");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/errors.test.ts`
Expected: FAIL（找不到模块 `../../src/engine/errors`）

- [ ] **Step 3: 最小实现**

```ts
export type ErrorCategory = "validation" | "auth" | "network" | "upstream" | "spec";

export const EXIT_CODES: Record<ErrorCategory, number> = {
  validation: 2,
  auth: 3,
  network: 4,
  upstream: 5,
  spec: 6,
};

export interface UpstreamInfo {
  code?: unknown;
  message?: string;
}

export class LeoError extends Error {
  readonly category: ErrorCategory;
  readonly hint?: string;
  readonly upstream?: UpstreamInfo;

  constructor(category: ErrorCategory, message: string, opts: { hint?: string; upstream?: UpstreamInfo } = {}) {
    super(message);
    this.name = "LeoError";
    this.category = category;
    this.hint = opts.hint;
    this.upstream = opts.upstream;
  }

  get exitCode(): number {
    return EXIT_CODES[this.category];
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/errors.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/errors.ts test/unit/errors.test.ts
git commit -m "feat: add error classification and exit codes"
```

---

## Task 3: skill schema 与类型（schema/skill.ts）

**Files:**
- Create: `src/schema/skill.ts`
- Test: `test/unit/schema.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { SkillSchema } from "../../src/schema/skill";

const valid = {
  name: "leave",
  baseUrl: "http://127.0.0.1:8080",
  auth: { type: "password", loginRequest: "login", sessionFrom: "cookie", sessionKey: "JSESSIONID" },
  requests: {
    login: { method: "POST", path: "/api/login", body: "username={{username}}&password={{password}}" },
  },
  commands: [{ name: "list", request: "login", effect: "read", params: [] }],
};

describe("SkillSchema", () => {
  it("accepts a valid skill", () => {
    expect(SkillSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects missing baseUrl", () => {
    const { baseUrl, ...rest } = valid;
    const r = SkillSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });
  it("parses enum values as a display->value map", () => {
    const parsed = SkillSchema.parse({
      ...valid,
      commands: [{ name: "submit", request: "login", effect: "write", params: [
        { name: "typeCode", type: "enum", values: { "事假": "1", "病假": "2" }, default: "事假" },
      ] }],
    });
    expect(parsed.commands[0].params[0].values).toEqual({ "事假": "1", "病假": "2" });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/schema.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import { z } from "zod";

export const ParamSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "date", "enum", "bool"]),
  required: z.boolean().optional(),
  values: z.record(z.string(), z.string()).optional(),
  default: z.union([z.string(), z.number()]).optional(),
});

export const RequestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  path: z.string(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.union([z.string(), z.record(z.string(), z.any())]).optional(),
});

export const AuthSchema = z.object({
  type: z.literal("password"),
  loginRequest: z.string(),
  sessionFrom: z.enum(["cookie", "header"]),
  sessionKey: z.string(),
  prompt: z.object({ username: z.string().optional(), password: z.string().optional() }).optional(),
});

export const CommandSchema = z.object({
  name: z.string(),
  verb: z.string().optional(),
  request: z.string(),
  effect: z.enum(["read", "write"]).default("read"),
  params: z.array(ParamSchema).default([]),
});

export const ResponseContractSchema = z.object({
  success: z.object({
    http: z.array(z.number()).optional(),
    path: z.string().optional(),
    equals: z.unknown().optional(),
  }).optional(),
  errorMessagePath: z.string().optional(),
}).optional();

export const SkillSchema = z.object({
  name: z.string(),
  displayName: z.string().optional(),
  version: z.string().optional(),
  baseUrl: z.string(),
  auth: AuthSchema,
  requests: z.record(z.string(), RequestSchema),
  responseContract: ResponseContractSchema,
  commands: z.array(CommandSchema),
});

export type ParamSpec = z.infer<typeof ParamSchema>;
export type RequestSpec = z.infer<typeof RequestSchema>;
export type AuthSpec = z.infer<typeof AuthSchema>;
export type CommandSpec = z.infer<typeof CommandSchema>;
export type Skill = z.infer<typeof SkillSchema>;
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/schema/skill.ts test/unit/schema.test.ts
git commit -m "feat: add skill.json schema and types"
```

---

## Task 4: 参数插值与强转（engine/template.ts）

**Files:**
- Create: `src/engine/template.ts`
- Test: `test/unit/template.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { interpolate, interpolateValue, coerceParam, coerceValues } from "../../src/engine/template";
import type { ParamSpec } from "../../src/schema/skill";

describe("interpolate", () => {
  it("replaces tokens", () => {
    expect(interpolate("a={{x}}&b={{y}}", { x: "1", y: "2" })).toBe("a=1&b=2");
  });
  it("throws on missing value", () => {
    expect(() => interpolate("a={{x}}", {})).toThrow(/x/);
  });
});

describe("interpolateValue", () => {
  it("recurses into objects", () => {
    expect(interpolateValue({ a: "{{x}}", b: { c: "{{y}}" } }, { x: "1", y: "2" }))
      .toEqual({ a: "1", b: { c: "2" } });
  });
});

describe("coerceParam", () => {
  it("maps enum display to value", () => {
    const spec: ParamSpec = { name: "t", type: "enum", values: { "事假": "1" } };
    expect(coerceParam(spec, "事假")).toBe("1");
  });
  it("coerces number", () => {
    expect(coerceParam({ name: "n", type: "number" }, "3")).toBe(3);
  });
  it("validates date format", () => {
    expect(() => coerceParam({ name: "d", type: "date" }, "09-20")).toThrow();
  });
  it("throws on missing required", () => {
    expect(() => coerceParam({ name: "d", type: "date", required: true }, undefined)).toThrow(/必填/);
  });
  it("applies default when missing", () => {
    expect(coerceParam({ name: "t", type: "string", default: "hi" }, undefined)).toBe("hi");
  });
});

describe("coerceValues", () => {
  it("applies spec list", () => {
    const params: ParamSpec[] = [
      { name: "start", type: "date", required: true },
      { name: "n", type: "number" },
    ];
    expect(coerceValues(params, { start: "2026-09-20", n: "5" })).toEqual({ start: "2026-09-20", n: 5 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/template.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import { LeoError } from "./errors";
import type { ParamSpec } from "../schema/skill";

export type ParamValues = Record<string, string | number | boolean | undefined>;

export function interpolate(template: string, values: ParamValues): string {
  return template.replace(/\{\{(\w+)\}\}/g, (full, name: string) => {
    const v = values[name];
    if (v === undefined) throw new LeoError("validation", `缺少参数值: ${name}`);
    return String(v);
  });
}

export function interpolateValue(value: unknown, values: ParamValues): unknown {
  if (typeof value === "string") return interpolate(value, values);
  if (Array.isArray(value)) return value.map((v) => interpolateValue(v, values));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolateValue(v, values);
    }
    return out;
  }
  return value;
}

export function coerceParam(spec: ParamSpec, raw: string | undefined): string | number | boolean {
  let value = raw;
  if (value === undefined) {
    if (spec.default !== undefined) value = String(spec.default);
    else if (spec.required) throw new LeoError("validation", `缺少必填参数: ${spec.name}`);
    else return "";
  }
  switch (spec.type) {
    case "number": {
      const n = Number(value);
      if (Number.isNaN(n)) throw new LeoError("validation", `参数 ${spec.name} 应为数字，实际: ${value}`);
      return n;
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new LeoError("validation", `参数 ${spec.name} 应为 YYYY-MM-DD，实际: ${value}`);
      return value;
    }
    case "bool":
      return value === "true" || value === "1";
    case "enum": {
      if (spec.values && spec.values[value] !== undefined) return spec.values[value];
      return value;
    }
    default:
      return value;
  }
}

export function coerceValues(params: ParamSpec[], raw: Record<string, string | undefined>): ParamValues {
  const out: ParamValues = {};
  for (const p of params) out[p.name] = coerceParam(p, raw[p.name]);
  return out;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/template.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/template.ts test/unit/template.test.ts
git commit -m "feat: add template interpolation and param coercion"
```

---

## Task 5: 点路径取值（engine/extract.ts）

**Files:**
- Create: `src/engine/extract.ts`
- Test: `test/unit/extract.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { getByPath } from "../../src/engine/extract";

describe("getByPath", () => {
  it("walks nested objects", () => {
    expect(getByPath({ data: { token: "t1" } }, "data.token")).toBe("t1");
  });
  it("returns whole object on empty path", () => {
    expect(getByPath({ a: 1 }, "")).toEqual({ a: 1 });
  });
  it("returns an array value", () => {
    expect(getByPath({ data: { list: [1, 2] } }, "data.list")).toEqual([1, 2]);
  });
  it("returns undefined on missing key", () => {
    expect(getByPath({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(getByPath(null, "a")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/extract.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
export function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/extract.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/extract.ts test/unit/extract.test.ts
git commit -m "feat: add dot-path extraction"
```

---

## Task 6: 路径解析与工具（engine/config.ts）

**Files:**
- Create: `src/engine/config.ts`
- Test: `test/unit/config.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { leoDir, skillPath, credentialPath, toKebab, toCamel } from "../../src/engine/config";

describe("config paths", () => {
  const orig = process.env.LEO_HOME;
  afterEach(() => { if (orig) process.env.LEO_HOME = orig; else delete process.env.LEO_HOME; });

  it("uses LEO_HOME override", () => {
    process.env.LEO_HOME = "C:/tmp/leo";
    expect(skillPath("leave")).toBe("C:/tmp/leo/skills/leave/skill.json".replace(/\//g, (s) => s));
    expect(credentialPath("leave")).toContain("credentials/leave.json");
  });
});

describe("string utils", () => {
  it("toKebab/toCamel round-trip", () => {
    expect(toKebab("typeCode")).toBe("type-code");
    expect(toCamel("type-code")).toBe("typeCode");
  });
});
```

> 注：`skillPath` 断言跨平台路径分隔符会不稳，测试里只断言 `credentialPath` 的 `credentials/leave.json` 后缀与 `toKebab/toCamel`，把 `skillPath` 断言改成 `toContain("leave")`。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/config.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

export function leoDir(): string {
  return process.env.LEO_HOME ?? path.join(os.homedir(), ".leo");
}

export function skillPath(system: string): string {
  return path.join(leoDir(), "skills", system, "skill.json");
}

export function skillMdPath(system: string): string {
  return path.join(leoDir(), "skills", system, "skill.md");
}

export function credentialPath(system: string): string {
  return path.join(leoDir(), "credentials", `${system}.json`);
}

export function listSystems(): string[] {
  const dir = path.join(leoDir(), "skills");
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

export function toCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/config.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/config.ts test/unit/config.test.ts
git commit -m "feat: add config path resolution and string utils"
```

---

## Task 7: 凭证读写（auth/store.ts）

**Files:**
- Create: `src/auth/store.ts`
- Test: `test/unit/auth-store.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeCredentials, readCredentials } from "../../src/auth/store";

describe("credential store", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leo-")); process.env.LEO_HOME = tmp; });
  afterEach(() => { delete process.env.LEO_USERNAME; delete process.env.LEO_PASSWORD; fs.rmSync(tmp, { recursive: true, force: true }); });

  it("writes then reads", () => {
    writeCredentials("leave", { username: "u1", password: "p1" });
    expect(readCredentials("leave")).toEqual({ username: "u1", password: "p1" });
  });
  it("throws when missing", () => {
    expect(() => readCredentials("nope")).toThrow(/auth login/);
  });
  it("prefers env override", () => {
    process.env.LEO_USERNAME = "eu";
    process.env.LEO_PASSWORD = "ep";
    expect(readCredentials("anything")).toEqual({ username: "eu", password: "ep" });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/auth-store.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import fs from "node:fs";
import path from "node:path";
import { LeoError } from "../engine/errors";
import { credentialPath } from "../engine/config";

export interface Credentials {
  username: string;
  password: string;
}

export function writeCredentials(system: string, creds: Credentials): void {
  const file = credentialPath(system);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function readCredentials(system: string): Credentials {
  const envUser = process.env.LEO_USERNAME;
  const envPass = process.env.LEO_PASSWORD;
  if (envUser && envPass) return { username: envUser, password: envPass };
  try {
    const raw = JSON.parse(fs.readFileSync(credentialPath(system), "utf8"));
    if (typeof raw.username === "string" && typeof raw.password === "string") {
      return { username: raw.username, password: raw.password };
    }
  } catch {
    /* fall through */
  }
  throw new LeoError("auth", `未找到系统 ${system} 的凭证，请先运行: leo auth login ${system}`);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/auth-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/store.ts test/unit/auth-store.test.ts
git commit -m "feat: add credential store"
```

---

## Task 8: skill 加载与校验（engine/spec.ts）

**Files:**
- Create: `src/engine/spec.ts`
- Test: `test/unit/spec.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSkill } from "../../src/engine/spec";

const valid = {
  name: "leave", baseUrl: "http://x", auth: { type: "password", loginRequest: "login", sessionFrom: "cookie", sessionKey: "JSESSIONID" },
  requests: { login: { method: "POST", path: "/api/login" } },
  commands: [],
};

describe("loadSkill", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leo-")); process.env.LEO_HOME = tmp; });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function write(name: string, obj: unknown) {
    const dir = path.join(tmp, "skills", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "skill.json"), JSON.stringify(obj));
  }

  it("loads a valid skill", () => {
    write("leave", valid);
    expect(loadSkill("leave").name).toBe("leave");
  });
  it("throws spec error on missing file", () => {
    expect(() => loadSkill("missing")).toThrow(/无法加载/);
  });
  it("throws spec error on invalid content", () => {
    write("bad", { name: "bad" });
    expect(() => loadSkill("bad")).toThrow(/校验失败/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/spec.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import fs from "node:fs";
import { SkillSchema, type Skill } from "../schema/skill";
import { LeoError } from "./errors";
import { skillPath } from "./config";

export function loadSkill(system: string): Skill {
  const file = skillPath(system);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new LeoError("spec", `无法加载 skill.json: ${file}`);
  }
  const result = SkillSchema.safeParse(raw);
  if (!result.success) {
    const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    throw new LeoError("spec", `skill.json 校验失败 (${file}): ${detail}`);
  }
  return result.data;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/spec.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/spec.ts test/unit/spec.test.ts
git commit -m "feat: add skill loader with zod validation"
```

---

## Task 9: HTTP 回放 + mock server（engine/http.ts + test/helpers/server.ts）

**Files:**
- Create: `test/helpers/server.ts`
- Create: `src/engine/http.ts`
- Test: `test/unit/http.test.ts`

- [ ] **Step 1: 写 mock server helper**

```ts
import http from "node:http";
import type { AddressInfo } from "node:net";

export interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface MockServer {
  url: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

export type MockHandler = (req: http.IncomingMessage, res: http.ServerResponse, ctx: { body: string }) => void;

export function startServer(handler: MockHandler): Promise<MockServer> {
  return new Promise((resolve) => {
    const requests: CapturedRequest[] = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        requests.push({
          method: req.method ?? "GET",
          url: req.url ?? "/",
          headers: (req.headers as Record<string, string>),
          body,
        });
        handler(req, res, { body });
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}
```

- [ ] **Step 2: 写失败测试（http.test.ts）**

```ts
import { describe, it, expect, afterEach } from "vitest";
import { send } from "../../src/engine/http";
import { startServer, MockServer } from "../helpers/server";

describe("send", () => {
  let server: MockServer | undefined;
  afterEach(async () => { await server?.close(); });

  it("returns parsed JSON body and status", async () => {
    server = await startServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, data: { ok: true } }));
    });
    const resp = await send({ method: "GET", url: server.url + "/api/list" });
    expect(resp.status).toBe(200);
    expect(resp.body).toEqual({ code: 0, data: { ok: true } });
  });

  it("preserves headers", async () => {
    server = await startServer((_req, res) => { res.end("x"); });
    await send({ method: "GET", url: server.url + "/", headers: { "X-A": "1" } });
    expect(server.requests[0].headers["x-a"]).toBe("1");
  });

  it("throws network error on unreachable host", async () => {
    await expect(send({ method: "GET", url: "http://127.0.0.1:1/" })).rejects.toThrow(/请求失败/);
  });
});
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run test/unit/http.test.ts`
Expected: FAIL

- [ ] **Step 4: 实现 http.ts**

```ts
import { LeoError } from "./errors";

export interface HttpRequestInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

export async function send(input: HttpRequestInput, opts: { timeoutMs?: number } = {}): Promise<HttpResponse> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: globalThis.Response;
  try {
    res = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
      redirect: "manual",
    });
  } catch (err) {
    throw new LeoError("network", `请求失败: ${input.method} ${input.url} — ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  const rawBody = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  let body: unknown = rawBody;
  if ((headers["content-type"] ?? "").includes("application/json")) {
    try { body = JSON.parse(rawBody); } catch { /* keep raw */ }
  }
  return { status: res.status, headers, body, rawBody };
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run test/unit/http.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/engine/http.ts test/helpers/server.ts test/unit/http.test.ts
git commit -m "feat: add HTTP replay transport and mock server helper"
```

---

## Task 10: 请求构建（engine/request.ts）

**Files:**
- Create: `src/engine/request.ts`
- Test: `test/unit/request.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { buildRequest } from "../../src/engine/request";
import type { Skill } from "../../src/schema/skill";

const skill: Skill = {
  name: "leave", baseUrl: "http://h",
  auth: { type: "password", loginRequest: "login", sessionFrom: "cookie", sessionKey: "JSESSIONID" },
  requests: {
    login: { method: "POST", path: "/api/login", body: "username={{username}}&password={{password}}" },
    submit: { method: "POST", path: "/api/leave/apply", headers: { "Content-Type": "application/json" },
      body: { startDate: "{{start}}", reason: "{{reason}}" } },
  },
  commands: [],
};

describe("buildRequest", () => {
  it("builds form login request", () => {
    const r = buildRequest(skill, skill.requests.login, { username: "u", password: "p" });
    expect(r.url).toBe("http://h/api/login");
    expect(r.body).toBe("username=u&password=p");
  });
  it("builds JSON body and default content-type", () => {
    const r = buildRequest(skill, skill.requests.submit, { start: "2026-09-20", reason: "r" });
    expect(r.url).toBe("http://h/api/leave/apply");
    expect(JSON.parse(r.body!)).toEqual({ startDate: "2026-09-20", reason: "r" });
    expect(r.headers["Content-Type"]).toBe("application/json");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/request.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import type { Skill, RequestSpec } from "../schema/skill";
import { interpolateValue } from "./template";

export interface BuiltRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export function buildRequest(skill: Skill, spec: RequestSpec, values: Record<string, string | number | boolean | undefined>): BuiltRequest {
  const url = `${skill.baseUrl}${interpolateValue(spec.path, values) as string}`;
  const headers: Record<string, string> = {};
  if (spec.headers) {
    for (const [k, v] of Object.entries(spec.headers)) headers[k] = interpolateValue(v, values) as string;
  }
  let body: string | undefined;
  if (spec.body !== undefined) {
    if (typeof spec.body === "string") {
      body = interpolateValue(spec.body, values) as string;
    } else {
      body = JSON.stringify(interpolateValue(spec.body, values));
      if (!headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = "application/json";
    }
  }
  return { method: spec.method, url, headers, body };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/request.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/request.ts test/unit/request.test.ts
git commit -m "feat: add request builder with param injection"
```

---

## Task 11: 会话管理（engine/session.ts）

**Files:**
- Create: `src/engine/session.ts`
- Test: `test/unit/session.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ensureSession, clearSession } from "../../src/engine/session";
import { startServer, MockServer } from "../helpers/server";
import type { Skill } from "../../src/schema/skill";

const skill: Skill = {
  name: "leave", baseUrl: "",
  auth: { type: "password", loginRequest: "login", sessionFrom: "cookie", sessionKey: "JSESSIONID" },
  requests: { login: { method: "POST", path: "/api/login", body: "username={{username}}&password={{password}}" } },
  commands: [],
};

describe("ensureSession", () => {
  let tmp: string;
  let server: MockServer | undefined;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leo-")); process.env.LEO_HOME = tmp; process.env.LEO_USERNAME = "u"; process.env.LEO_PASSWORD = "p"; });
  afterEach(async () => {
    delete process.env.LEO_USERNAME; delete process.env.LEO_PASSWORD;
    delete process.env.LEO_HOME;
    fs.rmSync(tmp, { recursive: true, force: true });
    await server?.close();
  });

  it("logs in and returns cookie session", async () => {
    server = await startServer((_req, res) => {
      res.setHeader("Set-Cookie", "JSESSIONID=abc123; Path=/");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0 }));
    });
    const s = { ...skill, baseUrl: server!.url };
    const session = await ensureSession(s);
    expect(session.cookie).toBe("JSESSIONID=abc123");
  });

  it("caches session; second call skips login", async () => {
    server = await startServer((_req, res) => {
      res.setHeader("Set-Cookie", "JSESSIONID=abc123; Path=/");
      res.end("{}");
    });
    const s = { ...skill, baseUrl: server!.url };
    await ensureSession(s);
    await ensureSession(s);
    const logins = server!.requests.filter((r) => r.url.startsWith("/api/login"));
    expect(logins.length).toBe(1);
  });

  it("throws auth error on missing session in response", async () => {
    server = await startServer((_req, res) => { res.end("{}"); });
    const s = { ...skill, baseUrl: server!.url };
    await expect(ensureSession(s)).rejects.toThrow(/未找到会话/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/session.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import fs from "node:fs";
import path from "node:path";
import type { Skill } from "../schema/skill";
import { LeoError } from "./errors";
import { buildRequest } from "./request";
import { send } from "./http";
import { readCredentials } from "../auth/store";
import { leoDir } from "./config";

export interface Session {
  cookie?: string;
  header?: { name: string; value: string };
}

function sessionCachePath(system: string): string {
  return path.join(leoDir(), "sessions", `${system}.json`);
}

function readCachedSession(system: string): Session | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(sessionCachePath(system), "utf8"));
    if (raw && typeof raw === "object") return raw as Session;
  } catch { /* no cache */ }
  return undefined;
}

function writeCachedSession(system: string, session: Session): void {
  const file = sessionCachePath(system);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(session), { mode: 0o600 });
}

export function clearSession(system: string): void {
  try { fs.rmSync(sessionCachePath(system), { force: true }); } catch { /* ignore */ }
}

function getHeaderInsensitive(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

export async function ensureSession(skill: Skill, opts: { force?: boolean } = {}): Promise<Session> {
  const cached = opts.force ? undefined : readCachedSession(skill.name);
  if (cached) return cached;

  const creds = readCredentials(skill.name);
  const loginSpec = skill.requests[skill.auth.loginRequest];
  if (!loginSpec) throw new LeoError("spec", `auth.loginRequest 引用了未定义的请求: ${skill.auth.loginRequest}`);

  const req = buildRequest(skill, loginSpec, { username: creds.username, password: creds.password });
  const resp = await send(req);
  if (resp.status >= 400) throw new LeoError("auth", `登录失败 (HTTP ${resp.status})`, { hint: "检查账号密码" });

  let session: Session | undefined;
  if (skill.auth.sessionFrom === "cookie") {
    const setCookie = resp.headers["set-cookie"];
    if (setCookie) {
      const m = new RegExp(`(?:^|;\\s*)${skill.auth.sessionKey}=([^;]*)`).exec(setCookie);
      if (m) session = { cookie: `${skill.auth.sessionKey}=${m[1]}` };
    }
  } else {
    const v = getHeaderInsensitive(resp.headers, skill.auth.sessionKey);
    if (v) session = { header: { name: skill.auth.sessionKey, value: v } };
  }
  if (!session) throw new LeoError("auth", `登录响应中未找到会话 (${skill.auth.sessionKey})`);

  writeCachedSession(skill.name, session);
  return session;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/session.ts test/unit/session.test.ts
git commit -m "feat: add session manager with cookie cache"
```

---

## Task 12: 命令编排与成功判定（engine/run.ts）

**Files:**
- Create: `src/engine/run.ts`
- Test: `test/unit/run.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand } from "../../src/engine/run";
import { startServer, MockServer } from "../helpers/server";
import type { Skill } from "../../src/schema/skill";

function makeSkill(baseUrl: string): Skill {
  return {
    name: "leave", baseUrl,
    auth: { type: "password", loginRequest: "login", sessionFrom: "cookie", sessionKey: "JSESSIONID" },
    requests: {
      login: { method: "POST", path: "/api/login", body: "username={{username}}&password={{password}}" },
      submit: { method: "POST", path: "/api/leave/apply", headers: { "Content-Type": "application/json" },
        body: { startDate: "{{start}}", typeCode: "{{typeCode}}" } },
    },
    responseContract: { success: { http: [200], path: "code", equals: 0 }, errorMessagePath: "msg" },
    commands: [
      { name: "submit", request: "submit", effect: "write", params: [
        { name: "start", type: "date", required: true },
        { name: "typeCode", type: "string" },
      ] },
    ],
  };
}

describe("runCommand", () => {
  let tmp: string;
  let server: MockServer | undefined;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leo-")); process.env.LEO_HOME = tmp; process.env.LEO_USERNAME = "u"; process.env.LEO_PASSWORD = "p"; });
  afterEach(async () => {
    delete process.env.LEO_USERNAME; delete process.env.LEO_PASSWORD; delete process.env.LEO_HOME;
    fs.rmSync(tmp, { recursive: true, force: true }); await server?.close();
  });

  it("submits with session and returns data", async () => {
    server = await startServer((req, res) => {
      if (req.url === "/api/login") {
        res.setHeader("Set-Cookie", "JSESSIONID=abc; Path=/");
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ code: 0 }));
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, data: { id: 42 } }));
    });
    const result = await runCommand(makeSkill(server!.url), "submit", { start: "2026-09-20", typeCode: "1" });
    expect(result.data).toEqual({ code: 0, data: { id: 42 } });
    const apply = server!.requests.find((r) => r.url === "/api/leave/apply");
    expect(JSON.parse(apply!.body)).toEqual({ startDate: "2026-09-20", typeCode: "1" });
    expect(apply!.headers["cookie"]).toBe("JSESSIONID=abc");
  });

  it("throws upstream error when code != 0", async () => {
    server = await startServer((req, res) => {
      res.setHeader("Set-Cookie", "JSESSIONID=abc; Path=/");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 1, msg: "余额不足" }));
    });
    await expect(runCommand(makeSkill(server!.url), "submit", { start: "2026-09-20", typeCode: "1" }))
      .rejects.toThrow(/余额不足/);
  });

  it("dry-run returns request without sending", async () => {
    server = await startServer(() => { throw new Error("不应被调用"); });
    const result = await runCommand(makeSkill(server!.url), "submit", { start: "2026-09-20", typeCode: "1" }, { dryRun: true });
    expect((result.data as any).dryRun).toBe(true);
    expect(server!.requests.length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/run.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import type { Skill, CommandSpec } from "../schema/skill";
import { LeoError } from "./errors";
import { coerceValues, ParamValues } from "./template";
import { buildRequest } from "./request";
import { send, HttpResponse } from "./http";
import { ensureSession, clearSession, Session } from "./session";
import { getByPath } from "./extract";

export interface RunResult {
  ok: true;
  data: unknown;
}

async function executeOnce(skill: Skill, command: CommandSpec, values: ParamValues, session: Session): Promise<HttpResponse> {
  const spec = skill.requests[command.request];
  const req = buildRequest(skill, spec, values);
  if (session.cookie) req.headers["Cookie"] = session.cookie;
  if (session.header) req.headers[session.header.name] = session.header.value;
  return send(req);
}

function checkSuccess(skill: Skill, resp: HttpResponse): void {
  const rc = skill.responseContract?.success;
  if (!rc) return;
  if (rc.http && !rc.http.includes(resp.status)) {
    throw new LeoError("upstream", `上游返回 HTTP ${resp.status}`, { upstream: extractUpstream(skill, resp.body) });
  }
  if (rc.path !== undefined && rc.equals !== undefined) {
    const actual = getByPath(resp.body, rc.path);
    if (actual !== rc.equals) {
      throw new LeoError("upstream", `上游业务错误`, { upstream: extractUpstream(skill, resp.body) });
    }
  }
}

function extractUpstream(skill: Skill, body: unknown): { code?: unknown; message?: string } {
  const p = skill.responseContract?.errorMessagePath;
  return { message: p ? String(getByPath(body, p) ?? "") : undefined };
}

export async function runCommand(skill: Skill, commandName: string, raw: Record<string, string | undefined>, opts: { dryRun?: boolean } = {}): Promise<RunResult> {
  const command = skill.commands.find((c) => c.name === commandName);
  if (!command) throw new LeoError("validation", `未知命令: ${commandName}`);
  if (!skill.requests[command.request]) throw new LeoError("spec", `命令 ${commandName} 引用了未定义的请求: ${command.request}`);
  const values = coerceValues(command.params, raw);

  if (opts.dryRun) {
    const req = buildRequest(skill, skill.requests[command.request], values);
    return { ok: true, data: { dryRun: true, request: req } };
  }

  let session = await ensureSession(skill);
  let resp = await executeOnce(skill, command, values, session);
  if (resp.status === 401) {
    clearSession(skill.name);
    session = await ensureSession(skill, { force: true });
    resp = await executeOnce(skill, command, values, session);
  }
  checkSuccess(skill, resp);
  return { ok: true, data: resp.body };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/run.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/run.ts test/unit/run.test.ts
git commit -m "feat: add command orchestrator with success check"
```

---

## Task 13: 输出格式化（engine/output.ts）

**Files:**
- Create: `src/engine/output.ts`
- Test: `test/unit/output.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { formatTable, formatEnvelope, toTableRows } from "../../src/engine/output";

describe("toTableRows", () => {
  it("extracts data.list", () => {
    expect(toTableRows({ data: { list: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
  });
  it("accepts direct array", () => {
    expect(toTableRows([{ a: 1 }])).toEqual([{ a: 1 }]);
  });
  it("throws on non-array", () => {
    expect(() => toTableRows({ a: 1 })).toThrow();
  });
});

describe("formatTable", () => {
  it("renders header and rows", () => {
    const out = formatTable([{ name: "张三", days: 1 }]);
    expect(out).toContain("name");
    expect(out).toContain("张三");
  });
});

describe("formatEnvelope", () => {
  it("renders ok envelope", () => {
    const j = JSON.parse(formatEnvelope(true, { x: 1 }));
    expect(j.ok).toBe(true);
    expect(j.data).toEqual({ x: 1 });
  });
  it("renders error envelope", () => {
    const j = JSON.parse(formatEnvelope(false, undefined, { type: "auth", message: "m" }));
    expect(j.ok).toBe(false);
    expect(j.error.type).toBe("auth");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/output.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import { LeoError } from "./errors";

export function toTableRows(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const inner = obj.data as Record<string, unknown> | undefined;
    if (inner && Array.isArray(inner.list)) return inner.list as Array<Record<string, unknown>>;
    if (Array.isArray(obj.list)) return obj.list as Array<Record<string, unknown>>;
  }
  throw new LeoError("validation", "表格输出需要数组数据");
}

export function formatTable(data: unknown): string {
  const rows = toTableRows(data);
  if (rows.length === 0) return "(空)";
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const sep = "  |  ";
  const header = keys.join(sep);
  const rule = keys.map((k) => "-".repeat(k.length)).join(sep);
  const bodyRows = rows.map((r) => keys.map((k) => String(r[k] ?? "")).join(sep));
  return [header, rule, ...bodyRows].join("\n");
}

export function formatJson(value: unknown, pretty = false): string {
  return JSON.stringify(value, null, pretty ? 2 : undefined);
}

export function formatEnvelope(ok: boolean, data?: unknown, error?: unknown): string {
  return ok
    ? `${JSON.stringify({ ok: true, data: data ?? null })}\n`
    : `${JSON.stringify({ ok: false, error: error ?? null })}\n`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/output.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/output.ts test/unit/output.test.ts
git commit -m "feat: add output formatting (json/table) and envelope"
```

---

## Task 14: skill.md 方向盘生成器（gen/md.ts）

**Files:**
- Create: `src/gen/md.ts`
- Test: `test/unit/gen-md.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { generateMarkdown } from "../../src/gen/md";
import type { Skill } from "../../src/schema/skill";

const skill: Skill = {
  name: "leave", displayName: "请假系统", baseUrl: "http://h",
  auth: { type: "password", loginRequest: "login", sessionFrom: "cookie", sessionKey: "JSESSIONID" },
  requests: { list: { method: "GET", path: "/api/leave/list" } },
  commands: [{ name: "list", verb: "查我的请假", request: "list", effect: "read",
    params: [{ name: "typeCode", type: "enum", values: { "事假": "1" } }] }],
};

describe("generateMarkdown", () => {
  it("contains command usage and param", () => {
    const md = generateMarkdown(skill);
    expect(md).toContain("leo leave list");
    expect(md).toContain("查我的请假");
    expect(md).toContain("typeCode");
    expect(md).toContain("事假");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/gen-md.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
import type { Skill } from "../schema/skill";

export function generateMarkdown(skill: Skill): string {
  const lines: string[] = [];
  lines.push(`# ${skill.displayName ?? skill.name}（leo-cli skill）`);
  lines.push("");
  lines.push(`对「${skill.name}」系统的操作，一律调用下方 leo 命令，不要自己用 curl/fetch 绕过（登录/会话/参数由 leo 处理）。`);
  lines.push("");
  for (const c of skill.commands) {
    const argPart = c.params.filter((p) => p.required).map((p) => `<${p.name}>`).join(" ");
    lines.push(`## ${c.name} — ${c.verb ?? ""}`);
    lines.push("");
    lines.push("```bash");
    lines.push(`leo ${skill.name} ${c.name} ${argPart}`.trimEnd());
    lines.push("```");
    lines.push("");
    if (c.params.length) {
      lines.push("参数：");
      for (const p of c.params) {
        const req = p.required ? "必填" : "可选";
        const vals = p.values ? `（${Object.keys(p.values).join(" / ")}）` : "";
        lines.push(`- \`${p.name}\` (${p.type}, ${req})${vals}`);
      }
      lines.push("");
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/gen-md.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/gen/md.ts test/unit/gen-md.test.ts
git commit -m "feat: add skill.md steering generator"
```

---

## Task 15: CLI 命令面（cli/index.ts）

**Files:**
- Create: `src/cli/index.ts`

- [ ] **Step 1: 实现（无独立单测，靠集成测试覆盖）**

```ts
#!/usr/bin/env node
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { listSystems, skillMdPath, toKebab, toCamel } from "../engine/config";
import { loadSkill } from "../engine/spec";
import { runCommand } from "../engine/run";
import { formatJson, formatTable, formatEnvelope } from "../engine/output";
import { generateMarkdown } from "../gen/md";
import { writeCredentials } from "../auth/store";
import { LeoError } from "../engine/errors";

const program = new Command();
program.name("leo").description("把无源码业务网页系统包装成 CLI").version("0.1.0");

for (const system of listSystems()) {
  let skill;
  try { skill = loadSkill(system); } catch { continue; }
  const sys = program.command(system).description(skill.displayName ?? system);
  for (const c of skill.commands) {
    const sub = sys.command(c.name).description(c.verb ?? "");
    sub.option("--format <f>", "输出格式 json|table|pretty", "json");
    sub.option("--dry-run", "只预览请求不发送");
    sub.option("--yes", "跳过写操作确认");
    for (const p of c.params) sub.option(`--${toKebab(p.name)} <value>`, p.name);
    sub.action(async (opts: Record<string, unknown>) => {
      try {
        if (c.effect === "write" && !opts.dryRun && !opts.yes) {
          console.error("该命令有副作用，加 --yes 确认，或加 --dry-run 预览");
          process.exit(1);
        }
        const raw: Record<string, string | undefined> = {};
        for (const p of c.params) raw[p.name] = opts[toCamel(p.name)] as string | undefined;
        const result = await runCommand(skill!, c.name, raw, { dryRun: !!opts.dryRun });
        const fmt = String(opts.format ?? "json");
        if (fmt === "table") console.log(formatTable(result.data));
        else if (fmt === "pretty") console.log(formatJson(result.data, true));
        else console.log(formatEnvelope(true, result.data));
      } catch (e) {
        handleError(e);
      }
    });
  }
}

const skillCmd = program.command("skill").description("skill 工具");
skillCmd.command("gen-md").argument("<system>").action((system: string) => {
  try {
    const skill = loadSkill(system);
    const file = skillMdPath(system);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, generateMarkdown(skill));
    console.log(`已生成 ${file}`);
  } catch (e) { handleError(e); }
});

const authCmd = program.command("auth").description("凭证管理");
authCmd.command("login").argument("<system>")
  .requiredOption("--username <u>")
  .requiredOption("--password <p>")
  .action((system: string, opts: { username: string; password: string }) => {
    try {
      writeCredentials(system, { username: opts.username, password: opts.password });
      console.log(`已保存 ${system} 凭证`);
    } catch (e) { handleError(e); }
  });

function handleError(e: unknown): void {
  if (e instanceof LeoError) {
    console.error(formatEnvelope(false, undefined, { type: e.category, message: e.message, hint: e.hint, upstream: e.upstream }));
    process.exit(e.exitCode);
  }
  console.error(String(e));
  process.exit(1);
}

program.parseAsync(process.argv).catch(handleError);
```

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: `dist/cli/index.js` 生成，无类型错误。

- [ ] **Step 3: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat: add commander CLI with dynamic system commands"
```

---

## Task 16: 样例 skill + 端到端集成测试

**Files:**
- Create: `examples/leave/skill.json`
- Create: `test/integration/leave.test.ts`
- Create: `test/fixtures/leave-skill.json`

- [ ] **Step 1: 写样例与 fixture skill.json（两处内容相同）**

```json
{
  "name": "leave",
  "displayName": "请假系统",
  "version": "1",
  "baseUrl": "http://127.0.0.1:8080",
  "auth": {
    "type": "password",
    "loginRequest": "login",
    "sessionFrom": "cookie",
    "sessionKey": "JSESSIONID",
    "prompt": { "username": "工号", "password": "密码" }
  },
  "requests": {
    "login": {
      "method": "POST",
      "path": "/api/login",
      "headers": { "Content-Type": "application/x-www-form-urlencoded" },
      "body": "username={{username}}&password={{password}}"
    },
    "submit_leave": {
      "method": "POST",
      "path": "/api/leave/apply",
      "headers": { "Content-Type": "application/json" },
      "body": { "startDate": "{{start}}", "endDate": "{{end}}", "typeCode": "{{typeCode}}", "reason": "{{reason}}" }
    },
    "list_leave": {
      "method": "GET",
      "path": "/api/leave/list"
    }
  },
  "responseContract": {
    "success": { "http": [200], "path": "code", "equals": 0 },
    "errorMessagePath": "msg"
  },
  "commands": [
    {
      "name": "submit",
      "verb": "申请请假",
      "request": "submit_leave",
      "effect": "write",
      "params": [
        { "name": "start", "type": "date", "required": true },
        { "name": "end", "type": "date", "required": true },
        { "name": "typeCode", "type": "enum", "values": { "事假": "1", "病假": "2", "年假": "3" }, "default": "事假" },
        { "name": "reason", "type": "string" }
      ]
    },
    {
      "name": "list",
      "verb": "查我的请假",
      "request": "list_leave",
      "effect": "read",
      "params": []
    }
  ]
}
```

- [ ] **Step 2: 写集成测试（模拟一个最小请假系统）**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadSkill } from "../../src/engine/spec";
import { runCommand } from "../../src/engine/run";
import { startServer, MockServer } from "../helpers/server";
import fixture from "../fixtures/leave-skill.json";

describe("leave system end-to-end", () => {
  let tmp: string;
  let server: MockServer | undefined;
  const db: Array<Record<string, unknown>> = [];

  beforeEach(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "leo-"));
    process.env.LEO_HOME = tmp;
    process.env.LEO_USERNAME = "u";
    process.env.LEO_PASSWORD = "p";
    db.length = 0;
    server = await startServer((req, res, ctx) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/login") {
        res.setHeader("Set-Cookie", "JSESSIONID=sess; Path=/");
        return res.end(JSON.stringify({ code: 0 }));
      }
      const cookie = req.headers.cookie ?? "";
      if (!cookie.includes("JSESSIONID=sess")) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ code: 401, msg: "未登录" }));
      }
      if (req.url === "/api/leave/apply") {
        const body = JSON.parse(ctx.body || "{}");
        const id = db.length + 1;
        db.push({ id, ...body });
        return res.end(JSON.stringify({ code: 0, data: { id } }));
      }
      if (req.url === "/api/leave/list") {
        return res.end(JSON.stringify({ code: 0, data: { list: db } }));
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 404, msg: "not found" }));
    });
    // 写 fixture 到 LEO_HOME
    const dir = path.join(tmp, "skills", "leave");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "skill.json"), JSON.stringify(fixture));
  });

  afterEach(async () => {
    delete process.env.LEO_HOME; delete process.env.LEO_USERNAME; delete process.env.LEO_PASSWORD;
    fs.rmSync(tmp, { recursive: true, force: true });
    await server?.close();
  });

  it("submit then list round-trips", async () => {
    const skill = loadSkill("leave");
    skill.baseUrl = server!.url;
    await runCommand(skill, "submit", { start: "2026-09-20", end: "2026-09-21", typeCode: "事假", reason: "家中有事" });
    const list = await runCommand(skill, "list", {});
    const rows = (list.data as any).data.list;
    expect(rows).toHaveLength(1);
    expect(rows[0].startDate).toBe("2026-09-20");
    expect(rows[0].typeCode).toBe("1");
  });
});
```

> 注：`startServer` 的 handler 签名在 Task 9 已统一为三参 `(req, res, ctx)`（`MockHandler`）——需要读请求体时用 `ctx.body`；Task 9/11/12 里那些 `(_req, res) => ...` 两参写法照常工作（第三参 `ctx` 未声明会被忽略）。

- [ ] **Step 3: 运行确认集成测试通过**

Run: `npx vitest run test/integration/leave.test.ts`
Expected: PASS

- [ ] **Step 4: 全量测试 + 提交**

```bash
npx vitest run
git add examples/ test/integration/leave.test.ts test/fixtures/leave-skill.json
git commit -m "test: add leave system end-to-end integration test"
```

---

## 最终验证（人工冒烟）

1. 把 `examples/leave/skill.json` 拷到 `~/.leo/skills/leave/skill.json`，确认 `baseUrl` 指向你本地的 Java mock。
2. `leo auth login leave --username your工号 --password xxx`
3. `leo leave submit --start 2026-09-20 --end 2026-09-20 --typeCode 事假 --reason 测试 --yes`
4. `leo leave list --format table`
5. `leo skill gen-md leave` → 检查 `~/.leo/skills/leave/skill.md`。

全部成功即 POC 达成 spec 的验收标准。

---

## Self-Review 结论

- **Spec 覆盖**：spec 的「引擎五件套」「错误契约」「三层测试」「目录结构」分别在 Task 2–16 落地；「凭证安全(mode 0600 + 不提交)」在 Task 7；「副作用确认」在 Task 15；「skill 方向盘」在 Task 14；「防 SSRF」因 `raw` 命令被延期、不在 POC（已记录）。
- **占位符**：无 TBD/TODO；所有代码步骤给出完整代码。
- **类型一致**：`ParamSpec/RequestSpec/Skill` 统一定义于 `schema/skill.ts`，其余模块 import 复用；`startServer` 的 handler 签名在 Task 9 统一定义为三参 `(req, res, ctx)`（`MockHandler`），Task 16 用 `ctx.body` 读请求体，其余测试用两参形式（第三参被忽略）。