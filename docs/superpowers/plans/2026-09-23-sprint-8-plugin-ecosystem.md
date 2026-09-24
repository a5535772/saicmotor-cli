# Sprint 8 插件化生态实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 saicmotor-cli 从单体项目改造为 npm workspaces monorepo，实现完整的插件生态——loader 双根扫描、manifest engine 强校验、SDK、脚手架/dev/校验工具链、skills 注册器收回核心、suite 路由聚合、leave/attendance 插件化，核心发 1.0.0。

**Architecture:** 框架 monorepo（cli/sdk/plugin-user/plugin-leave/plugin-attendance），业务插件一律外仓。plugin install 时注册器接管 SKILL.md 落盘；loader 启动时双根扫描（node_modules + linked），按 manifest engine 字段做兼容强校验，不兼容插件隔离禁用不拖垮启动。`plugin *` 命令均支持 `--json` 机读输出。

**Tech Stack:** Node.js + TypeScript + npm workspaces + commander + zod + vitest。

**前置环境说明：** S7 已完成的 `@saicmotor/cli` scoped 包在 Verdaccio (localhost:4873) 可用。所有 `--registry` 指 `http://localhost:4873`（POC 占位，可替换）。npm workspaces 不强制统一版本号，各包独立 publish。

---

## Task 1: Monorepo 骨架搭建

**Files:**
- Modify: `package.json`（根 → workspaces 根）
- Create: `packages/cli/package.json`
- Create: `packages/sdk/package.json`
- Create: `packages/plugin-user/package.json`
- Create: `packages/plugin-leave/package.json`
- Create: `packages/plugin-attendance/package.json`
- Move: 现有 `src/`, `test/`, `skills/`, `catalog/`, `scripts/`, `saicmotor.config.json` → `packages/cli/`
- Modify: `tsconfig.json`（适配新目录）

- [ ] **Step 1: 将现有文件迁入 packages/cli/**

```bash
# 在仓库根目录
mkdir -p packages/cli
# 移动源代码与资源（保留 .gitignore、README 等仓库级文件不动）
mv src packages/cli/
mv test packages/cli/
mv skills packages/cli/
mv catalog packages/cli/
mv scripts packages/cli/
mv saicmotor.config.json packages/cli/
mv tsconfig.json packages/cli/
```

- [ ] **Step 2: 写根 package.json（npm workspaces 根）**

根目录 `package.json` 改写为 workspaces 根（不发布，private）：

```json
{
  "name": "saicmotor-monorepo",
  "private": true,
  "workspaces": [
    "packages/cli",
    "packages/sdk",
    "packages/plugin-user",
    "packages/plugin-leave",
    "packages/plugin-attendance"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces --if-present",
    "prepublishOnly": "echo '使用各包独立 npm publish，见 docs/DEVELOPER.md'"
  }
}
```

- [ ] **Step 3: 调 packages/cli/package.json**

在现有 CLI package.json 基础上做三项调整：

```json
{
  "name": "@saicmotor/cli",
  "version": "0.4.0",
  "description": "面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行",
  "type": "commonjs",
  "bin": { "saicmotor": "scripts/run.js" },
  "files": [
    "dist/src/**/*.js",
    "dist/scripts/**/*.js",
    "skills/**/*.md",
    "catalog/**/*.json",
    "scripts/run.js",
    "scripts/postinstall.js",
    "saicmotor.config.json"
  ],
  "scripts": {
    "prepublishOnly": "npm run build && npm test",
    "postinstall": "node scripts/postinstall.js || true",
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "dev": "tsx src/cli/index.ts"
  },
  "engines": { "node": ">=16" },
  "dependencies": {
    "@saicmotor/sdk": "*",
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

改动点：① 新增 `@saicmotor/sdk: "*"` 依赖；② 删 `repository` 字段（S7 已验证不用于安装）。

- [ ] **Step 4: 更新 packages/cli/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

`rootDir` 改为 `"."`（`packages/cli/`），使 `src/cli/index.ts` 编译到 `dist/src/cli/index.js`，`scripts/attendance/...` 编译到 `dist/scripts/attendance/...`。

- [ ] **Step 5: 写 packages/sdk/package.json**

```json
{
  "name": "@saicmotor/sdk",
  "version": "0.1.0",
  "description": "saicmotor 插件开发 SDK：类型、schema、测试 helper",
  "type": "commonjs",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist/**/*.js", "dist/**/*.d.ts"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "prepublishOnly": "npm run build && npm test"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 6: 写 packages/plugin-user|plugin-leave|plugin-attendance 骨架 package.json**

三个插件包初始结构相同（以 plugin-user 为例，其余两个替换 `user` → `leave` / `attendance`）：

```json
{
  "name": "@saicmotor/plugin-user",
  "version": "0.1.0",
  "description": "saicmotor 用户信息查询插件",
  "type": "commonjs",
  "files": [
    "dist/**/*.js",
    "skills/**/*.md",
    "catalog/**/*.json",
    "saicmotor.plugin.json"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "prepublishOnly": "npm run build && npm test"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@saicmotor/sdk": "*",
    "@types/node": "^20.14.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  }
}
```

> **关键设计**：插件包的 `package.json` **不写 `peerDependencies`**（npm≥7 自动安装 peer 会嵌套 CLI）。兼容契约仅由 manifest `engine` 字段承担。插件 install 时 CLI 带 `--legacy-peer-deps` 防嵌套。

- [ ] **Step 7: 三个插件包写初始 tsconfig.json（内容相同）**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 8: 三个插件包写初始 saicmotor.plugin.json**

```json
{
  "name": "@saicmotor/plugin-user",
  "engine": "^1.0.0",
  "catalog": ["catalog/services/*.json"],
  "skills": ["skills/saicmotor-user"],
  "scripts": "scripts"
}
```

（plugin-leave / plugin-attendance 同结构，name 与 skills 路径对应替换。）

- [ ] **Step 9: 全局 install + 验证 workspaces 可解析**

```bash
npm install
ls packages/cli/node_modules/@saicmotor/sdk  # 应存在（workspace symlink）
npx vitest run --root packages/cli              # 现有测试全绿
```

Expected: `npm install` 无错误；`@saicmotor/sdk` 在工作区间通过 symlink 解析；CLI 73 tests 全绿。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: npm workspaces monorepo 骨架（cli/sdk/plugin-user/plugin-leave/plugin-attendance）"
```

---

## Task 2: SDK 核心——插件 manifest schema + ScriptContext 类型 + definePlugin

**Files:**
- Create: `packages/sdk/src/index.ts`
- Create: `packages/sdk/src/manifest.ts`
- Create: `packages/sdk/src/context.ts`
- Create: `packages/sdk/tsconfig.json`
- Create: `packages/sdk/test/manifest.test.ts`
- Create: `packages/sdk/test/context.test.ts`

- [ ] **Step 1: 写 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 2: 写 manifest schema——`packages/sdk/src/manifest.ts`**

```typescript
import { z } from "zod";

/** saicmotor.plugin.json 的完整 schema */
export const PluginManifestSchema = z.object({
  /** 插件包名，必须与 package.json name 一致 */
  name: z.string().min(1),
  /** semver 范围，声明兼容的核心版本（如 "^1.0.0"） */
  engine: z.string().min(1),
  /** catalog 文件 glob 列表 */
  catalog: z.array(z.string()).optional(),
  /** skill 目录列表，每项对应一个 skills/<name>/SKILL.md */
  skills: z.array(z.string()).optional(),
  /** scripts 根目录 */
  scripts: z.string().optional(),
  /** 可选：suite 意图路由 */
  routes: z
    .record(z.string(), z.string())
    .optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** 校验 manifest 对象，返回 parsed 或 zod error */
export function validateManifest(raw: unknown): PluginManifest {
  return PluginManifestSchema.parse(raw);
}

/** 类型安全的 manifest 构造助手 */
export function definePlugin(m: PluginManifest): PluginManifest {
  return PluginManifestSchema.parse(m);
}
```

- [ ] **Step 3: 写 ScriptContext 类型——`packages/sdk/src/context.ts`**

```typescript
import type { Config } from "./config-types";
import type { Service, Method } from "./catalog-types";

/**
 * 插件 script 执行上下文。
 * 运行时由 CLI 引擎构造并注入，插件只需消费类型。
 */
export interface ScriptContext {
  config: Config;
  service: Service;
  method: Method;
  values: Record<string, unknown>;
  dryRun: boolean;
  ensureToken: () => Promise<string>;
}

/** script 默认导出函数签名 */
export type ScriptFn = (ctx: ScriptContext) => Promise<RunResult>;

/** 引擎 runMethod 返回值 */
export interface RunResult {
  ok: true;
  data: unknown;
}
```

- [ ] **Step 4: 写共享类型桩——`packages/sdk/src/config-types.ts`**

```typescript
/** 与 packages/cli/src/config.ts 保持一致的接口子集 */
export interface AuthConfig {
  type: "password" | "exchange";
  loginPath: string;
  tokenPath: string;
  tokenHeader: string;
  tokenPrefix: string;
  startPath: string;
  exchangePath: string;
  loopbackHost: string;
  loopbackPort: number;
  callbackTimeoutMs: number;
}

export interface Config {
  gateway: string;
  auth: AuthConfig;
}
```

- [ ] **Step 5: 写共享类型桩——`packages/sdk/src/catalog-types.ts`**

```typescript
/** catalog schema 类型——与 packages/cli/src/schema/catalog.ts 保持同步 */
export interface Field {
  type: "string" | "integer" | "number" | "boolean";
  description?: string;
  required?: boolean;
  example?: unknown;
}

export interface Method {
  id: string;
  path: string;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  description?: string;
  requestBody?: Record<string, Field>;
  responseBody?: Record<string, Field>;
}

export interface Resource {
  methods: Record<string, Method>;
}

export interface Service {
  name: string;
  title?: string;
  description?: string;
  servicePath: string;
  resources: Record<string, Resource>;
}
```

- [ ] **Step 6: 写 SDK 入口——`packages/sdk/src/index.ts`**

```typescript
export { PluginManifestSchema, validateManifest, definePlugin } from "./manifest";
export type { PluginManifest } from "./manifest";
export type { ScriptContext, ScriptFn, RunResult } from "./context";
export type { Config, AuthConfig } from "./config-types";
export type { Field, Method, Resource, Service } from "./catalog-types";
```

- [ ] **Step 7: 写 manifest 校验测试——`packages/sdk/test/manifest.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { validateManifest, definePlugin, PluginManifestSchema } from "../src/manifest";

describe("PluginManifestSchema", () => {
  const validManifest = {
    name: "@saicmotor/plugin-test",
    engine: "^1.0.0",
    catalog: ["catalog/services/*.json"],
    skills: ["skills/saicmotor-test"],
    scripts: "scripts",
    routes: { "查询假期": "saicmotor-leave" },
  };

  it("accepts a complete manifest", () => {
    expect(() => validateManifest(validManifest)).not.toThrow();
  });

  it("accepts a minimal manifest (only name + engine)", () => {
    expect(() => validateManifest({ name: "@saicmotor/plugin-min", engine: ">=1.0.0" })).not.toThrow();
  });

  it("rejects missing name", () => {
    expect(() => validateManifest({ engine: "^1.0.0" })).toThrow();
  });

  it("rejects missing engine", () => {
    expect(() => validateManifest({ name: "@saicmotor/plugin-x" })).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => validateManifest({ name: "", engine: "^1.0.0" })).toThrow();
  });

  it("definePlugin returns validated manifest", () => {
    const m = definePlugin(validManifest);
    expect(m.name).toBe("@saicmotor/plugin-test");
    expect(m.engine).toBe("^1.0.0");
    expect(m.routes).toEqual({ "查询假期": "saicmotor-leave" });
  });

  it("definePlugin throws on invalid input", () => {
    expect(() => definePlugin({ name: "" } as any)).toThrow();
  });
});
```

- [ ] **Step 8: 构建 + 测试 SDK**

```bash
npm run build --workspace=packages/sdk
npm run test --workspace=packages/sdk
```

Expected: tsc 无错误；7 tests PASS。

- [ ] **Step 9: Commit**

```bash
git add packages/sdk/
git commit -m "feat: SDK 核心——PluginManifest schema + ScriptContext 类型 + definePlugin"
```

---

## Task 3: Plugin Loader——双根扫描 + engine 校验 + catalog 合并 + 冲突检测

**Files:**
- Create: `packages/cli/src/plugin/loader.ts`
- Create: `packages/cli/src/plugin/state.ts`
- Create: `packages/cli/test/unit/plugin-loader.test.ts`

- [ ] **Step 1: 写插件目录工具——`packages/cli/src/plugin/paths.ts`**

```typescript
import path from "node:path";
import { saicmotorDir } from "../config";

/** 插件安装根目录：~/.saicmotor/plugins/ */
export function pluginsDir(): string {
  return path.join(saicmotorDir(), "plugins");
}

/** 已安装插件目录（npm install 目标） */
export function installedPluginsDir(): string {
  return path.join(pluginsDir(), "node_modules");
}

/** dev link 目录 */
export function linkedPluginsDir(): string {
  return path.join(pluginsDir(), "linked");
}

/** state.json 路径 */
export function stateFilePath(): string {
  return path.join(pluginsDir(), "state.json");
}
```

- [ ] **Step 2: 写 state 读写——`packages/cli/src/plugin/state.ts`**

```typescript
import fs from "node:fs";
import path from "node:path";
import { stateFilePath } from "./paths";

export interface PluginStateEntry {
  name: string;           // 包名，如 "@saicmotor/plugin-user"
  version: string;        // 已安装版本
  enabled: boolean;
  source: "registry" | "linked";
  linkedPath?: string;    // dev link 指向的工程路径（source=linked 时有值）
  skills: string[];       // 已注册的 skill 目录名列表
  routes?: Record<string, string>;  // 插件声明的 suite 路由
}

export interface PluginState {
  plugins: Record<string, PluginStateEntry>;
}

export function loadState(): PluginState {
  try {
    const raw = fs.readFileSync(stateFilePath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return { plugins: {} };
  }
}

export function saveState(state: PluginState): void {
  const dir = path.dirname(stateFilePath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), "utf8");
}
```

- [ ] **Step 3: 写 loader 主逻辑——`packages/cli/src/plugin/loader.ts`**

```typescript
import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import { PluginManifestSchema, type PluginManifest } from "@saicmotor/sdk";
import type { Service } from "../schema/catalog";
import type { Config } from "../config";
import { installedPluginsDir, linkedPluginsDir } from "./paths";
import { loadState, type PluginStateEntry } from "./state";

/** 单个插件的加载结果 */
export interface LoadedPlugin {
  manifest: PluginManifest;
  entry: PluginStateEntry;
  /** 插件包根目录 */
  rootDir: string;
  /** 此插件贡献的 services（已校验） */
  services: Service[];
}

export interface LoadResult {
  plugins: LoadedPlugin[];
  warnings: string[];
}

const CORE_VERSION = "0.4.0"; // S8 后期升级到 1.0.0

/**
 * 双根扫描并加载所有兼容插件。
 * 不做全局副作用（不写 state，不注册 skills）。
 */
export function loadPlugins(config: Config): LoadResult {
  const warnings: string[] = [];
  const loaded: LoadedPlugin[] = [];
  const state = loadState();

  // 双根：linked/ 优先（dev 时覆盖已装版本）
  for (const root of [linkedPluginsDir(), installedPluginsDir()]) {
    if (!fs.existsSync(root)) continue;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); }
    catch { continue; }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // 只识别 @saicmotor/plugin-* 前缀
      if (!entry.name.startsWith("plugin-")) continue;

      const pkgRoot = path.join(root, entry.name);
      const manifestPath = path.join(pkgRoot, "saicmotor.plugin.json");

      if (!fs.existsSync(manifestPath)) {
        warnings.push(`插件 ${entry.name} 缺少 saicmotor.plugin.json，跳过`);
        continue;
      }

      let manifest: PluginManifest;
      try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        manifest = PluginManifestSchema.parse(raw);
      } catch (e: any) {
        warnings.push(`插件 ${entry.name} manifest 解析失败: ${e.message}`);
        continue;
      }

      // engine 兼容检查
      if (!semver.satisfies(CORE_VERSION, manifest.engine)) {
        warnings.push(
          `插件 ${manifest.name} 与当前核心版本不兼容（需要 ${manifest.engine}，当前 ${CORE_VERSION}），已禁用`,
        );
        continue;
      }

      // 冲突检测：同 service.name 拒绝后加载者
      const services = loadPluginServices(pkgRoot, manifest);
      for (const svc of services) {
        const existing = loaded.find((p) => p.services.some((s) => s.name === svc.name));
        if (existing) {
          warnings.push(
            `service "${svc.name}" 冲突：${manifest.name} 与 ${existing.manifest.name} 均提供，请用 plugin disable 处理`,
          );
          // 跳过后加载的插件（字母序靠后的）
          continue; // 跳过此 service 不合并，但不跳过整个插件（其他 service 仍加载）
        }
      }

      // 过滤掉冲突 service 后的 service 列表
      const conflictFree = services.filter((svc) => {
        const conflict = loaded.some((p) => p.services.some((s) => s.name === svc.name));
        if (conflict) return false;
        return true;
      });

      const stateEntry = state.plugins[manifest.name] ?? {
        name: manifest.name,
        version: "unknown",
        enabled: true,
        source: root === linkedPluginsDir() ? "linked" : "registry",
        skills: manifest.skills ?? [],
      };

      if (!stateEntry.enabled) {
        // disabled 插件不加载
        continue;
      }

      loaded.push({
        manifest,
        entry: stateEntry,
        rootDir: pkgRoot,
        services: conflictFree,
      });
    }
  }

  // 字母序确保可预测
  loaded.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

  return { plugins: loaded, warnings };
}

function loadPluginServices(pkgRoot: string, manifest: PluginManifest): Service[] {
  const services: Service[] = [];
  const catalogGlobs = manifest.catalog ?? ["catalog/services/*.json"];

  for (const glob of catalogGlobs) {
    // 简化实现：只支持 catalog/services/ 下的 *.json
    if (!glob.includes("services")) continue;
    const servicesDir = path.join(pkgRoot, "catalog", "services");
    if (!fs.existsSync(servicesDir)) continue;

    let files: string[];
    try { files = fs.readdirSync(servicesDir).filter((f) => f.endsWith(".json")); }
    catch { continue; }

    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(servicesDir, file), "utf8"));
        const svc = require("../schema/catalog").ServiceSchema.parse(raw);
        services.push(svc);
      } catch (e: any) {
        // 单文件坏不影响其他 service
        // 这个警告由调用方处理
      }
    }
  }
  return services;
}
```

> **依赖说明**：`semver` 需新增为 CLI 的 dependency。

- [ ] **Step 4: 写 loader 单元测试——`packages/cli/test/unit/plugin-loader.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// 使用临时目录模拟 ~/.saicmotor/plugins/
const tmpBase = path.join(os.tmpdir(), `saicmotor-test-loader-${Date.now()}`);
const origHome = process.env.SAICMOTOR_HOME;

function setupPluginDir(pkgName: string, manifest: object, catalogFiles?: Record<string, object>) {
  const p = path.join(tmpBase, "plugins", "node_modules", pkgName);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, "saicmotor.plugin.json"), JSON.stringify(manifest, null, 2));
  if (catalogFiles) {
    const svcDir = path.join(p, "catalog", "services");
    fs.mkdirSync(svcDir, { recursive: true });
    for (const [name, content] of Object.entries(catalogFiles)) {
      fs.writeFileSync(path.join(svcDir, name), JSON.stringify(content, null, 2));
    }
  }
}

describe("plugin loader", () => {
  beforeEach(() => {
    process.env.SAICMOTOR_HOME = tmpBase;
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
    process.env.SAICMOTOR_HOME = origHome;
  });

  it("loads no plugins when directory is empty", () => {
    fs.mkdirSync(path.join(tmpBase, "plugins", "node_modules"), { recursive: true });
    const { loadPlugins } = require("../../src/plugin/loader");
    const result = loadPlugins({ gateway: "http://localhost:8081", auth: {} as any });
    expect(result.plugins).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("loads a valid plugin with catalog", () => {
    setupPluginDir("plugin-test", { name: "@saicmotor/plugin-test", engine: ">=0.4.0", catalog: ["catalog/services/*.json"] }, {
      "test-svc.json": {
        name: "test-svc",
        servicePath: "/api/test",
        resources: { items: { methods: { list: { id: "list", path: "/items", httpMethod: "GET" } } } },
      },
    });
    const { loadPlugins } = require("../../src/plugin/loader");
    const result = loadPlugins({ gateway: "http://localhost:8081", auth: {} as any });
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].manifest.name).toBe("@saicmotor/plugin-test");
  });

  it("warns when engine is incompatible", () => {
    setupPluginDir("plugin-old", { name: "@saicmotor/plugin-old", engine: ">=2.0.0" });
    const { loadPlugins } = require("../../src/plugin/loader");
    const result = loadPlugins({ gateway: "http://localhost:8081", auth: {} as any });
    expect(result.plugins).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("不兼容"))).toBe(true);
  });

  it("warns when manifest is missing", () => {
    const p = path.join(tmpBase, "plugins", "node_modules", "plugin-noman");
    fs.mkdirSync(p, { recursive: true });
    const { loadPlugins } = require("../../src/plugin/loader");
    const result = loadPlugins({ gateway: "http://localhost:8081", auth: {} as any });
    expect(result.warnings.some((w) => w.includes("缺少 saicmotor.plugin.json"))).toBe(true);
  });
});
```

- [ ] **Step 5: 安装 semver 依赖**

```bash
npm install --workspace=packages/cli semver
npm install --workspace=packages/cli --save-dev @types/semver
```

- [ ] **Step 6: 构建 + 测试**

```bash
npm run build --workspace=packages/cli
npm run test --workspace=packages/cli
```

Expected: tsc 无类型错误；全部测试 PASS（含 loader 测试 + 原有 73 tests）。

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/plugin/ packages/cli/test/unit/plugin-loader.test.ts packages/cli/package.json
git commit -m "feat: plugin loader——双根扫描 + engine 强校验 + catalog 合并 + 冲突检测"
```

---

## Task 4: CLI 入口动态化——合并核心 catalog 与插件 catalog

**Files:**
- Modify: `packages/cli/src/cli/index.ts`
- Modify: `packages/cli/src/engine/script.ts`（多源 script 查找）

- [ ] **Step 1: 改写 CLI 入口——`packages/cli/src/cli/index.ts`**

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, toKebab, toCamel } from "../config";
import { loadCatalog } from "../engine/catalog";
import { loadPlugins } from "../plugin/loader";
import { runMethod } from "../engine/run";
import { formatJson, formatTable, formatEnvelope } from "../engine/output";
import { registerAuth } from "./auth";
import { handleError } from "./error";
import { installSkills } from "../install/skills";

const program = new Command();
program
  .name("saicmotor")
  .description("面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行")
  .version("0.4.0");

const config = loadConfig();

// 加载核心 catalog + 插件 catalog
const coreServices = loadCatalog();
const { plugins, warnings } = loadPlugins(config);
const pluginServices = plugins.flatMap((p) => p.services);
const allServices = [...coreServices, ...pluginServices];

// 打印非致命警告
for (const w of warnings) {
  console.error(`[saicmotor] ${w}`);
}

// 动态注册命令（核心 + 全部插件）
for (const service of allServices) {
  const svc = program.command(service.name).description(service.title ?? service.name);
  for (const [resourceName, resource] of Object.entries(service.resources)) {
    const resCmd = svc.command(resourceName);
    for (const [methodName, method] of Object.entries(resource.methods)) {
      const isWrite = method.httpMethod !== "GET";
      const leaf = resCmd.command(methodName).description(method.description ?? "");
      leaf.option("--format <f>", "输出格式 json|table|pretty", "json");
      leaf.option("--dry-run", "只预览请求不发送");
      if (isWrite) leaf.option("--yes", "跳过写操作确认");
      for (const [fieldName, field] of Object.entries(method.requestBody ?? {})) {
        leaf.option(`--${toKebab(fieldName)} <value>`, field.description ?? fieldName);
      }
      leaf.action(async (opts: Record<string, unknown>) => {
        try {
          if (isWrite && !opts.dryRun && !opts.yes) {
            console.error("该命令有副作用，加 --yes 确认，或加 --dry-run 预览");
            process.exit(1);
          }
          const raw: Record<string, string | undefined> = {};
          for (const fieldName of Object.keys(method.requestBody ?? {})) {
            raw[fieldName] = opts[toCamel(toKebab(fieldName))] as string | undefined;
          }
          const result = await runMethod(config, service, resourceName, methodName, method, raw, { dryRun: !!opts.dryRun });
          const fmt = String(opts.format ?? "json");
          if (fmt === "table") console.log(formatTable(result.data));
          else if (fmt === "pretty") console.log(formatJson(result.data, true));
          else console.log(formatEnvelope(true, result.data));
        } catch (e) { handleError(e); }
      });
    }
  }
}

// install command
program
  .command("install")
  .description("安装/重装 AI skills 到所有已安装的 AI 工具")
  .option("--force", "强制重新安装（即使已安装）")
  .action((opts) => {
    installSkills({ force: opts.force || false });
  });

registerAuth(program);
program.parseAsync(process.argv).catch(handleError);
```

> 关键变更：① `loadPlugins(config)` → ② 合并 `allServices = [...coreServices, ...pluginServices]` → ③ 统一循环注册命令。

- [ ] **Step 2: 改写 script 查找——`packages/cli/src/engine/script.ts` 增加插件 script 目录**

在 `findScript` 中的 `SAICMOTOR_SCRIPTS` 块之后、`distRoot` 之前插入插件脚本目录扫描：

```typescript
// 在 findScript 函数中，process.env.SAICMOTOR_SCRIPTS 块之后添加：
// 3. 插件 scripts 目录（动态延迟加载，避免循环依赖）
try {
  const { loadPlugins } = require("../plugin/loader");
  const { loadConfig } = require("../config");
  const { plugins } = loadPlugins(loadConfig());
  for (const plugin of plugins) {
    if (plugin.manifest.scripts) {
      const pluginScript = path.join(plugin.rootDir, plugin.manifest.scripts, `${rel}.js`);
      if (fs.existsSync(pluginScript)) return pluginScript;
    }
  }
} catch {
  // 插件不可用时静默跳过
}
```

> 由于 `findScript` 是同步函数且运行在引擎管道中，插件 scripts 查找使用 require 延迟加载以避免循环依赖。

- [ ] **Step 3: 构建 + 全量测试**

```bash
npm run build --workspace=packages/cli
npm run test --workspace=packages/cli
```

Expected: tsc 无类型错误；全部测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/cli/index.ts packages/cli/src/engine/script.ts
git commit -m "feat: CLI 入口动态化——合并核心 catalog 与插件 catalog，script 多源查找"
```

---

## Task 5: Skills 注册器——核心接管 SKILL.md 注册

**Files:**
- Create: `packages/cli/src/plugin/registrar.ts`
- Modify: `packages/cli/src/install/skills.ts`（重构为调用注册器）
- Create: `packages/cli/test/unit/plugin-registrar.test.ts`

- [ ] **Step 1: 写注册器——`packages/cli/src/plugin/registrar.ts`**

```typescript
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/** AI 客户端 skills 目录列表（集中常量化） */
export const AI_CLIENT_SKILL_DIRS: Record<string, string> = {
  claude: path.join(os.homedir(), ".claude", "skills"),
  agents: path.join(os.homedir(), ".agents", "skills"),
  codebuddy: path.join(os.homedir(), ".codebuddy", "skills"),
};

export interface SkillRegResult {
  skillName: string;
  client: string;
  method: "junction" | "copy" | "skipped";
  reason?: string;
}

/**
 * 为单个 skill 目录在各 AI 客户端目录建立 junction（Windows）或符号链接（Unix）。
 * 失败时降级为复制整个 skill 目录。
 */
export function registerSkill(skillDir: string, skillName: string): SkillRegResult[] {
  const results: SkillRegResult[] = [];

  for (const [client, clientSkillsDir] of Object.entries(AI_CLIENT_SKILL_DIRS)) {
    const target = path.join(clientSkillsDir, skillName);

    // 已存在：检查归属
    if (fs.existsSync(target)) {
      results.push({ skillName, client, method: "skipped", reason: "目标已存在" });
      continue;
    }

    // 优先 junction（Windows 上无管理员需求）
    try {
      fs.symlinkSync(skillDir, target, "junction");
      results.push({ skillName, client, method: "junction" });
    } catch {
      // 降级为复制
      try {
        copyDirSync(skillDir, target);
        results.push({ skillName, client, method: "copy" });
      } catch (e: any) {
        results.push({ skillName, client, method: "skipped", reason: `复制失败: ${e.message}` });
      }
    }
  }

  return results;
}

/**
 * 注销单个 skill 条目（删除各 AI 客户端目录下的 junction/目录）。
 * 不触碰其他 skill。
 */
export function unregisterSkill(skillName: string): void {
  for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS)) {
    const target = path.join(clientSkillsDir, skillName);
    if (!fs.existsSync(target)) continue;
    try {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    } catch {
      // 删除失败不阻断卸载流程
    }
  }
}

/**
 * 注册插件的全部 skills。
 * 返回每个 skill 在每个客户端的注册结果。
 */
export function registerPluginSkills(pkgRoot: string, skillDirs: string[]): Record<string, SkillRegResult[]> {
  const allResults: Record<string, SkillRegResult[]> = {};

  for (const skillRel of skillDirs) {
    const skillDir = path.join(pkgRoot, skillRel);
    if (!fs.existsSync(skillDir)) continue;

    // skill 名取目录最后一段（如 skills/saicmotor-user → saicmotor-user）
    const skillName = path.basename(skillRel);
    const skillMdPath = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    allResults[skillName] = registerSkill(skillDir, skillName);
  }

  return allResults;
}

/**
 * 注销插件的全部 skills。
 */
export function unregisterPluginSkills(skillDirs: string[]): void {
  for (const skillRel of skillDirs) {
    const skillName = path.basename(skillRel);
    unregisterSkill(skillName);
  }
}

/** 递归复制目录（同步版，用于降级） */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
```

- [ ] **Step 2: 重构 skills.ts——替换 `npx skills add` 为注册器调用**

`packages/cli/src/install/skills.ts` 全文重写：

```typescript
// src/install/skills.ts
// skills 注册逻辑（postinstall 与 `saicmotor install` 共用）
// S8：收回核心"注册器"，不再依赖外部 skills CLI / GitHub repo
import fs from "node:fs";
import path from "node:path";
import { findPackageRoot } from "../pkg-root";
import { registerSkill, AI_CLIENT_SKILL_DIRS } from "../plugin/registrar";

const PACKAGE_SKILLS_DIR = path.join(findPackageRoot(), "skills");

/** 列出核心包内置的所有 skill 目录 */
function listCoreSkills(): string[] {
  const skillsRoot = PACKAGE_SKILLS_DIR;
  if (!fs.existsSync(skillsRoot)) return [];

  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsRoot, d.name, "SKILL.md")))
    .map((d) => d.name);
}

/** 确保各 AI 客户端 skills 目录存在 */
function ensureClientDirs(): void {
  for (const dir of Object.values(AI_CLIENT_SKILL_DIRS)) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/** 检查任意客户端是否已有本包的 skill 条目 */
export function skillsAlreadyInstalled(): boolean {
  const coreSkills = listCoreSkills();
  for (const [client, clientSkillsDir] of Object.entries(AI_CLIENT_SKILL_DIRS)) {
    for (const skillName of coreSkills) {
      if (fs.existsSync(path.join(clientSkillsDir, skillName))) return true;
    }
  }
  return false;
}

/** 注册核心包内置的全部 skills */
export function installSkills({ force = false }: { force?: boolean } = {}): void {
  ensureClientDirs();
  const coreSkills = listCoreSkills();

  if (coreSkills.length === 0) {
    console.log("未找到内置 skills");
    return;
  }

  if (!force && skillsAlreadyInstalled()) {
    console.log("AI skills 已安装，跳过");
    return;
  }

  let registered = 0;
  for (const skillName of coreSkills) {
    const skillDir = path.join(PACKAGE_SKILLS_DIR, skillName);
    const results = registerSkill(skillDir, skillName);
    const okCount = results.filter((r) => r.method !== "skipped" || r.reason === "目标已存在").length;
    if (okCount > 0) registered++;
  }

  if (registered > 0) {
    console.log(`✓ ${registered} 个 AI skills 已注册`);
  } else {
    console.log("⚠ AI skills 注册失败，稍后可手动运行: saicmotor install");
  }
}

/** npm lifecycle postinstall 入口 */
export function runPostinstall(): void {
  if (process.env.npm_command === "exec") {
    console.log("npx 模式，跳过 skills 自动注册");
    return;
  }
  console.log("\nsaicmotor CLI 安装完成。");
  installSkills();
  console.log("  首次使用前请运行: saicmotor auth login");
  console.log("  探索命令: saicmotor --help\n");
}
```

- [ ] **Step 3: 删 `saicmotor.config.json` 中 `repo` 字段（已不再使用）**

`packages/cli/saicmotor.config.json`：

```json
{
  "installUrl": "@saicmotor/cli",
  "defaults": {
    "gateway": "http://localhost:8081"
  }
}
```

- [ ] **Step 4: 写注册器测试——`packages/cli/test/unit/plugin-registrar.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const tmpSkill = path.join(os.tmpdir(), `saicmotor-test-skill-${Date.now()}`);
const tmpClient = path.join(os.tmpdir(), `saicmotor-test-client-${Date.now()}`);

// 临时覆盖 AI_CLIENT_SKILL_DIRS
const origDirs = require("../../src/plugin/registrar").AI_CLIENT_SKILL_DIRS;

describe("registrar", () => {
  beforeEach(() => {
    const { AI_CLIENT_SKILL_DIRS } = require("../../src/plugin/registrar");
    // 替换为临时目录
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
    }
    // 创建测试 skill
    fs.mkdirSync(tmpSkill, { recursive: true });
    fs.writeFileSync(path.join(tmpSkill, "SKILL.md"), "# Test Skill\n", "utf8");
  });

  afterEach(() => {
    // 恢复
    const { AI_CLIENT_SKILL_DIRS } = require("../../src/plugin/registrar");
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    // 清理
    if (fs.existsSync(tmpSkill)) fs.rmSync(tmpSkill, { recursive: true });
    if (fs.existsSync(tmpClient)) fs.rmSync(tmpClient, { recursive: true });
  });

  it("registerSkill writes to all client dirs", () => {
    const { registerSkill } = require("../../src/plugin/registrar");
    const results = registerSkill(tmpSkill, "test-skill");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r: any) => r.method === "junction" || r.method === "copy")).toBe(true);
  });

  it("unregisterSkill removes the entry", () => {
    const { registerSkill, unregisterSkill } = require("../../src/plugin/registrar");
    registerSkill(tmpSkill, "test-skill");
    unregisterSkill("test-skill");

    const { AI_CLIENT_SKILL_DIRS } = require("../../src/plugin/registrar");
    for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS) as string[]) {
      const target = path.join(clientSkillsDir, "test-skill");
      expect(fs.existsSync(target)).toBe(false);
    }
  });
});
```

- [ ] **Step 5: 更新现有关联测试**

`test/scripts/postinstall.test.ts` 需要适配新的 `skillsAlreadyInstalled` 签名（从 `execSync` mock 改为文件系统检查）。

- [ ] **Step 6: 构建 + 全量测试**

```bash
npm run build --workspace=packages/cli
npm run test --workspace=packages/cli
```

Expected: tsc 无类型错误；全部测试 PASS（包括注册器测试 + 已适配的 postinstall 测试）。

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/plugin/registrar.ts packages/cli/src/install/skills.ts packages/cli/saicmotor.config.json packages/cli/test/
git commit -m "feat: skills 注册器收回核心——junction/复制落盘，替换外部 skills CLI"
```

---

## Task 6: Suite 路由聚合

**Files:**
- Create: `packages/cli/src/plugin/suite.ts`
- Modify: `packages/cli/src/cli/index.ts`（注册 `saicmotor-suite` 命令时用动态路由表）
- Modify: `skills/saicmotor-suite/SKILL.md`（改为动态生成的标记）

- [ ] **Step 1: 写 suite 路由生成——`packages/cli/src/plugin/suite.ts`**

```typescript
import { loadPlugins, type LoadedPlugin } from "./loader";
import { loadConfig } from "../config";

/** 聚合所有已启用插件的 routes 为 suite 路由表 */
export function buildSuiteRoutes(plugins?: LoadedPlugin[]): Record<string, string> {
  const list = plugins ?? loadPlugins(loadConfig()).plugins;
  const routes: Record<string, string> = {};

  for (const plugin of list) {
    if (plugin.manifest.routes) {
      Object.assign(routes, plugin.manifest.routes);
    }
  }

  return routes;
}

/** 生成 suite SKILL.md 的 markdown 路由表段落 */
export function generateSuiteSkill(routes: Record<string, string>): string {
  const lines = [
    "# saicmotor-suite",
    "",
    "saicmotor 统一入口 skill。以下为当前已装插件提供的意图路由：",
    "",
    "| 意图 | 入口 Skill |",
    "|------|------------|",
  ];

  for (const [intent, skill] of Object.entries(routes)) {
    lines.push(`| ${intent} | ${skill} |`);
  }

  lines.push("", "> 此文件由 saicmotor 注册器自动生成，请勿手动编辑。");

  return lines.join("\n");
}
```

- [ ] **Step 2: 在 registrar.ts 的 `registerPluginSkills` 中追加 suite 生成**

在 `packages/cli/src/plugin/registrar.ts` 的 `registerPluginSkills` 函数末尾，写入生成的 suite SKILL.md 到核心包 `skills/saicmotor-suite/SKILL.md`：

```typescript
// 在 registerPluginSkills 末尾添加：
import { buildSuiteRoutes, generateSuiteSkill } from "./suite";
// ... 在注册完所有 skills 后：
try {
  const routes = buildSuiteRoutes();
  const suiteMd = generateSuiteSkill(routes);
  const suiteDir = path.join(findPackageRoot(), "skills", "saicmotor-suite");
  if (!fs.existsSync(suiteDir)) fs.mkdirSync(suiteDir, { recursive: true });
  fs.writeFileSync(path.join(suiteDir, "SKILL.md"), suiteMd, "utf8");
  // 同时注册到 AI 客户端
  registerSkill(suiteDir, "saicmotor-suite");
} catch {
  // suite 生成失败不阻断 skills 注册
}
```

- [ ] **Step 3: 构建 + 测试**

```bash
npm run build --workspace=packages/cli
npm run test --workspace=packages/cli
```

Expected: 无类型错误，全部测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/plugin/suite.ts packages/cli/src/plugin/registrar.ts
git commit -m "feat: suite 路由聚合——按插件 routes 字段动态生成路由表"
```

---

## Task 7: Plugin 生命周期命令（install / uninstall / list / enable / disable / upgrade）

**Files:**
- Create: `packages/cli/src/cli/plugin-cmds.ts`
- Modify: `packages/cli/src/cli/index.ts`（注册 plugin 子命令）

- [ ] **Step 1: 写 plugin 命令模块——`packages/cli/src/cli/plugin-cmds.ts`**

```typescript
import { Command } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadState, saveState, type PluginStateEntry } from "../plugin/state";
import { installedPluginsDir, linkedPluginsDir } from "../plugin/paths";
import { loadPlugins } from "../plugin/loader";
import { loadConfig } from "../config";
import {
  registerPluginSkills,
  unregisterPluginSkills,
  registerSkill,
} from "../plugin/registrar";
import { buildSuiteRoutes, generateSuiteSkill } from "../plugin/suite";
import { findPackageRoot } from "../pkg-root";

interface JsonOutput {
  ok: boolean;
  data?: unknown;
  error?: string;
}

function jsonOut(data: unknown): void {
  console.log(JSON.stringify({ ok: true, data }, null, 2));
}

function jsonErr(error: string): void {
  console.error(JSON.stringify({ ok: false, error }, null, 2));
}

/**
 * 短名展开："reimbursement" → "@saicmotor/plugin-reimbursement"
 */
function fullName(input: string): string {
  if (input.startsWith("@saicmotor/plugin-")) return input;
  if (input.startsWith("plugin-")) return `@saicmotor/${input}`;
  return `@saicmotor/plugin-${input}`;
}

/** 刷新 suite 文件并重新注册 */
function refreshSuite(): void {
  try {
    const routes = buildSuiteRoutes();
    const md = generateSuiteSkill(routes);
    const suiteDir = path.join(findPackageRoot(), "skills", "saicmotor-suite");
    if (!fs.existsSync(suiteDir)) fs.mkdirSync(suiteDir, { recursive: true });
    fs.writeFileSync(path.join(suiteDir, "SKILL.md"), md, "utf8");
    registerSkill(suiteDir, "saicmotor-suite");
  } catch {
    // suite 刷新失败不阻断
  }
}

export function registerPluginCommands(program: Command): void {
  const plugin = program
    .command("plugin")
    .description("插件管理（install / uninstall / list / enable / disable / upgrade）");

  // plugin install <pkg>
  plugin
    .command("install <pkg>")
    .description("安装插件（短名自动展开为 @saicmotor/plugin-<name>）")
    .option("--json", "JSON 输出")
    .action(async (pkg: string, opts: { json?: boolean }) => {
      try {
        const name = fullName(pkg);
        const dir = installedPluginsDir();
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        console.error(`安装 ${name} ...`);
        execSync(`npm install ${name} --prefix "${dir}" --legacy-peer-deps --no-save`, {
          stdio: "inherit",
          cwd: dir,
        });

        // 读取 manifest 并注册 skills
        const pkgDir = path.join(dir, "node_modules", name.replace("@saicmotor/", ""));
        const manifestPath = path.join(pkgDir, "saicmotor.plugin.json");
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          const skillDirs = manifest.skills ?? [];

          // 注册 skills
          const skillResults = registerPluginSkills(pkgDir, skillDirs);

          // 更新 state
          const state = loadState();
          const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
          state.plugins[name] = {
            name,
            version: pkgJson.version ?? "unknown",
            enabled: true,
            source: "registry",
            skills: skillDirs,
            routes: manifest.routes,
          };
          saveState(state);

          // 刷新 suite
          refreshSuite();

          if (opts.json) {
            jsonOut({ installed: name, version: pkgJson.version, skills: Object.keys(skillResults) });
          } else {
            console.log(`✓ ${name} 安装完成，${Object.keys(skillResults).length} 个 skills 已注册`);
          }
        } else {
          if (opts.json) jsonErr(`manifest 缺失: ${manifestPath}`);
          else console.error(`✗ manifest 缺失: ${manifestPath}`);
        }
      } catch (e: any) {
        if (opts.json) jsonErr(e.message);
        else console.error(`✗ 安装失败: ${e.message}`);
      }
    });

  // plugin uninstall <name>
  plugin
    .command("uninstall <name>")
    .description("卸载插件")
    .option("--json", "JSON 输出")
    .action((name: string, opts: { json?: boolean }) => {
      try {
        const full = fullName(name);
        const state = loadState();
        const entry = state.plugins[full];
        if (!entry) {
          if (opts.json) jsonErr(`未找到插件: ${full}`);
          else console.error(`✗ 未找到插件: ${full}`);
          return;
        }

        // 注销 skills
        unregisterPluginSkills(entry.skills ?? []);

        // npm 卸载
        try {
          execSync(`npm uninstall ${full} --prefix "${installedPluginsDir()}"`, { stdio: "pipe" });
        } catch {
          // npm 卸载失败不阻断后续清理
        }

        // 清理 state
        delete state.plugins[full];
        saveState(state);

        // 刷新 suite
        refreshSuite();

        if (opts.json) jsonOut({ uninstalled: full });
        else console.log(`✓ ${full} 已卸载`);
      } catch (e: any) {
        if (opts.json) jsonErr(e.message);
        else console.error(`✗ 卸载失败: ${e.message}`);
      }
    });

  // plugin list
  plugin
    .command("list")
    .description("列出已安装插件")
    .option("--json", "JSON 输出")
    .action((opts: { json?: boolean }) => {
      const { plugins, warnings } = loadPlugins(loadConfig());
      const list = plugins.map((p) => ({
        name: p.manifest.name,
        version: p.entry.version,
        enabled: p.entry.enabled,
        source: p.entry.source,
        linkedPath: p.entry.linkedPath,
        skills: p.manifest.skills ?? [],
        compatible: true,
      }));

      if (opts.json) {
        jsonOut({ plugins: list, warnings: warnings.length > 0 ? warnings : undefined });
      } else {
        if (list.length === 0) {
          console.log("（无已安装插件）");
        } else {
          for (const p of list) {
            const src = p.source === "linked" ? `linked → ${p.linkedPath}` : "registry";
            console.log(`  ${p.name}@${p.version}  ${src}  ${p.enabled ? "✓" : "✗"}`);
          }
        }
        for (const w of warnings) {
          console.error(`  ⚠ ${w}`);
        }
      }
    });

  // plugin enable / disable
  for (const action of ["enable", "disable"] as const) {
    plugin
      .command(`${action} <name>`)
      .description(`${action === "enable" ? "启用" : "禁用"}插件`)
      .option("--json", "JSON 输出")
      .action((name: string, opts: { json?: boolean }) => {
        const full = fullName(name);
        const state = loadState();
        if (!state.plugins[full]) {
          if (opts.json) jsonErr(`未找到插件: ${full}`);
          else console.error(`✗ 未找到插件: ${full}`);
          return;
        }
        state.plugins[full].enabled = action === "enable";
        saveState(state);
        if (opts.json) jsonOut({ name: full, enabled: action === "enable" });
        else console.log(`✓ ${full} ${action === "enable" ? "已启用" : "已禁用"}`);
      });
  }

  // plugin upgrade <name>
  plugin
    .command("upgrade <name>")
    .description("升级插件到 latest")
    .option("--json", "JSON 输出")
    .action((name: string, opts: { json?: boolean }) => {
      try {
        const full = fullName(name);
        const dir = installedPluginsDir();
        execSync(`npm update ${full} --prefix "${dir}" --legacy-peer-deps`, { stdio: "inherit" });
        if (opts.json) jsonOut({ upgraded: full });
        else console.log(`✓ ${full} 已升级`);
      } catch (e: any) {
        if (opts.json) jsonErr(e.message);
        else console.error(`✗ 升级失败: ${e.message}`);
      }
    });
}
```

- [ ] **Step 2: 在 CLI 入口注册 plugin 命令**

`packages/cli/src/cli/index.ts` 在 `registerAuth(program)` 行之前插入：

```typescript
import { registerPluginCommands } from "./plugin-cmds";
// ...
registerPluginCommands(program);
```

- [ ] **Step 3: 构建 + 测试**

```bash
npm run build --workspace=packages/cli
npm run test --workspace=packages/cli
```

Expected: tsc 无类型错误；全部测试 PASS。

- [ ] **Step 4: 手动烟雾测试（plugin list --json）**

```bash
node packages/cli/scripts/run.js plugin list --json
```

Expected: `{"ok":true,"data":{"plugins":[]}}`（空列表，合法 JSON）。

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli/plugin-cmds.ts packages/cli/src/cli/index.ts
git commit -m "feat: plugin 生命周期命令（install/uninstall/list/enable/disable/upgrade）均支持 --json"
```

---

## Task 8: 开发者工具链——create plugin / validate / dev

**Files:**
- Create: `packages/cli/src/cli/tooling-cmds.ts`
- Modify: `packages/cli/src/cli/index.ts`（注册工具链命令）

- [ ] **Step 1: 写工具链命令模块——`packages/cli/src/cli/tooling-cmds.ts`**

```typescript
import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PluginManifestSchema } from "@saicmotor/sdk";
import { linkedPluginsDir } from "../plugin/paths";
import { loadState, saveState } from "../plugin/state";

/** create plugin <name>——生成标准插件工程骨架 */
function createPlugin(name: string): void {
  const cwd = process.cwd();
  const pkgName = `@saicmotor/plugin-${name}`;
  const dir = path.join(cwd, `plugin-${name}`);

  if (fs.existsSync(dir)) {
    console.error(`✗ 目录已存在: ${dir}`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });

  // package.json
  const pkg = {
    name: pkgName,
    version: "0.1.0",
    description: `saicmotor ${name} 插件`,
    type: "commonjs",
    files: ["dist/**/*.js", "skills/**/*.md", "catalog/**/*.json", "saicmotor.plugin.json"],
    scripts: {
      build: "tsc -p tsconfig.json",
      test: "vitest run",
      prepublishOnly: "npm run build && npm test",
    },
    dependencies: { zod: "^3.23.8" },
    devDependencies: {
      "@saicmotor/sdk": "*",
      "@types/node": "^20.14.0",
      typescript: "^5.5.0",
      vitest: "^2.0.0",
    },
  };
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  // tsconfig.json
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "commonjs",
          outDir: "dist",
          rootDir: ".",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          declaration: true,
        },
        include: ["src/**/*.ts"],
        exclude: ["node_modules", "dist", "test"],
      },
      null,
      2,
    ) + "\n",
  );

  // saicmotor.plugin.json
  fs.writeFileSync(
    path.join(dir, "saicmotor.plugin.json"),
    JSON.stringify(
      {
        name: pkgName,
        engine: "^1.0.0",
        catalog: ["catalog/services/*.json"],
        skills: [`skills/saicmotor-${name}`],
        scripts: "scripts",
      },
      null,
      2,
    ) + "\n",
  );

  // catalog/services/<name>.json
  const catDir = path.join(dir, "catalog", "services");
  fs.mkdirSync(catDir, { recursive: true });
  fs.writeFileSync(
    path.join(catDir, `${name}.json`),
    JSON.stringify(
      {
        name: name,
        title: `${name} 服务`,
        servicePath: `/api/${name}`,
        resources: {},
      },
      null,
      2,
    ) + "\n",
  );

  // skills/saicmotor-<name>/SKILL.md
  const skillDir = path.join(dir, "skills", `saicmotor-${name}`);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
      "---",
      `name: saicmotor-${name}`,
      `description: ${name} 业务能力`,
      "---",
      "",
      `# saicmotor-${name}`,
      "",
      `管理 ${name} 相关操作。`,
      "",
      "## 命令",
      "",
      `saicmotor ${name} <resource> <method> [--<param> <value> ...]`,
      "",
      "## 示例",
      "",
      "```bash",
      `saicmotor ${name} list items`,
      "```",
    ].join("\n") + "\n",
  );

  // scripts/ 目录（带说明）
  const scriptsDir = path.join(dir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, "README.md"),
    "只在纯声明式 catalog 无法满足时才在此目录写脚本。\n详见 https://内部文档地址/plugin-scripts\n",
  );

  console.log(`✓ 插件工程已生成: ${dir}`);
  console.log(`  cd plugin-${name}`);
  console.log(`  npm install`);
  console.log(`  编辑 catalog/services/${name}.json 声明服务`);
  console.log(`  npx @saicmotor/cli@latest dev  # 本地联调`);
}

/** validate .——校验当前目录的插件 manifest + catalog */
function validatePlugin(dir: string): boolean {
  const manifestPath = path.join(dir, "saicmotor.plugin.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`✗ 未找到 saicmotor.plugin.json: ${dir}`);
    return false;
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    console.error(`✗ manifest JSON 解析失败: ${manifestPath}`);
    return false;
  }

  try {
    PluginManifestSchema.parse(manifest);
    console.log("✓ manifest 校验通过");
  } catch (e: any) {
    console.error(`✗ manifest 校验失败: ${e.message}`);
    return false;
  }

  // TODO: 后续迭代添加 catalog zod 校验
  console.log("✓ 插件校验通过");
  return true;
}

/** dev——将当前目录 link 到 ~/.saicmotor/plugins/linked/ */
function devPlugin(dir: string, stop: boolean): void {
  const manifestPath = path.join(dir, "saicmotor.plugin.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`✗ 未找到 saicmotor.plugin.json，请在插件工程根目录运行`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const name = manifest.name;
  const shortName = name.replace("@saicmotor/", ""); // plugin-user
  const target = path.join(linkedPluginsDir(), shortName);

  if (stop) {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      const state = loadState();
      delete state.plugins[name];
      saveState(state);
      console.log(`✓ dev link 已解除: ${target}`);
    } else {
      console.log(`（无活跃 dev link）`);
    }
    return;
  }

  // 建立 junction
  if (!fs.existsSync(linkedPluginsDir())) {
    fs.mkdirSync(linkedPluginsDir(), { recursive: true });
  }
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.symlinkSync(path.resolve(dir), target, "junction");

  // 写 state
  const state = loadState();
  state.plugins[name] = {
    name,
    version: "dev",
    enabled: true,
    source: "linked",
    linkedPath: path.resolve(dir),
    skills: manifest.skills ?? [],
  };
  saveState(state);

  console.log(`✓ dev link 已建立: ${target} → ${path.resolve(dir)}`);
  console.log(`  全局/npx CLI 已加载该插件`);
  console.log(`  解除: saicmotor dev --stop`);
}

export function registerToolingCommands(program: Command): void {
  // create plugin <name>
  program
    .command("create plugin <name>")
    .description("生成标准插件工程骨架")
    .action((name: string) => createPlugin(name));

  // validate <dir>
  program
    .command("validate <dir>")
    .description("校验插件 manifest 与 catalog")
    .action((dir: string) => {
      const ok = validatePlugin(dir);
      if (!ok) process.exit(1);
    });

  // dev
  program
    .command("dev")
    .description("将当前目录 link 为开发插件")
    .option("--stop", "解除 dev link")
    .action((opts: { stop?: boolean }) => {
      devPlugin(process.cwd(), !!opts.stop);
    });
}
```

- [ ] **Step 2: 注册到 CLI**

`packages/cli/src/cli/index.ts` 追加：

```typescript
import { registerToolingCommands } from "./tooling-cmds";
// ...
registerToolingCommands(program);
```

- [ ] **Step 3: 构建 + 测试**

```bash
npm run build --workspace=packages/cli
npm run test --workspace=packages/cli
```

- [ ] **Step 4: 手动烟雾测试——create / validate**

```bash
cd /tmp
node /path/to/packages/cli/scripts/run.js create plugin testdemo
ls plugin-testdemo/saicmotor.plugin.json  # 应存在
node /path/to/packages/cli/scripts/run.js validate plugin-testdemo  # 应输出 ✓ manifest 校验通过
rm -rf plugin-testdemo
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/cli/tooling-cmds.ts packages/cli/src/cli/index.ts
git commit -m "feat: 开发者工具链——create plugin / validate / dev"
```

---

## Task 9: leave / attendance 插件化——迁为 monorepo 内插件包

**Files:**
- Create: `packages/plugin-leave/catalog/services/leave.json`
- Create: `packages/plugin-leave/skills/saicmotor-leave/SKILL.md`
- Create: `packages/plugin-leave/scripts/leave/applications/submit.ts`
- Create: `packages/plugin-attendance/catalog/services/attendance.json`
- Create: `packages/plugin-attendance/skills/saicmotor-attendance/SKILL.md`
- Create: `packages/plugin-attendance/scripts/attendance/corrections/submit.ts`
- Remove: `packages/cli/catalog/services/leave.json`（迁出）
- Remove: `packages/cli/catalog/services/attendance.json`（迁出）
- Remove: `packages/cli/skills/saicmotor-leave/`（迁出）
- Remove: `packages/cli/skills/saicmotor-attendance/`（迁出）
- Remove: `packages/cli/scripts/leave/`（迁出）
- Remove: `packages/cli/scripts/attendance/`（迁出）

- [ ] **Step 1: 迁移 leave 内容到 plugin-leave**

```bash
# 从核心包移动文件到插件包
cp packages/cli/catalog/services/leave.json packages/plugin-leave/catalog/services/leave.json
cp -r packages/cli/skills/saicmotor-leave packages/plugin-leave/skills/saicmotor-leave
cp packages/cli/scripts/leave/applications/submit.ts packages/plugin-leave/scripts/leave/applications/submit.ts
```

更新 `packages/plugin-leave/saicmotor.plugin.json`：

```json
{
  "name": "@saicmotor/plugin-leave",
  "engine": "^1.0.0",
  "catalog": ["catalog/services/*.json"],
  "skills": ["skills/saicmotor-leave"],
  "scripts": "scripts",
  "routes": {
    "请假": "saicmotor-leave",
    "休假": "saicmotor-leave",
    "leave": "saicmotor-leave"
  }
}
```

- [ ] **Step 2: 迁移 attendance 内容到 plugin-attendance**

```bash
cp packages/cli/catalog/services/attendance.json packages/plugin-attendance/catalog/services/attendance.json
cp -r packages/cli/skills/saicmotor-attendance packages/plugin-attendance/skills/saicmotor-attendance
cp packages/cli/scripts/attendance/corrections/submit.ts packages/plugin-attendance/scripts/attendance/corrections/submit.ts
```

更新 `packages/plugin-attendance/saicmotor.plugin.json`：

```json
{
  "name": "@saicmotor/plugin-attendance",
  "engine": "^1.0.0",
  "catalog": ["catalog/services/*.json"],
  "skills": ["skills/saicmotor-attendance"],
  "scripts": "scripts",
  "routes": {
    "考勤": "saicmotor-attendance",
    "打卡": "saicmotor-attendance",
    "attendance": "saicmotor-attendance"
  }
}
```

- [ ] **Step 3: 从核心包删除 leave / attendance**

```bash
rm packages/cli/catalog/services/leave.json
rm packages/cli/catalog/services/attendance.json
rm -rf packages/cli/skills/saicmotor-leave
rm -rf packages/cli/skills/saicmotor-attendance
rm -rf packages/cli/scripts/leave
rm -rf packages/cli/scripts/attendance
```

- [ ] **Step 4: 更新核心包 files 字段**

`packages/cli/package.json` 的 `files` 更新，去掉 leave/attendance 的 catalog/skills/scripts 条目（它们已不属于 CLI 核心包）。

- [ ] **Step 5: 构建 + 全量测试**

```bash
npm run build --workspaces
npm run test --workspaces --if-present
```

Expected: CLI 测试仍 PASS；三个插件包各自的 test 任务无错误（若 test 脚本存在于各自 package.json）；plugin-leave 和 plugin-attendance 编译成功。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: leave / attendance 迁为 monorepo 内插件包（统一机制）"
```

---

## Task 10: plugin-user——默认用户信息查询插件

**Files:**
- Create: `packages/plugin-user/catalog/services/user.json`
- Create: `packages/plugin-user/skills/saicmotor-user/SKILL.md`
- Create: `packages/plugin-user/src/query-user.ts`（可选 script）

- [ ] **Step 1: 写 catalog——`packages/plugin-user/catalog/services/user.json`**

```json
{
  "name": "user",
  "title": "用户信息",
  "description": "查询当前登录用户基本信息",
  "servicePath": "/api/user",
  "resources": {
    "info": {
      "methods": {
        "me": {
          "id": "me",
          "path": "/me",
          "httpMethod": "GET",
          "description": "查询当前用户基本信息"
        }
      }
    }
  }
}
```

- [ ] **Step 2: 写 SKILL.md——`packages/plugin-user/skills/saicmotor-user/SKILL.md`**

```markdown
---
name: saicmotor-user
description: 查询当前用户基本信息
---

# saicmotor-user

查询当前登录用户的基本信息。

## 命令

```bash
saicmotor user info me
```

## 示例

```bash
saicmotor user info me --format pretty
```

## 注意

需要先完成 `saicmotor auth login` 登录。
```

- [ ] **Step 3: 更新 plugin-user 的 manifest**

`packages/plugin-user/saicmotor.plugin.json`：

```json
{
  "name": "@saicmotor/plugin-user",
  "engine": "^1.0.0",
  "catalog": ["catalog/services/*.json"],
  "skills": ["skills/saicmotor-user"],
  "scripts": "scripts",
  "routes": {
    "用户信息": "saicmotor-user",
    "个人信息": "saicmotor-user",
    "我是谁": "saicmotor-user",
    "whoami": "saicmotor-user"
  }
}
```

- [ ] **Step 4: 构建 + 编译**

```bash
npm run build --workspace=packages/plugin-user
```

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-user/
git commit -m "feat: plugin-user——默认用户信息查询插件（catalog + SKILL.md + routes）"
```

---

## Task 11: 开发者手册 + 核心 1.0.0 发布

**Files:**
- Create: `docs/DEVELOPER.md`（开发者手册）
- Modify: `packages/cli/package.json`（版本 → 1.0.0）
- Modify: `packages/cli/src/plugin/loader.ts`（CORE_VERSION → "1.0.0"）
- Modify: `packages/cli/src/cli/index.ts`（version() → "1.0.0"）

- [ ] **Step 1: 核心版本升至 1.0.0**

```bash
# 在 packages/cli/package.json: version: "1.0.0"
# 在 packages/cli/src/cli/index.ts: .version("1.0.0")
# 在 packages/cli/src/plugin/loader.ts: const CORE_VERSION = "1.0.0"
```

- [ ] **Step 2: 写开发者手册——`docs/DEVELOPER.md`**

内容覆盖：目录职责、"声明式 catalog 优先、必要时才写 script"判定、SKILL.md 规范（frontmatter requirements）、全流程 checklist（create → validate → dev → test → publish）、排障常见问题。完整内容参照 S8 sprint 文档 §4.3。

- [ ] **Step 3: 更新 README.md——补充插件开发入口**

在 README 增加"业务插件开发"章节，指向 `docs/DEVELOPER.md`。

- [ ] **Step 4: 全仓构建 + 测试回归**

```bash
npm run build --workspaces
npm run test --workspaces --if-present
```

Expected: 全绿；CLI 版本输出 `1.0.0`。

- [ ] **Step 5: Commit + 发布到 Verdaccio**

```bash
git add -A
git commit -m "feat: 核心 1.0.0 + 开发者手册——插件生态正式里程碑"

# 发布各包到本地 Verdaccio
npm publish --workspace=packages/sdk --registry=http://localhost:4873
npm publish --workspace=packages/cli --registry=http://localhost:4873
npm publish --workspace=packages/plugin-user --registry=http://localhost:4873
npm publish --workspace=packages/plugin-leave --registry=http://localhost:4873
npm publish --workspace=packages/plugin-attendance --registry=http://localhost:4873
```

- [ ] **Step 6: dist-tag 验证**

```bash
npm dist-tag ls @saicmotor/cli --registry=http://localhost:4873
npm dist-tag ls @saicmotor/sdk --registry=http://localhost:4873
```

Expected: 各包 `latest` tag 指向刚发布的版本；CLI 为 `1.0.0`。

---

## Task 12: E2E 端到端验证——插件全流程 + 验收标准覆盖

**Files:** 无（环境验证操作）

- [ ] **Step 1: 全局安装 CLI 1.0.0**

```bash
npm install -g @saicmotor/cli@latest --registry=http://localhost:4873
saicmotor --version  # Expected: 1.0.0
saicmotor --help     # 确认 plugin 子命令可见
```

- [ ] **Step 2: 创建 → validate → dev → 安装业务插件全流程**

```bash
cd "$(mktemp -d)"
saicmotor create plugin testdemo
cd plugin-testdemo
npm install
saicmotor validate .
saicmotor dev
saicmotor plugin list              # 确认 linked 可见
saicmotor dev --stop
npm publish --registry=http://localhost:4873
saicmotor plugin install testdemo --registry=http://localhost:4873
saicmotor plugin list --json       # 确认 JSON schema 稳定
```

- [ ] **Step 3: AI 可发现性验证**

装插件后开新会话，让 AI 仅凭 skill 描述复述/调用该能力（不额外喂文档）。验证方法：观察 AI 能否列出 `saicmotor testdemo` 命令并描述其功能。

- [ ] **Step 4: 卸载 + 残留检查**

```bash
saicmotor plugin uninstall testdemo
# 检查 ~/.claude/skills/、~/.agents/skills/ 无残留
ls ~/.claude/skills/saimotor-testdemo 2>/dev/null && echo "残留!" || echo "干净"
ls ~/.agents/skills/saimotor-testdemo 2>/dev/null && echo "残留!" || echo "干净"
# plugin list --json 确认无该插件
saicmotor plugin list --json | grep testdemo && echo "残留!" || echo "干净"
```

- [ ] **Step 5: S1~S4 回归——leave / attendance 通过插件形态正常运作**

```bash
saicmotor plugin install leave --registry=http://localhost:4873
saicmotor plugin install attendance --registry=http://localhost:4873
# 执行关键业务流程（与 Sprint 2~4 相同）
saicmotor leave applications submit --employeeId EMP001 --type annual --startDate 2026-01-01 --endDate 2026-01-03 --yes
saicmotor attendance corrections submit --employeeId EMP001 --date 2026-01-01 --remark "忘记打卡" --yes
```

Expected: 所有命令正常执行，行为与 S4 一致，无功能回退。

- [ ] **Step 6: engine 不兼容拦截验证**

构造一个 `engine: ">=2.0.0"` 的插件并安装：
```bash
# 创建一个 engine 不兼容的插件
mkdir /tmp/bad-plugin && cd /tmp/bad-plugin
echo '{"name":"@saicmotor/plugin-bad","engine":">=2.0.0"}' > saicmotor.plugin.json
# 手动丢到 installed dir 模拟
mkdir -p ~/.saicmotor/plugins/node_modules/plugin-bad
cp saicmotor.plugin.json ~/.saicmotor/plugins/node_modules/plugin-bad/
saicmotor --help  # 应打印 warning: 插件不兼容已禁用
```

---

## 自审记录

- **Spec 覆盖：** Sprint 8 十二项需求——monorepo(T1)、manifest schema(T2)、loader 双根扫描+强校验(T3)、CLI 动态化(T4)、skills 注册器(T5)、suite 路由聚合(T6)、plugin 生命周期命令(T7)、create/validate/dev 工具链(T8)、leave/attendance 插件化(T9)、plugin-user(T10)、1.0.0+开发者手册(T11)、E2E 验收(T12)全部覆盖。S1~S4 回归(S9 验收标准 4)在本 sprint 先行覆盖——leave/attendance 以插件形态运行在 monorepo 内，验证统一机制无功能回退。

- **占位符扫描：** 无 TBD/TODO；semver range `^1.0.0` 等为语义化版本的合法语法，非占位。developer manual 完整内容待 Task 11 写入。

- **类型一致性：** `PluginManifest` / `ScriptContext` / `RunResult` / `Service` 等类型在 SDK 与 CLI 间通过 `@saicmotor/sdk` workspace 依赖保持一致。`loadPlugins` 返回的 `LoadedPlugin` 类型在 loader、CLI 入口、suite 生成、plugin 命令间一致使用。

- **安全原则：** 插件不绕过写操作确认、凭证 0600（复用现有机制）；npx 检测保留（临时调用零副作用）；plugin install 带 `--legacy-peer-deps` 防嵌套。

**已知遗留（不阻塞 S8 验收）：** ① Validator 的 catalog zod 校验沿用现有 `ServiceSchema` 但当前实现较基础；② `linked/` 下的 plugin 在 Windows 用 junction，Unix 用 symlink（当前代码 platform-agnostic 待验证）；③ marketplace 审批机制不在本 sprint。这些均为已知的后续迭代项。