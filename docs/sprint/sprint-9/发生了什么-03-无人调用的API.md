# 发生了什么 · 第三讲：一个无人调用的 API

> **修复编号：C7（含 A3）** | **严重度：🟢** | **改前分支：master@453a827**

---

## 认识这个 bug：SDK README 隆重推荐，但整个仓库没有一行代码用

去看改造前 `@saicmotor/sdk` 的 README——"写 manifest"一节完整展示了一个 `definePlugin` 用法：

```ts
import { definePlugin } from "@saicmotor/sdk";

export default definePlugin({
  name: "@saicmotor/plugin-my-system",
  engine: "^0.8.0",
  catalog: ["catalog/services/*.json"],
  skills: ["skills/saicmotor-my-system"],
  scripts: "scripts",
  routes: { "我的系统": "saicmotor-my-system" },
});
```

然后去看它的实现：

```ts
/** 类型安全的 manifest 构造助手 */
export function definePlugin(m: PluginManifest): PluginManifest {
  return PluginManifestSchema.parse(m);
}
```

**这函数做的事情 = 把参数递给 zod schema 的 `.parse()`，然后返回结果。** 它不转换、不默认填入、不校验别名——它就是一个一行的 wrapper。

我们把这叫「极简 wrapper 反模式」：

```
function f(x: T): T { return doTheThing(x); }
```

它的唯一价值是"让调用者少写一个 import"——但代价是 SDK 的公共 API 表面积 +1，README 的认知负担 +5 行，以及每个插件开发者必须做一个决定「我该用 `definePlugin` 还是直接用 `PluginManifestSchema.parse()`？」

## 还有一个隐藏 bug

定义 `definePlugin` 和 `validateManifest` 这两个函数时，实现者写了两遍：

```ts
// manifest.ts 第 24-26 行
export function validateManifest(raw: unknown): PluginManifest {
  return PluginManifestSchema.parse(raw);
}

// manifest.ts 第 28-31 行
export function definePlugin(m: PluginManifest): PluginManifest {
  return PluginManifestSchema.parse(m);
}
```

两个函数唯一的区别是参数类型——`validateManifest` 接收 `unknown`（对未校验输入做 parse），`definePlugin` 接收 `PluginManifest`（对已构造的值做 parse）。

那 `definePlugin` 的「类型安全」承诺其实是空的：它的参数类型是 `PluginManifest` ——但如果参数**不**满足 schema（比如执行时一个 JSON 文件里的值被 cast 成了 `PluginManifest` 但缺失了 `name` 字段），`PluginManifestSchema.parse(m)` 照样会抛 `ZodError`。TypeScript 的结构类型系统在运行时等于不存在——它只是在编译期做了一个好意的承诺，但 `definePlugin` 的代价恰恰是让新人以为这种保护在运行时也存在。

## 原理：死代码的隐性税

每一行导出给外部的代码都在缴税：

| 税种 | 谁在交 |
|------|--------|
| **维护税** | 每次改 `PluginManifest` 的类型，你都要考虑 `definePlugin` 要不要跟着动 |
| **测试税** | 每个导出的 symbol 都应该有测试——`definePlugin` 确实有两个用例（"接受有效 manifest"+"拒绝无效 manifest"），但这两个测试和 `validateManifest` 的用例几乎完全重叠 |
| **认知税** | 每个新来的插件开发者在文档里看到两个可以做同样事的函数，必须停下来思考「我该用哪个」 |
| **废弃税** | 当你最终决定移除一个公共 API 时，它是一个 breaking change——即使没有人用它 |

对于 `definePlugin`，全部税收大于零，产出等于零——这是个纯赤字。

## 代码改造

```diff
// packages/sdk/src/manifest.ts（改造后）

- /** 类型安全的 manifest 构造助手 */
- export function definePlugin(m: PluginManifest): PluginManifest {
-   return PluginManifestSchema.parse(m);
- }
// ← 这 3 行彻底删除
```

```diff
// packages/sdk/src/index.ts（改造前）
- export { PluginManifestSchema, validateManifest, definePlugin } from "./manifest";

// packages/sdk/src/index.ts（改造后）
+ export { PluginManifestSchema, validateManifest } from "./manifest";
```

测试里的两个 `definePlugin` 用例一并删除（它们是 `validateManifest` 用例的真子集）。README 里的「写 manifest」整段 TS 示例也改成了一句话：manifest 是 JSON 文件，无需 TS 构造助手。

## 这一讲的核心知识点

**一个导出函数的税收，不因为它没人用而减免。** 税收按表面积算——每一行 `export` 都在向系统的所有未来维护者借钱。YAGNI（You Aren't Going to Need It）的反面不是「写了也无害」——它是「不删就有害」：

> 你不是「还没需要它」——你只是还没发现这条 API 在悄悄收税。

当一个函数可以删掉而没有任何测试变红时，你可能不是在删功能，是在删债务。


*下一讲：[04 - instanceof 的陷阱](发生了什么-04-instanceof的陷阱.md)：当一个插件和 CLI 各自 `npm install` 了一份 `@saicmotor/sdk`……*