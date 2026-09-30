# Story — `manifest.catalog` glob 声明名实相符（当前仅支持 `catalog/services/*.json`）

> **来源**：Sprint 8 代码质量评审 L9（见 [sprint-8-code-quality-review-2.0.md](../sprint-1-8/sprint-8-code-quality-review-2.0.md)）
> **状态**：⏸ 稍后处理（backlog）
> **优先级**：🟢 低（当前 3 个插件全用默认 layout，零实际影响）
> **提出时间**：2026-09-30

---

## 问题

`plugin/loader.ts` 的 `loadPluginServices()` 把 `manifest.catalog`（声明为 glob 数组）当作「是否含 `"services"` 字符串」的开关，实际只读死 `catalog/services/*.json`，不解析 glob。

两个静默分歧陷阱：
1. `catalog: ["catalog/services/v2/*.json"]` → 含 "services" 不跳过，但读的是父目录，`v2/` 子目录被无视；
2. `catalog: ["schemas/*.json"]` → 不含 "services" → `continue`，插件**静默加载成零 service，无任何 warning**。

## 为什么延后（不修原因）

当前 3 个插件全部使用默认 `catalog/services/*.json`，零实际影响。真 glob 支持属于「插件生态上来后」的 API 完善，不在本次代码质量清理范围。

## 修复方向（待实现，二选一）

- **乙（最小诚实化）**：遇到非默认 glob 时 push 一条 warning（不静默跳过），先不实现真 glob。低成本，先堵住「静默分歧」这个坑。
- **甲（真实现）**：引入 glob 匹配（`minimatch` 或手写简单 pattern），让 `catalog` 声明名实相符。

## 触发条件（何时捡起）

- 有插件使用非 `catalog/services/*.json` 的 layout 时；或做 plugin API 整体完善时。

## 验收标准

- 声明非默认 glob 的插件不再被静默跳过（至少给出 warning，或按 glob 正确加载）。
