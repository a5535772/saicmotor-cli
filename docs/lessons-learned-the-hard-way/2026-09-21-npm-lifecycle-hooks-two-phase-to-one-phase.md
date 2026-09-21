# 2026-09-21 — npm 生命周期钩子从两阶段退化为一阶段

## 背景

Sprint 4 的 AI 发现机制引入了 `postinstall` 钩子来自动注册 skills。同时为了保证用户 `npm install -g` 后有可运行的 CLI，最初也添加了 `prepare` 钩子用于编译 TypeScript。

## 时间线（4 个 commit 的拉锯战）

| Commit | 做了什么 | 为什么 |
|--------|---------|--------|
| `4c7c3fd` | `prepare = "npm run build"` | 首次添加，install 时自动 tsc 编译 |
| `d4da185` | `typescript` → dependencies | prepare 里的 tsc 需要 typescript |
| `62c5fe8` | `prepare` → 只检查 dist/ 是否存在 | 用户家目录孤儿 shim 导致 tsc 报 MODULE_NOT_FOUND |
| `28da016` | `tsx`/`typescript` → devDeps | esbuild postinstall 在 Windows Node v24 上报 ENOENT |

## 根因

1. **孤儿 shim**：用户 `%USERPROFILE%\node_modules\.bin\tsc.cmd` 残留，prepare 执行 `tsc` 时 Node 模块解析向上遍历命中了它，导致 MODULE_NOT_FOUND
2. **esbuild postinstall**：`tsx → esbuild`，esbuild 的 postinstall 在 Windows 上 spawn cmd.exe 下载二进制，Node v24 + 特定系统环境报 ENOENT

两条教训：
- **`prepare` 钩子依赖构建工具在用户环境不干净时是脆弱的**——你无法保证用户的 PATH、node_modules 链、全局安装状态是干净的
- **二进制依赖的 postinstall 是 `npm install -g` 的常见故障源**——能避开就避开，deps 越少、越纯 JS 越好

## 最终方案

安装链路从 **"prepare 编译 + postinstall 注册"** 两阶段变为 **"dist 预提交 + postinstall 注册"** 一阶段：

```
原来：npm install → prepare(tsc 编译) → postinstall(skills 注册)
现在：npm install → prepare(空操作)   → postinstall(skills 注册)
                     ↑ dist/ 已在 git 中，无需编译
```

### 当前 `prepare`（package.json:15）

```json
"prepare": "node -e \"if(!require('fs').existsSync('dist/cli/index.js'))console.warn('⚠ dist/ 缺失，请运行 npm run build')\""
```

已无害化——`dist/` 提交到仓库后这条 warn 永远不会触发，等价于空操作。留着无害，删了也行。

### 当前 `postinstall`（scripts/postinstall.js）

仍然活跃，负责 `npx skills add --all -g` 自动注册 skills，`|| true` 兜底防止 install 中断。

## 相关教训

- [2026-09-21-deps-only-runtime-tsx-esbuild-postinstall-failure.md](./2026-09-21-deps-only-runtime-tsx-esbuild-postinstall-failure.md)
- [2026-09-21-prepare-hook-orphan-shim-install-failure.md](./2026-09-21-prepare-hook-orphan-shim-install-failure.md)
- [2026-09-21-npm-v11-github-shorthand-symlink-breaks-global-install.md](./2026-09-21-npm-v11-github-shorthand-symlink-breaks-global-install.md)