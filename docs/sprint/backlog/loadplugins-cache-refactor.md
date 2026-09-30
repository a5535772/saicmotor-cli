# Story — loadPlugins 缓存重构（消除 findScript 重复加载）

> **来源**：Sprint 8 代码质量评审 L7（见 [sprint-8-code-quality-review-2.0.md](../sprint-1-8/sprint-8-code-quality-review-2.0.md)）
> **状态**：⏸ 稍后处理（backlog）
> **优先级**：🟢 低（过早优化）
> **提出时间**：2026-09-30

---

## 问题

`findScript()`（`packages/cli/src/engine/script.ts:54`）每次被调用（即每条业务命令执行时）都会 `loadPlugins(loadConfig())`，与 CLI 启动时的 `index.ts:22` 重复加载。当前 3 个插件，重复扫描成本 ~ms 级，无实际影响。

## 为什么不能简单加「模块级 memo」

`loadPlugins` 的 4 个调用点对「是否复用缓存」的需求不同：

| 调用点 | 时机 | 能否复用缓存 |
|--------|------|:---:|
| `cli/index.ts:22` | 启动 | 首次 |
| `engine/script.ts:54` findScript | 命令执行（state 未变） | ✅ |
| `cli/plugin-cmds.ts:326` plugin list | 命令执行（state 未变） | ✅ |
| `plugin/suite.ts:6` buildSuiteRoutes | install/uninstall 之后（state 刚变） | ❌ 必须重读 |

`registrar.writeSuiteRoutes()`（install/uninstall/dev 之后调用）→ `buildSuiteRoutes()` → `loadPlugins()`，必须读到**刚变更**的 state；若全局 memo 命中旧结果，`plugin install` 后 suite 路由表会漏掉新插件（真 bug）。

## 正确修法（待实现）

把启动时已加载的 `plugins` 一路传入 `runMethod` → `findScript`（改 3 个签名 + `index.ts:56` 一个调用点），仅消除 findScript 那次重复；`buildSuiteRoutes` 仍保留重读。

## 触发条件（何时捡起）

- 插件数量上到几十个，`loadPlugins` 扫描成为可感知开销；
- 或需要做插件加载/缓存整体重构时一并处理。

## 验收标准

- 单条业务命令不再二次 `loadPlugins`（`index.ts` 与 `script.ts` 共用同一次结果）；
- `plugin install/uninstall/dev` 后 suite 路由表仍即时反映最新插件集合。
