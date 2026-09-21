# 2026-09-21 — npm install -g prepare 钩子因用户家目录孤儿 shim 导致安装失败

## 现象

```powershell
npm install -g github:a5535772/saicmotor-cli
```

报错：

```
npm error > tsc -p tsconfig.json
npm error Error: Cannot find module 'C:\Users\21452\node_modules\typescript\bin\tsc'
```

同时伴随 Windows EPERM 锁文件警告（旧安装残留的 `tsx/dist/esm`、`zod/src/v4/mini` 被系统锁定）。

## 根因

### 直接原因：孤儿 shim 路径污染

用户家目录下存在 `C:\Users\21452\node_modules\.bin\tsc.cmd`，但对应的 `C:\Users\21452\node_modules\typescript\` **不存在**。

npm 执行 `prepare` → `npm run build` → `tsc -p tsconfig.json` 时，Node.js 的模块解析**向上遍历**，最终命中了这个孤儿 shim。shim 内容是：

```cmd
"%_prog%" "%dp0%\..\typescript\bin\tsc" %*
```

`%dp0%\..\typescript` 展开为 `C:\Users\21452\node_modules\typescript`，但这个目录不存在 → `MODULE_NOT_FOUND`。

### 为什么会走到这一步

1. `npm install -g github:a5535772/saicmotor-cli` 从 GitHub clone 项目到**临时目录**（如 `%TEMP%/npm-xxxxx/`），在该目录中执行全新的 `npm install` + `prepare`
2. 临时目录的 `node_modules/typescript` 和 `.bin/tsc.cmd` 都正确安装
3. 但 Node.js 的 PATH/模块解析机制在搜索 `tsc` 时，**先命中了用户家目录下的孤儿 shim**（`C:\Users\21452\node_modules\.bin\tsc.cmd`）
4. 孤儿 shim 指向不存在的 typescript → 安装失败

### 深层教训

- **用户家目录下的 `node_modules` 是一个危险的模块解析污染源**——它会影响所有从用户目录下启动的 Node.js 进程
- **`prepare` 钩子依赖构建工具（如 tsc）在用户环境不干净时是脆弱的**——你无法保证用户的 PATH、node_modules 链、全局安装状态是干净的
- **`npm install -g github:...` 不适合需要构建步骤的项目**——clone + install + prepare 的链路在极端环境下极易断裂

## 修复方案

1. 从 `.gitignore` 移除 `dist/`，将编译产物提交到 git
2. `prepare` 改为无害操作（仅检查 dist/ 是否存在），不再做编译
3. 真正的构建验证放到 `prepublishOnly`（仅 `npm publish` 时触发）

这样 `npm install -g github:...` 时不再执行 `tsc`，从根源上绕过了所有 PATH/模块解析污染问题。

## 影响范围

- `npm install -g github:a5535772/saicmotor-cli`（GitHub 直装路径）
- 任何有类似孤儿 shim 污染的 Windows 环境

## 防止再犯

- **分发式 npm 包应预编译**：如果用户通过 git 仓库直接安装，应提交构建产物
- **`prepare` 钩子不应包含可能失败的构建步骤**：`prepare` 在用户机器上运行，环境不可控
- **检查用户环境假设**：安装文档中应说明可能的 PATH 冲突，提供排查指南