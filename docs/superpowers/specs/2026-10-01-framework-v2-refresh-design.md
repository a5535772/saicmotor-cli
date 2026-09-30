# framework-v2 文档刷新 — 设计文档

> **创建于**：2026-10-01 | **性质**：文档更新，零代码改动

## 目标

将 `howto/framework-v2/` 的 15 篇文档对齐到 Sprint 9 + 10 完成后的当前代码——自包含、以大学教师口吻、每个代码示例和 mermaid 图都能在源码中找到对应。

## 原则

1. **自包含**：不假设读者读过 sprint 文档或"发生了什么"系列。每个概念从头讲。
2. **逐字验证**：任何代码示例必须都能在 `packages/*/src/**/*.ts` 中找到对应。不出具过期的签名、参数、类名。
3. **图文并茂**：每个关键流程配 mermaid 图（保留现有风格），关键概念加 ascii 结构图。
4. **大学教师口吻**：先讲"是什么"，再讲"为什么这样设计"，最后讲"改它会怎样"。不写"注意"——写后果。
5. **不改变文档结构**：15 篇编号、4 条阅读路线、附录体系全保留。

## 逐文档覆盖范围

### 00-quick-overview.md
- 数据目录一览：state.json 的 `version` 字段确认
- 核心概念图：箭头标注与代码一致

### 01-concepts.md
- Catalog 段：说明 schema 由 `@saicmotor/sdk` 维护
- 插件段：manifest `engine` 用 `>=0.8.0`（0.x 阶段理由）
- 概念关系全图：SDK 作为独立角色加入

### 02-architecture.md
- 四层架构重绘：SDK 作为横向贯穿角色
- 包拓扑重绘：SDK 与 cli/插件 的 runtime dep vs devDep 关系
- 目录结构：删 `catalog-types.ts`，加 `version.ts`、`sync-versions.mjs`
- 数据流：SDK zod schema → CLI 校验 → 类型推断

### 03-installation-flow.md
- `saicmotor --version` 输出 `getCoreVersion()`
- 命令输出对齐当前行为

### 04-plugin-system.md
- Manifest：`engine` 加 `>=` 说明（0.x 阶段）
- loadPlugins：签名 `()`→`{ plugins, warnings }`
- loadPluginServices：返回值 `{ services, warnings }` 对象
- 冲突警告：新格式含 winner/loser
- 常犯错误：加 engine 该用 `>=` 而非 `^`

### 05-skills-and-suite.md
- `generateSuiteSkill`：`version` 字段来自 `getCoreVersion()`

### 06-engine-pipeline.md
- 执行管道：findScript 加 `within()` 围栏
- SaicmotorError：`isSaicmotorError()` 结构判断（非 instanceof），完整解释
- ScriptContext：来自 `@saicmotor/sdk`

### 07-auth-flow.md
- 登录成功输出：`已登录，token 已缓存`（无前缀）
- Config 示例：auth 字段仅 CLI 侧

### 08-config-system.md
- DEFAULT_CONFIG：Config 已窄化为 `{ gateway }`，AuthConfig 在 CLI 侧独立
- SDK 不再有 auth 类型
- 配置瀑布图确认

### 09-build-and-publish.md
- 构建顺序：SDK runtime dep 强调
- 新增：`sync-versions.mjs` 步骤
- 发布流程加版本同步

### 10-plugin-development.md
- 骨架生成：engine 输出 `>=`
- SDK 依赖类型：runtime 用 `dependencies`
- 脚本覆盖：用 `SaicmotorError`（SDK），非自建 `UpstreamError`
- Catalog 声明：schema 由 SDK 提供

### A1-faq.md
- Config/auth/engine 相关问答刷新
- 自测答案同步

### A2-troubleshooting.md
- 错误信息样例更新

### A3-glossary.md
- 加 `getCoreVersion`、`isSaicmotorError`、`within`
- 更新 `SaicmotorError`、`Config`、`engine`

### README.md
- V1 vs V2 对照表微调

## 不做
- 不改变文档组织结构
- 不新增章节
- 不修改 V1 文档
- 不写代码