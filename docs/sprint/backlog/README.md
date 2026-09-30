# Backlog 索引

> backlog 存放「已决策但暂不实现」的 story——每个文件对应一项 Sprint 8 代码质量评审的遗留项。
> 完整决策记录见 [sprint-8-code-quality-review-2.0.md](../sprint-1-8/sprint-8-code-quality-review-2.0.md)「六、逐项决策记录」。
> 更新于 2026-09-30。

---

## 分类总览

| 分类 | ID | story 文件 | 为什么存在 | 触发条件 | 优先级 |
|------|----|-----------|-----------|---------|:---:|
| 技术性能优化 | L7 | [loadplugins-cache-refactor.md](loadplugins-cache-refactor.md) | `findScript` 每次命令重复 `loadPlugins` | 插件数量上到几十个 | 🟢 低 |
| 功能完善 | L8 | [skills-already-installed-granularity.md](skills-already-installed-granularity.md) | `skillsAlreadyInstalled()` 任一命中即判已装，升级新增 skill/客户端不补装 | 核心新增内置 skill 或新增 AI 客户端 | 🟢 低 |
| 功能完善 | L9 | [catalog-glob-support.md](catalog-glob-support.md) | `manifest.catalog` 声明 glob 但实现不解析，非默认 layout 被静默跳过 | 有插件用非 `catalog/services/*.json` layout | 🟢 低 |
| 功能跨平台 | A6 | [cross-platform-support.md](cross-platform-support.md) | `"junction"` 硬编码 Windows 专属字面量；macOS/Linux 从未实测 | 决定支持 macOS / Linux | 🟢 低 |

---

## 各 story 存在原因

### L7 — 技术性能优化（过早优化）

`findScript()` 每条业务命令执行时都 `loadPlugins(loadConfig())`，与 CLI 启动时的加载重复。当前 3 个插件，重复扫描 ~ms 级，无实际影响；且简单「模块级 memo」不安全——`buildSuiteRoutes` 在 install/uninstall 之后必须读到刚变更的 state。正确改法（把启动 plugins 传入 runMethod→findScript）改动中等、收益毫秒级，故延后。

### L8 — 功能完善（升级补装）

`skillsAlreadyInstalled()` 以「任意客户端目录存在任意内置 skill」即返回 true，`installSkills` 整体跳过。后续 CLI 升级新增内置 skill / 新增 AI 客户端时，旧 skill 已存在 → 直接跳过 → 新 skill/客户端永不注册（用户不知需 `--force`）。当前 skills 集合稳定，无触发条件，故延后。

### L9 — 功能完善（声明式 API 名实相符）

`loadPluginServices()` 把 `manifest.catalog`（glob 数组）当作「是否含 "services"」开关，只读死 `catalog/services/*.json`。声明非默认 glob（如 `schemas/*.json`）会被静默跳过、插件加载成零 service 且无 warning。当前 3 插件全用默认 layout，故延后。

### A6 — 功能跨平台（macOS / Linux 支持）

A6 评审项「`junction` 非 Windows 降级为 copy」前提大概率有误（Node 在 Unix 忽略 `type` 参数，正常建 symlink），**非 bug**；但 `"junction"` 是 Windows 专属字面量，硬编码在 `registrar.ts` / `tooling-cmds.ts` 跨平台代码里语义违和，且 `saicmotor install` 从未在 macOS / Linux 实测过。用户迟早要支持 macOS / Linux，故作为规划需求入 backlog，待「决定支持 macOS / Linux」时一并实测 + 按平台选 `junction`/`dir` 收口。

---

## 已移出 backlog（Sprint 9 处理中）

| story | 覆盖 | 去向 |
|-------|------|------|
| cli-sdk-type-deduplication.md | C1 / C7含A3 / A7（SDK 契约收口） | 已移至 [`../sprint-9/`](../sprint-9/) |

## 非 backlog（won't fix / 方向未定，无 story 文件）

| ID | 结论 | 说明 |
|----|------|------|
| S2 | 非风险 won't fix | 明文密码：真实业务只走 SSO/扫码，客户端只持 token |
| S7 | 非风险 won't fix | config import 读一次：读的是随包发布的静态文件 |
| A5 | 方向未定 | 插件 `src/index.ts` 占位：是否需 TS 入口留待 API 方向决策 |

> 上述结论均见 [sprint-8-code-quality-review-2.0.md](../sprint-1-8/sprint-8-code-quality-review-2.0.md)。
