# Story — CLI ↔ SDK 类型定义重复收口（SDK 单一真相源）

> **来源**：Sprint 8 代码质量评审 C1（见 [sprint-8-code-quality-review-2.0.md](../sprint-1-8/sprint-8-code-quality-review-2.0.md)）
> **状态**：⏸ 稍后处理（backlog）
> **优先级**：🟡 中（维护性 / 漂移风险）
> **计划**：Sprint 9 处理
> **提出时间**：2026-09-30

---

## 问题

CLI 与 SDK 之间存在 3 组类型定义重复，靠人肉「保持同步」：

| 组 | SDK | CLI |
|----|-----|-----|
| catalog 类型 `Field/Method/Resource/Service` | `catalog-types.ts`（interface） | `schema/catalog.ts`（zod + `z.infer`） |
| 脚本上下文 `ScriptContext/ScriptFn/RunResult` | `context.ts` | `engine/script.ts` + `engine/run.ts` |
| 配置 `Config/AuthConfig` | `config-types.ts` | `config.ts` |

`catalog-types.ts` 顶部注释「与 packages/cli/src/schema/catalog.ts 保持同步」即最直白的漂移风险自认——一旦有人只改其中一份，插件脚本消费到的类型就和 CLI 实际传的不一致。

## 澄清

评审原「不修原因：SDK 用纯 interface 可零依赖」已失效——`sdk/package.json` 中 `zod` 为 runtime dependency（`manifest.ts` 导出 `PluginManifestSchema`/`validateManifest`/`definePlugin` 这些运行时值）。

## 修复方向（推荐甲）

SDK 收口单一真相源：
- 把 catalog 的 zod schema（`ServiceSchema` 等）搬入 SDK，CLI 从 SDK import 做校验 + 取类型；
- 脚本上下文类型（`ScriptContext`/`ScriptFn`/`RunResult`）同理，CLI 从 SDK import；
- 删除 CLI 侧重复定义。

## 验收标准

- CLI 不再有与 SDK 重复的 catalog / 脚本上下文类型定义；
- `packages/cli/src/schema/catalog.ts` 等重复文件删除或改为 re-export；
- 插件脚本与 CLI 引擎消费到同一份类型（无 interface↔`z.infer` 漂移）。

---

## 同批附带项（Sprint 9 SDK 清理一并处理）

- **C7（含 A3）**：`manifest.ts` 中 `validateManifest` 与 `definePlugin` 均为 `PluginManifestSchema.parse()` 的一行包装，`definePlugin`（TS 作者助手）生产零使用——manifest 是 JSON 文件而非 TS。方向：只留 `validateManifest`，`definePlugin` 或删或降级为文档示例。详见 [sprint-8-code-quality-review-2.0.md](../sprint-1-8/sprint-8-code-quality-review-2.0.md) 六、C7。
- **A7**：`ScriptContext.config` 的 `Config` 类型过宽，暴露 CLI 认证内部（loopback 端口/token 路径/exchange 路径等 9 个 auth 字段），插件实际只消费 `gateway`。方向：窄化 SDK `Config` → `{ gateway: string }`，`ScriptContext` 只留插件真正消费的字段。详见同报告 六、A7。
