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

## [ ] 2. 安装/卸载知识零文档化：一个 HTTP 安装指引 + 一个 uninstall skill

**提出时间**：2026-09-22
**优先级**：🟡 中（与事项 1 可合并设计：卸载环节即由 uninstall skill 承担）
**背景**：目前让 AI 完成安装/卸载，需要用户指定本地文档（"读 howto/INSTALL.md"），依赖 AI 能访问仓库文件、会话恰好在项目目录。目标形态是用户**不指定任何文档**：

**目标交互**

1. **安装**：用户只说一句话——

   > "请你参考 <一个 HTTP 地址> 帮我完成 saicmotor CLI 的安装。"

   AI 自行 WebFetch 该地址，按页面上的指引（含 npm 命令、`--dangerously-allow-all-scripts`、代理 env、安装验证）完成安装。

2. **卸载**：安装完成后，skills 中包含一个 **uninstall skill**（如新增 `saicmotor-uninstall`，或并入 `saicmotor-shared` 能力）。用户只需说"帮我卸载 saicmotor CLI"，AI 发现该 skill → 按其说明执行：清除四个业务 skills + uninstall skill 自身 + 本地数据 + 客户端死链接（与事项 1 的清理内容一致），最后引导/执行 `npm uninstall -g`。

**需求要点**：

- [ ] 确定 HTTP 安装指引的承载地址（GitHub raw 文件 / GitHub Pages / 内网页面，与 [[npm-registry-publish-strategy]] 的最终发布形态一致；页面内容单一、无废话，AI 抓取即可执行）
- [ ] 安装指引内容：一条 npm install 命令、代理环境说明、安装后验证（`--version` + `skills ls -g`）、失败补注册命令
- [ ] 新增 uninstall skill：`SKILL.md` frontmatter（description 要能被"卸载/删除/清理 saicmotor"意图命中），正文给出完整清理步骤
- [ ] 自卸载顺序问题：先清理其他 skills 和数据，最后删 npm 包（包删了 skill 文件即消失）；文档说明每步失败的降级处理
- [ ] skills 注册清单同步增加 uninstall skill（postinstall / `installSkills` 的 `--all` 会自动带上，确认 catalog/skills 目录结构）
- [ ] 更新手册 07：阶段 2 与阶段 6 的话术改为"参考 <HTTP 地址>"/"用卸载 skill"，不再引用本地 INSTALL.md
- [ ] 补测试 + 端到端验证：干净环境一句话安装 → 新会话一句话卸载 → 零残留

**验收标准**：人全程不出现"文档""SKILL.md""howto"等字眼，仅凭 HTTP 地址（安装）和 skill 自主发现（卸载）完成闭环。

---

## [ ] 3. [BUG] 全局安装时 postinstall 输出被 npm 吞掉，应显示出来

**提出时间**：2026-09-22
**优先级**：🟢 低
**类型**：Bug（体验/可观测性）
**现象**：`npm install -g`（npm v11）时 postinstall 实际执行了，但其 stdout（"saicmotor CLI 安装完成"、"✓ AI skills 已注册"、登录/帮助提示）完全不显示，用户只看到 `added N packages`，容易误判为 skills 没注册。

**期望**：全局安装结束后，postinstall 的提示信息能正常呈现给用户。

**排查/修复方向（实施时先验证）**：

- [ ] 确认是 npm v11 对全局 lifecycle stdout 的处理机制，而非脚本自身 `stdio: "pipe"` 导致（注意：`installSkills` 内部 execSync 的 pipe 是刻意的，被吞的是 **postinstall 进程自身的 console.log**）
- [ ] 调研 npm 是否提供开关/配置回传全局脚本输出（不同 npm 版本行为可能不同，实测 `--loglevel`、`--foreground-scripts` 等标志）
- [ ] 若 npm 层面无法可靠解决，考虑替代呈现：安装后首次运行 `saicmotor` 时展示一次性欢迎/注册状态提示（写入标记文件，只显示一次）
- [ ] 至少保证文档统一告知"以 `npx skills ls -g` 为准，不以安装日志判断成败"（教训文档已覆盖，本项为产品体验修复）

**验收标准**：全新环境全局安装后，无需手动执行任何验证命令，即可在安装输出中看到 postinstall 的执行结果或等价的成功提示。

---

## 已完成

（暂无）
