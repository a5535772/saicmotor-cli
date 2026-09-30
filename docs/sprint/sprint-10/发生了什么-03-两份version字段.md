# 发生了什么 · 第三讲：两份 version 字段——CLI 和 SDK 共用版本号但各写各的

> **Sprint 10 — 修复 3/4 | 改前分支：master@f8f20b0**

---

## 认识这个 bug

`saicmotor-cli` 的 monorepo 里有两个独立的 npm 包：

```
packages/cli/package.json   → "version": "0.8.0"
packages/sdk/package.json   → "version": "0.8.0"
```

架构决策（来自 Sprint 9）明确规定：**CLI 和 SDK 永远同步发版、永远同版本号。** 一个版本号、两个包——这是正确的设计：当用户说"我用的是 CLI 0.8.0"，对应的 SDK 也必须是 0.8.0——用户不需要分别追踪两个版本号。

但现在这个约束的落地点只有"开发者记得手动改"：

```
发版流程（改造前）：
1. 改 packages/cli/package.json → version: "0.9.0"
2. 改 packages/sdk/package.json → version: "0.9.0"   ← 手动，两处
3. 改 index.ts 里的 version("0.8.0")                  ← 手动，三处
4. 改 suite.ts 里的 "version: 0.8.0"                  ← 手动，四处
5. 改 tooling-cmds.ts 里的两处 "^0.8.0"               ← 手动，六处
6. npm publish（还记得的话）
```

这只是常规发版——如果发一个 hotfix 只动 CLI 或只动 SDK（理论上违反同版本号原则，但在紧急情况下可能发生），那版本号的不一致就会被发布出去。

这里的核心问题不是"有人会忘"——是**没有任何机制阻止遗忘**。没有脚本校验、没有 pre-publish hook、没有 CI 检查。版本号一致性 100% 依赖于人类的注意力。

## 原理：自动化不是效率工具，是可靠性工具

有人会想：这是不是过度工程化了？一个版本号而已，手动改就手动改呗。

但考虑下面这个场景：

> 一年后，新来的维护者修了一个 SDK 的紧急 bug。ta 改了 `packages/sdk/package.json` → `version: "0.8.1"`，`npm publish packages/sdk`——因为 ta 不知道"同版本号"这个约束。CLI 还是 0.8.0，SDK 变成了 0.8.1。"同版本号"约束被静默打破——用户运行 `saicmotor --version` 看到 0.8.0，但实际 SDK 是 0.8.1。

这种不一致不会报错——semver 校验和 engine 字段都不关心 SDK 版本——但它破坏了用户的理解模型。"我用的是 0.8.0"变成了一句不精确的话。

**自动化不替代记忆——它替代注意力的唯一性。** 当一个约束不经过自动化时，它必须每一次都被注意——而人不能每一次都注意同一个事。

## 代码改造

### sync-versions.mjs

一个独立的 `.mjs` 脚本（Node.js ESM 模块），在 publish 前调用：

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

逻辑四步：读 CLI → 读 SDK → 如果一致就不动 → 如果不一致就覆写。

几个设计细节：

1. **幂等。** 多次运行不会累积副作用——如果版本号已经一致，第二次运行只是打印 "already" 并退出。这意味着它可以被放在 `prepublishOnly` 里，不会因为重复运行而出问题。

2. **不处理错误。** 如果 `packages/cli/package.json` 不存在，脚本直接抛 `ENOENT` 并退出。这是有意为之——同步脚本是 publish-prep helper，不是运行时服务。如果 `package.json` 在 publish 时刻不存在，那么整个 publish 流程本来就应该 fail。

3. **`JSON.stringify(sdkPkg, null, 2) + "\n"`。** 保留 2-space indent 和末尾换行——这是 `package.json` 的标准格式。不加上末尾换行的话，git diff 会多一行噪音。

### 根 package.json

```diff
  "scripts": {
+   "sync-versions": "node scripts/sync-versions.mjs",
  }
```

### 发版流程（改造后）

```
1. 改 packages/cli/package.json → version: "0.9.0"
2. npm run sync-versions          ← 自动同步 SDK
3. npm publish packages/sdk
4. npm publish packages/cli
```

从 6 步减到 4 步。手动改点从 6 个减到 1 个。SDK 的版本号永远不会和 CLI 的不一致——因为它是通过脚本从 CLI 派生出来的，不是开发者独立写的。

## 这一讲的核心知识点

**"别忘了"是工程上最弱的约束——强于"没有人记得"，弱于一切自动化。** 约束的强度从高到低依次是：编译期检查 → 运行时断言 → 自动化脚本 → checklist → 记忆。版本号一致性的约束从"记忆"提到了"自动化脚本"——仍然不是编译期检查（这一点可能与 Lerna/Changesets 之类的 monorepo 工具有关，这是未来的优化空间），但比"人类记忆"强了一个量级。

**脚本不是代码——是发射器。** `sync-versions.mjs` 只有 20 行，它不引入新依赖、不修改任何业务逻辑。但它解决了一个结构性风险：两个包共享一个逻辑版本号，但物理上有各自独立的 `package.json`。这个物理约束无法被设计消除——Node.js 生态要求每个包各自有 `version` 字段——只能用工具来桥接。


*下一讲（最后一讲）：[04 - 测试里的魔术字符串](发生了什么-04-测试里的魔术字符串.md)：5 个测试文件中硬编码了约 20 处 `"0.8.0"`——当版本号改变时，测试逻辑不需要改变，但所有魔术字符串都要改。*