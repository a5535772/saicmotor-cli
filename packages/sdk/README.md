# @saicmotor/sdk

> saicmotor 插件开发工具箱——类型定义、Zod schema、helper 函数。插件开发者唯一需要 import 的包。

---

## 安装

```bash
npm install @saicmotor/sdk --registry=<内部 registry>
```

插件开发时放在 `devDependencies` 即可，运行时类型由 CLI 引擎注入。

---

## 导出的类型

```ts
import type {
  PluginManifest,   // saicmotor.plugin.json 的类型
  ScriptContext,    // 插件脚本执行上下文
  ScriptFn,         // 脚本默认导出函数签名
  RunResult,        // 脚本返回值 { ok: true, data: unknown }
  Service, Method, Resource, Field,  // catalog 声明类型
  Config                             // 插件脚本可见的配置子集（仅 gateway）
} from "@saicmotor/sdk";
```

---

## 导出的工具

```ts
import {
  PluginManifestSchema,  // manifest 的 Zod schema（用于校验）
  validateManifest,      // 校验 manifest 对象，抛 ZodError 或返回 parsed
  definePlugin,          // 类型安全的 manifest 构造助手
} from "@saicmotor/sdk";
```

---

## 写 manifest

```ts
// saicmotor.plugin.ts（构建脚本用）
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

---

## 写脚本

```ts
// scripts/my-system/items/create.ts
import type { ScriptFn } from "@saicmotor/sdk";

const create: ScriptFn = async (ctx) => {
  console.error("[script] 自定义校验通过");

  if (ctx.dryRun) {
    return { ok: true, data: { dryRun: true, note: "preview" } };
  }

  const token = await ctx.ensureToken();
  const url = `${ctx.config.gateway}${ctx.service.servicePath}${ctx.method.path}`;

  const resp = await fetch(url, {
    method: ctx.method.httpMethod,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(ctx.values),
  });

  const json = await resp.json();
  return { ok: true, data: json?.data };
};

export default create;
```

`ctx` 中可用的字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `config` | `Config` | 当前配置（仅 gateway） |
| `service` | `Service` | 当前 service 的 catalog 定义 |
| `method` | `Method` | 当前 method 的 catalog 定义 |
| `values` | `Record<string, unknown>` | 用户输入的参数（已做类型转换） |
| `dryRun` | `boolean` | 是否 `--dry-run` 模式 |
| `ensureToken()` | `() => Promise<string>` | 获取认证 token（缓存优先） |

脚本必须默认导出 `(ctx: ScriptContext) => Promise<RunResult>`。