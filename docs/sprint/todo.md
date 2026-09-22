# TODO — 待办事项清单

> 记录人工验证 / 开发中发现的优化项，按优先级排序。

---

## [ ] 1. 卸载自动化：`npm uninstall -g` 时一键清理全部残留

**提出时间**：2026-09-22（Sprint 4 人工验证后）
**优先级**：🟡 中
**背景**：目前用户卸载 saicmotor-cli 需要手工执行三件事（见人工手册阶段 4），漏做任何一件都会留残留：

1. **清除 AI skills** —— `saicmotor-suite / saicmotor-leave / saicmotor-attendance / saicmotor-shared` 已注册到各 AI 客户端（中央仓 `~/.agents/skills/` + `~/.claude/skills/`、`~/.codebuddy/skills/` 等符号链接），卸载 npm 包不会动它们。
2. **清除本地数据** —— `~/.saicmotor/`（config.json + 凭据缓存）。
3. **清除 npm 全局残留** —— 极端情况下 `npm ls -g` 仍有 saicmotor-cli 条目。

**目标**：用户执行 `npm uninstall -g saicmotor-cli` 时自动完成上述清理，或提供一条 `saicmotor uninstall`（卸载前可用）命令完成清理。

**可选方案（待评审）**：

| 方案 | 做法 | 风险/成本 |
|------|------|-----------|
| A | 利用 npm `preuninstall` lifecycle 脚本自动清理 | npm v11 对 `-g` 的 lifecycle 管控与 postinstall 同（默认可能被拦，需 allow-scripts）；卸载时脚本要能找到 `skills` CLI；需实测 |
| B | 在 CLI 内提供 `saicmotor uninstall` 向导：列出将删除的 skills/数据 → 确认 → 执行；文档提示"先跑此命令再 npm uninstall" | 不依赖 npm lifecycle，行为可控；多一条命令 |
| C | A+B 组合：有 `saicmotor uninstall` 命令，preuninstall 作为兜底（静默失败不阻断卸载） | 体验最好，工作量略大 |

**需求要点**：

- [ ] 清理前展示将删除内容（skills 列表、`~/.saicmotor` 路径），要求用户确认（支持 `--yes` 跳过）
- [ ] skills 删除走 `npx skills rm <name> -g`（四个包名），失败不阻塞、给出手动命令
- [ ] 删除 `~/.saicmotor`（尊重 `SAICMOTOR_HOME` 覆盖）
- [ ] 完成后提示验证方法：`saicmotor --version` 应不可用（npm 包卸载后）、`npx skills ls -g` 无 saicmotor 条目
- [ ] npx 临时调用场景不做任何清理（参考飞书 CLI npx 检测教训）
- [ ] 补测试 + 人工手册更新（卸载章节可由手工步骤缩减为一条命令）

**验收标准**：隔离环境 `npm install -g` → 登录 → `npm uninstall -g`（或先跑卸载命令）后，skills/本地数据/npm 全局三处全部干净。

---

## 已完成

（暂无）
