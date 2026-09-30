# Sprint 10 — 版本号管理体系：设计文档

> **状态**：⚪ 设计阶段 | **创建于**：2026-09-30 | **来源**：sprint-10-versioning-management.md

## 目标

1. **版本号单一真相源**：`packages/cli/package.json` → `version` 是整个体系的唯一权威值。CLI 的所有版本消费点（program.version、suite SKILL.md、loader engine 校验）动态读取它；SDK 在 publish 前自动同步。
2. **消除 0.x 阶段 `^` 跨小版本陷阱**：脚手架生成插件的 `engine` 字段用 `>=x.y.z`（开放上界），使得 CLI 从小版本升级时旧插件不被禁用。
3. **沉淀同步脚本**：一个 `scripts/sync-versions.mjs` 负责 CLI→SDK 的版本号拷贝。

## 架构：版本号的流向

```
packages/cli/package.json → version: "x.y.z"     ← 唯一真相源
        │
        ├─ 运行时读取 ──→ src/version.ts → getCoreVersion()
        │                    ├── loader.ts: engine 兼容校验（已有）
        │                    ├── index.ts: program.version()（改）
        │                    └── suite.ts: SKILL.md version 字段（改）
        │
        ├─ 构建时注入 ──→ tooling-cmds.ts 脚手架模板
        │                    ├── engine: ">=x.y.z"（改 ^ → >=）
        │                    └── @saicmotor/sdk: ">=x.y.z"（改 ^ → >=）
        │
        └─ publish 时同步 ─→ packages/sdk/package.json → version（同步脚本覆写）
```

## 分项设计

### 1. 公共版本读取函数

将 `readCoreVersion()` 从 `packages/cli/src/plugin/loader.ts:62` 提取到新文件 `packages/cli/src/version.ts`，导出为 `getCoreVersion()`。

**理由**：
- `loader.ts` 不是版本号的天然所有者——它只是第一个消费者。
- `index.ts`、`suite.ts`、`tooling-cmds.ts` 都需要读 version，但不应依赖 `loader.ts`。

**实现**：

```ts
// packages/cli/src/version.ts
import { readFileSync } from "fs";
import { resolve } from "path";

let cached: string | null = null;

export function getCoreVersion(): string {
  if (cached !== null) return cached;
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(__dirname, "..", "package.json"), "utf-8")
    );
    cached = pkg.version ?? "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}
```

`loader.ts` 改为 `import { getCoreVersion } from "../version"`，`CORE_VERSION` 变量不变但值来源换为新函数。运行时行为零变化。

### 2. program.version() 动态读取

```diff
// packages/cli/src/cli/index.ts
+ import { getCoreVersion } from "../version";

- program.name("saicmotor").description("...").version("0.8.0");
+ program.name("saicmotor").description("...").version(getCoreVersion());
```

### 3. suite SKILL.md 版本注入

```diff
// packages/cli/src/plugin/suite.ts
+ import { getCoreVersion } from "../version";

- "version: 0.8.0",
+ `version: ${getCoreVersion()}`,
```

### 4. 脚手架 engine 字段：`^` → `>=`

```diff
// packages/cli/src/cli/tooling-cmds.ts — init 命令生成 saicmotor.plugin.json
+ import { getCoreVersion } from "../version";
+ const CORE_VERSION = getCoreVersion(); // 模块顶层计算一次

- engine: "^0.8.0",
+ engine: `>=${CORE_VERSION}`,
```

```diff
// packages/cli/src/cli/tooling-cmds.ts — init 命令生成 package.json
- "@saicmotor/sdk": "^0.8.0",
+ "@saicmotor/sdk": `>=${CORE_VERSION}`,
```

**注意**：`CORE_VERSION` 在模块顶层计算——init 命令的执行时机确保 `package.json` 一定存在。

### 5. SDK 版本同步脚本

新文件 `scripts/sync-versions.mjs`：

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

sdkPkg.version = cliPkg.version;
writeFileSync(sdkPkgPath, JSON.stringify(sdkPkg, null, 2) + "\n");

console.log(`Synced SDK version → ${cliPkg.version}`);
```

根 `package.json` 的 scripts 加：

```json
"sync-versions": "node scripts/sync-versions.mjs"
```

### 6. 现有插件不动

`packages/plugin-leave/saicmotor.plugin.json`、`packages/plugin-attendance/saicmotor.plugin.json`、`packages/plugin-user/saicmotor.plugin.json` 的 `"engine": "^0.8.0"` 保持原样。

- 这些已发布或即将发布的版本声明 `^0.8.0`，在当前 0.8.0 环境下生效正常。
-  0.9.0 时单独处理升级策略——不在本次 sprint 范围内。

### 7. 测试适配

**原则**：测试中的版本号硬编码改为从 `version.ts` 动态获取（workspace 环境能正确解析），或使用明确的测试常量。

**改法**：

| 文件 | 现状 | 改为 |
|------|------|------|
| `plugin-cmds.test.ts` | 多处硬编码 `"0.8.0"` 版本字符串 | `import { getCoreVersion } from "../../src/version"` + 断言用 `getCoreVersion()` |
| `tooling-cmds.test.ts:85` | `expect(manifest.engine).toBe("^0.8.0")` | `expect(manifest.engine).toBe(">=...")` 或以 `>=` 开头断言 |
| `tooling-cmds.test.ts` | 多处硬编码 `"^0.8.0"` 写文件 | 用 `getCoreVersion()` 构造 `>=` 值 |
| `plugin-registrar.test.ts` | fixture 里 `version: "0.8.0"` | 改为 `getCoreVersion()` 或固定测试常量 |
| `script.test.ts` | fixture 里 `engine: "^0.8.0"` | 用 `getCoreVersion()` 构造 |
| `state.test.ts` | fixture 里 `version: "0.8.0"` + 断言 | 用 `getCoreVersion()` 替代 |

核心思路：测试断言不再依赖 `"0.8.0"` 这个魔法字符串——它们要么跟真实版本号走，要么用明显的 test constant。未来版本号变化时测试零改动。

## 不做

- 不建 CI publish pipeline
- 不改 plugin-leave/plugin-attendance/plugin-user 现有 manifest 的 engine 字段
- 不实现双向 engine 校验
- 不跳 1.0

## 验收标准

1. `node -e "require('./packages/cli/dist/version').getCoreVersion()"` 返回当前 CLI 版本号
2. `saicmotor --version` 输出与 `packages/cli/package.json` 的 `version` 一致
3. `saicmotor init test-plugin` 生成 `engine: ">=0.8.0"`（当前版本动态值）
4. `npm run sync-versions` 将 SDK 的 `version` 与 CLI 同步
5. 现有测试全绿（`npm test`）

## 关联文档

- [Sprint 10 需求文档](../sprint-10/sprint-10-versioning-management.md)
- [端到端架构设计（S7/S8/S9）](../sprint-1-8/sprint-7-2026-09-23-scoped-distribution-plugin-architecture.md)
- [TODO 清单](../sprint-quick/todo.md)