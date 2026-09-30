# Story — 跨平台（macOS / Linux）支持

> **来源**：Sprint 8 代码质量评审 A6（见 [sprint-8-code-quality-review-2.0.md](../sprint-1-8/sprint-8-code-quality-review-2.0.md)）
> **状态**：⏸ 稍后处理（backlog）
> **优先级**：🟢 低（规划需求，非 bug）
> **提出时间**：2026-09-30

---

## 背景

A6 评审项表面是「`junction` symlink 非 Windows 总降级为 copy」，但该前提大概率有误：`fs.symlinkSync(target, path, "junction")` 的 `type` 参数是 **Windows 专属**，macOS / Linux 会**忽略**该参数、正常建符号链接，不抛错、也不降级为 copy；`catch` 降级只在文件系统不支持 symlink 或权限不足时触发，与平台无关。

因此 A6 **不是 bug**，当前代码在非 Windows 上功能正确（`registrar.ts:23` 注释也已写明「junction（Windows）或符号链接（Unix）」）。真正的诉求是：CLI 迟早要支持 macOS / Linux，跨平台能力目前只停留在「代码理论可用」，从未在非 Windows 真实环境跑过。

## 问题

1. **Windows 专属字面量硬编码在跨平台代码里**：`packages/cli/src/plugin/registrar.ts:40` 与 `packages/cli/src/cli/tooling-cmds.ts:223` 均写死 `fs.symlinkSync(..., "junction")`，靠 Node 在 Unix 忽略 `type` 才不出错，语义违和。
2. **缺跨平台实测**：`saicmotor install` 的 symlink 建立、家目录解析（`~/.saicmotor`）、loopback 认证端口、路径分隔等，从未在 macOS / Linux 验证过。

> 注：代码库里已有现成正确范式——`packages/cli/test/unit/plugin-loader.test.ts:179` 用 `process.platform === "win32" ? "junction" : "dir"` 建链，修复即对齐该写法。

## 要做的（届时）

1. **实测**：在 macOS / Linux 干净环境跑 `npm i -g @saicmotor/cli` → `saicmotor install` → 业务调用，确认 skills / catalog 的符号链接正常、命令可发现可执行。
2. **语义收口**：把两处硬编码 `"junction"` 改为 `process.platform === "win32" ? "junction" : "dir"`（`registrar.ts:40`、`tooling-cmds.ts:223`）。
3. **顺带排查**其它潜在平台差异（路径分隔、`~/.saicmotor` 解析、loopback 端口占用等），把「支持 macOS / Linux」作为正式验收目标而非隐式假设。

## 触发条件（何时捡起）

- 决定正式支持 macOS / Linux（有用户或自用需求）时；
- 或任一跨平台 CI 矩阵落地时一并实测。

## 验收标准

- macOS / Linux 上 `npm i -g @saicmotor/cli` → `saicmotor install` → 业务调用全链路可用；
- `registrar.ts` / `tooling-cmds.ts` 无 Windows 专属 `"junction"` 硬编码（按平台选 `junction` / `dir`）。
