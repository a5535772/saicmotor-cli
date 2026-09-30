# 发生了什么 · 第四讲：instanceof 的陷阱——为什么两个名字相同的类不等于同一个类

> **修复编号：L6** | **严重度：🟡** | **改前分支：master@453a827**

---

## 认识这个 bug：一种写了但没生效的错误处理

### 场景

用户在 CLI 里运行 `saicmotor leave submit --type 年假 --days 5`。流程是这样的：

1. CLI 加载插件 `@saicmotor/plugin-leave`，找到脚本 `leave/applications/submit.js`。
2. 用 `executeScript(file, ctx)` 执行这个脚本。
3. 脚本里发起 `fetch()` 到请假网关，网关返回 HTTP 500。
4. 脚本抛了一个错误。

现在问两个问题：

**问题一：** 脚本抛的是什么错误？

改造前的插件脚本用的是自己定义的错误类：

```ts
// packages/plugin-leave/scripts/leave/applications/submit.ts
class UpstreamError extends Error {
  constructor(
    public readonly code: string,   // ← 注意：分类字符串被塞进了 code 字段
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

// 使用处
if (resp.status >= 400) {
  throw new UpstreamError("upstream", `上游 HTTP ${resp.status}`);
}
```

**问题二：** CLI 的全局错误处理器怎么判断这是"上游错误"还是"未知错误"？

改造前的 `handleError` 用的是 `instanceof`：

```ts
// packages/cli/src/cli/error.ts（改造前）
import { SaicmotorError } from "../engine/errors";

export function handleError(e: unknown): void {
  if (e instanceof SaicmotorError) {
    console.error(/* 格式化输出 */);
    process.exit(e.exitCode);      // 按错误分类退出（2/3/4/5/6）
    return;
  }
  console.error(String(e));
  process.exit(1);
}
```

### 漏洞

插件抛的是 `UpstreamError`——**不是** `SaicmotorError`。所以 `e instanceof SaicmotorError` 永远是 `false`。`handleError` 会走 fallback 路径，把错误变成 `console.error(String(e))` + `process.exit(1)`。

也就是——网关 500、请假失败，用户看到的是：

```
Error: 上游 HTTP 500
```

不会显示格式化 envelope、不会按 upstream 的 exit code 5 退出、上游错误码和提示被完全丢弃。**L6 的本质不是"错误信息不好看"，而是整个错误分类体系对插件不生效。**

### 但等等——即使插件改成抛 `SaicmotorError`，`instanceof` 也会失效

这里有一个更深层的问题。看发布后的 `node_modules` 拓扑：

```
SAICMOTOR_HOME/
├── node_modules/
│   └── @saicmotor/cli/
│       └── node_modules/
│           └── @saicmotor/sdk/     ← CLI 自己的 SDK 副本（类 A）
│               └── src/error.js
└── plugins/
    └── node_modules/
        └── @saicmotor/plugin-leave/
            └── node_modules/
                └── @saicmotor/sdk/ ← 插件的 SDK 副本（类 B）
                    └── src/error.js
```

**两类是从两份不同的 `error.js` 加载的，JavaScript 把它们视为完全不同的类。**

`A.error.js` 里的 `class SaicmotorError` 和 `B.error.js` 里的 `class SaicmotorError` ——即使源代码一字不差——在 JavaScript 的类型系统里是**两个不同的身份**。B 创建的实例，`instanceof A` 返回 `false`。

这就是 npm 生态里跨包类型检测最经典的陷阱——原因不是代码错了，而是**物理上分属两个 `require()` 解析路径了**。

## 原理：身份判断 vs 结构判断

`instanceof` 回答的问题是："这个对象是从那个构造函数的原型链里出来的吗？" —— 它检查的是运行时原型链，而不是对象的 shape。

「结构判断」回答的是另一个问题："这个对象长什么样？" —— 它检查的是属性是否存在、类型是否匹配。结构判断不关心对象是从哪个文件 `new` 出来的，只关心它有没有 `category` 字段是不是 string、`exitCode` 字段是不是 number。

在 monorepo 本地开发时，npm workspaces 把所有包都 link 到 root `node_modules`——`instanceof` 巧合般生效。在 published 安装后，两份独立的 `node_modules` 把 `instanceof` 撕成两半。

**修复这个 bug 的方法不是"提前预判会不会有两份 SDK"——而是"接受它一定会发生，用结构判断替代身份判断"。**

## 代码改造

### Step 1：把 `SaicmotorError` 搬到 SDK——它应该是公共契约的一部分

```ts
// packages/sdk/src/error.ts（新建——一字不易地从 CLI 的 engine/errors.ts 搬入）
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

export class SaicmotorError extends Error {
  readonly category: ErrorCategory;
  readonly hint?: string;
  readonly upstream?: UpstreamInfo;

  constructor(category: ErrorCategory, message: string, opts: { hint?: string; upstream?: UpstreamInfo } = {}) {
    super(message);
    this.name = "SaicmotorError";
    this.category = category;
    this.hint = opts.hint;
    this.upstream = opts.upstream;
  }

  get exitCode(): number {
    return EXIT_CODES[this.category];
  }
}
```

SDK 的 `index.ts` 同时导出值和类型：

```ts
export { SaicmotorError, EXIT_CODES } from "./error";
export type { ErrorCategory, UpstreamInfo } from "./error";
```

### Step 2：CLI 删掉自己的 `engine/errors.ts`——彻底消灭本地副本

所有 12 个 import 站点的 `from "./errors"` / `from "../engine/errors"` 全改 `from "@saicmotor/sdk"`。CLI 侧不再拥有「自己的」`SaicmotorError` 定义——它向外界不再单独发声。

### Step 3：把 `instanceof` 换成结构判断

```ts
// packages/cli/src/cli/error.ts（改造后）
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
    console.error(formatEnvelope(false, undefined, {
      type: e.category,
      message: e.message,
      hint: e.hint,
      upstream: e.upstream,
    }));
    process.exit(e.exitCode);
    return;
  }
  console.error(String(e));
  process.exit(1);
}
```

`import { type SaicmotorError }` + 类型谓词 `e is SaicmotorError` 仍然让 TypeScript 在 guard 内部把 `e` 当成 `SaicmotorError` 来用（`.category`、`.exitCode`、`.hint` 等都有自动补全），但编译后这个 import 被完全擦除——**运行时不依赖任何类的原型链**。

### Step 4：插件不再有"自己的"错误类

两个插件脚本（leave + attendance）本地定义的 `class UpstreamError extends Error` 全部删除：

```diff
// packages/plugin-leave/scripts/leave/applications/submit.ts
- class UpstreamError extends Error {
-   constructor(
-     public readonly code: string,
-     message: string,
-   ) {
-     super(message);
-     this.name = "UpstreamError";
-   }
- }

  import type { ScriptContext, ScriptFn, RunResult } from "@saicmotor/sdk";
+ import { SaicmotorError } from "@saicmotor/sdk";

  // ...
-   throw new UpstreamError("upstream", `上游 HTTP ${resp.status}`);
+   throw new SaicmotorError("upstream", `上游 HTTP ${resp.status}`);
```

注意：老代码把分类字符串 `"upstream"` 塞进了 `code` 字段——这是 `UpstreamError` 自定义的参数顺序，结构判断根本不会看它。新代码把 `"upstream"` 传入 `SaicmotorError` 的正确位置——`category` 参数，结构判断会认出它。

### Step 5：插件把 `@saicmotor/sdk` 从 dev 依赖变成运行时依赖

```diff
  "devDependencies": {
-   "@saicmotor/sdk": "*",
  },
  "dependencies": {
+   "@saicmotor/sdk": "*",
  }
```

脚本现在在运行时 `require("@saicmotor/sdk")`——不是类型注解，是真实 `require`。`published` 安装后插件的 `node_modules` 里必须有一份 SDK。同时这是整个 TWO-SDK-COPIES 难题的起点——但结构判断让它变成了无害的——两份 SDK 是两份独立的 `SaicmotorError` 类，但 `isSaicmotorError` 不关心。

## 这一讲的核心知识点

**不要用 `instanceof` 对跨包共享的类型做运行时判断。** npm 生态里 `node_modules` 是嵌套且可能增长的，同一个 npm 包在运行时环境中可能存在多份——各部分互不可见。`instanceof` 只能在同一段文件系统的同一个模块字典中生效。

**解决方案不是阻止两份 SDK 出现——是拥抱它的必然性。** 结构判断接受"我无法控制调用者从哪份 copy 构造了这个对象"这个现实，选择只看对象长什么样，不看它从哪来。这就是「鸭子类型」在运行时错误处理里的一次经典应用：如果它长得像 `SaicmotorError`，走得像 `SaicmotorError`，它就是 `SaicmotorError`——不用问它妈是谁。

**一直记着这一点：** 你在本地开发时 `node_modules` 所有包被 workspace 提升到根——一切看起来正常——但你的用户执行 `npm install -g @saicmotor/cli` 时没有任何提升，你的跨包判断在那一刻决定生死。


*下一讲：[05 - 一次路径穿越](发生了什么-05-一次路径穿越.md)：一个动态 import 给了用户触摸文件系统的能力。*