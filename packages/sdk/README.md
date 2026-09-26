# @saicmotor/sdk

saicmotor 插件开发 SDK：类型、schema、测试 helper。

## 安装

```bash
npm install @saicmotor/sdk --registry=<内部registry>
```

## 提供内容

- `PluginManifest` 类型与 zod schema
- `ScriptContext` 接口
- `definePlugin` 助手
- 共享 zod schema（catalog 字段等）

## 使用

```ts
import { PluginManifestSchema, definePlugin } from "@saicmotor/sdk";
```