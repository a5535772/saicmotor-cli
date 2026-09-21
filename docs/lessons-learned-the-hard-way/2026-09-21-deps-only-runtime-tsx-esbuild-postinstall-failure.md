# 2026-09-21 — tsx/esbuild 的 postinstall 导致 npm install -g 失败

## 现象

`prepare` 已无害化之后，`npm install -g github:a5535772/saicmotor-cli` 仍然失败：

```
npm error path C:\Users\21452\AppData\Roaming\npm\node_modules\saicmotor-cli\node_modules\esbuild
npm error syscall spawn C:\WINDOWS\system32\cmd.exe ENOENT
```

saicmotor-cli 自己的 `prepare` 和 `postinstall` 都没报错，是 **esbuild 的 postinstall** 崩了。

## 根因

`tsx` 在 `dependencies` 里，而 `tsx → esbuild`，esbuild 的 `postinstall` 要在 Windows 上 `spawn(cmd.exe)` 下载平台二进制。Node v24.19.0 + 用户特定系统环境下此操作报 ENOENT。

但关键是：**`tsx` 只在开发时用到（`npm run dev`），全局安装用户根本不需要它。** 之前为了 `prepare` 钩子里的 `tsc` 编译才临时把 `tsx` 和 `typescript` 推到 `dependencies`——`dist/` 提交后这个前提已不存在。

## 修复

把 `tsx` 和 `typescript` 从 `dependencies` 移回 `devDependencies`。

`npm install -g` 只装 `commander`（纯 JS）+ `zod`（纯 JS），不触发 esbuild 的 postinstall。

## 教训

- **`dependencies` 只放运行必须的包。** 编译工具（tsx、typescript、esbuild、vitest）永远放 `devDependencies`。
- **永远不要为了让 `prepare` 工作而污染 `dependencies`。** 正确的解决方向是让 `prepare` 不需要这些工具（如提交 bundle），而不是把工具推到 deps。
- **二进制依赖（esbuild、node-gyp 等）的 postinstall 是 `npm install -g` 的常见故障源。** 能避开就避开——deps 越少、越纯 JS 越好。