# Sprint 9 — 代码质量收尾 + SDK 契约收口

> **状态**：⚪ 待排期（新建）
> **创建于**：2026-09-30
> **来源**：Sprint 8 代码质量评审（见 [sprint-8-code-quality-review-2.0.md](../sprint-1-8/sprint-8-code-quality-review-2.0.md)「六、逐项决策记录」）
> **性质**：纯收口 sprint，**不新增业务功能**——落地 S8 评审已决策的修复，收口 SDK 公开 API 技术债。

---

## 1. 背景

S8 代码质量评审共 **30 项发现**：12 项已修复，18 项未修复。18 项经逐项决策分为三档：

- **决定修复（待实现）**：7 项，已定方案、只差落地。
- **归档 won't fix**：3 项（S2 / S7 / A5），非风险或方向未定。
- **backlog**：8 项，其中 SDK 侧 3 项（C1 / C7含A3 / A7）归入本 sprint，其余按触发条件延期（分类与原因见 [`../backlog/README.md`](../backlog/README.md)）。

本 sprint 把「7 项待实现修复」落地，并收口 SDK 侧 3 项技术债。

---

## 2. 目标

1. 落地 7 项已决策的代码质量修复（路径围栏 / 错误类收敛 / warning 补齐 / 死代码清理）。
2. SDK 公开 API 收口：**单一真相源 + 死 API 清理 + 契约窄化**（C1 / C7含A3 / A7 三合一）。

---

## 3. 直接修复（7 项，已决策）

> 均已定方案，本 sprint 直接实现 + 跑测试（当前 162 tests 全绿，修复后需保持）。

| ID | 问题 | 修复方案 | 改动量 |
|----|------|---------|:---:|
| S3+S4 | `findScript` 路径穿越（service/resource/method 拼 `path.join` 可能含 `../`） | 候选路径 `path.resolve()` 后校验仍落在对应 base 目录内，否则跳过 | 小 |
| L4 | 插件冲突 first-wins 但 warning 没说清该 disable 谁 | warning 文案点名「当前 X 生效，若要 Y 生效请 disable X」 | 小 |
| L6 | 插件脚本 `UpstreamError` 非 `SaicmotorError`，结构化错误分支不命中 | SDK 导出运行时 `SaicmotorError`；CLI `handleError` 改结构判断（`category`+`exitCode` / `Symbol.for`）；两脚本改 import | 中 |
| C3 | 插件 catalog 解析错误静默丢弃无 warning | `loadPluginServices` 返回 `{ services, warnings }`，并入 `loadPlugins` 的 warnings | 小 |
| A1 | `loadPlugins(_config)` 参数未使用 | 删死参数，4 调用点（index/script/plugin-cmds/suite）改 `loadPlugins()` | 小 |
| S5 | 登录后打印 `token.slice(0,8)` | 去掉插值，改 `已登录，token 已缓存` | 1 行 |
| C5 | 9 处空 catch 裸吞无注释 | 各补一句「为何吞掉是安全/有意」 | 9 行注释 |

**验收**：7 项改完，`npm run build` 零错误、`npm test` 全绿；S3+S4 补一条路径穿越用例（`../` 被跳过）。

---

## 4. SDK 契约收口（3 项合一）

> 对应 story：[cli-sdk-type-deduplication.md](cli-sdk-type-deduplication.md)（含「同批附带项」）。

| ID | 问题 | 收口方向 |
|----|------|---------|
| C1 | CLI ↔ SDK 类型重复（catalog / 脚本上下文 / 配置三组，靠人肉「保持同步」） | SDK 收口单一真相源（zod schema + 类型搬入 SDK，CLI 从 SDK import，删重复） |
| C7（含 A3） | `validateManifest` 与 `definePlugin` 均为一行的 `.parse()` 包装，`definePlugin` 死 API（manifest 是 JSON 非 TS） | 只留 `validateManifest`，`definePlugin` 或删或降级为文档示例 |
| A7 | `ScriptContext.config` 契约太宽，暴露 CLI 认证内部（9 个 auth 字段），插件只消费 `gateway` | 窄化 SDK `Config` → `{ gateway: string }`，`ScriptContext` 只留插件真正消费的字段 |

**验收**：
- CLI 不再有与 SDK 重复的 catalog / 脚本上下文类型定义；`schema/catalog.ts` 删除或改 re-export。
- SDK 公开 API 无死函数、契约只暴露插件所需（无 loopback/token 路径等认证细节）。
- 插件脚本与 CLI 引擎消费同一份类型（无 interface ↔ `z.infer` 漂移）。

---

## 5. 不做的

- ❌ 不新增业务能力（本 sprint 纯收口，默认能力收敛/卸载自动化另案，见历史 [sprint-9-default-capability-convergence 提议](../sprint-1-8/sprint-9-default-capability-convergence-感觉没必要做了-by-leo.md)）。
- ❌ 不提前做 S8 评审其余 backlog 项（L7 / L8 / L9 / A6 触发条件未到），其分类与触发条件见 [`../backlog/README.md`](../backlog/README.md)。
- ❌ 不改 S2 / S7 / A5（已判非风险或方向未定，结论见 [sprint-8 评审 2.0](../sprint-1-8/sprint-8-code-quality-review-2.0.md)）。

---

## 6. 关联文档

- [Sprint 8 代码质量评审 2.0（决策记录）](../sprint-1-8/sprint-8-code-quality-review-2.0.md)
- [Sprint 9 SDK 收口 story](cli-sdk-type-deduplication.md)
- [backlog 索引（延期项分类与原因）](../backlog/README.md)
- [TODO 清单](../sprint-quick/todo.md)（独立待办：npm publish 认证弹窗 / 根 build SDK 双编译；版本号管理已独立成 [Sprint 10](../sprint-10/sprint-10-versioning-management.md)）
