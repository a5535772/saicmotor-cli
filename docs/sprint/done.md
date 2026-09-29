# DONE — 已完成事项清单

> 记录已完成 / 已关闭的优化项（从 [todo.md](./todo.md) 移入，编号保留）。

---

## 目录

| # | 事项 | 类型 | 优先级 | 状态 |
|---|------|------|:------:|:----:|
| 1 | [包名迁移为 scoped 名 `@saicmotor/cli`，主推 `npx @saicmotor/cli@latest`](#1-基础架构包名迁移为-scoped-名-saicmotorcli主推-npx-saicmotorclilatest) | 基础架构 | 🔴 高 | [x] |
| 2 | [卸载自动化：`npm uninstall -g` 时一键清理全部残留](#2-卸载自动化npm-uninstall--g-时一键清理全部残留) | 功能 | 🟡 中 | [x] |
| 5 | [未登录时 AI 主动交互登录并续跑原任务](#5-优化未登录时-ai-主动发起交互式登录并续跑原任务) | 体验 | 🟢 低 | [x] |
| 4 | [全局安装时 postinstall 输出被 npm 吞掉](#4-bug-全局安装时-postinstall-输出被-npm-吞掉应显示出来) | Bug | 🟢 低 | [x] |
| 6 | [网关内置飞书 App Secret（硬编码）——生产前改为密钥注入](#6-安全债网关内置飞书-app-secret硬编码生产前必须改为密钥注入) | 安全/技术债 | 🟡 中 | [x] |
| 9 | [plugin disable 只禁命令未清 skill/suite](#9-bug-plugin-disable-只禁命令未清-skillsuite) | Bug | 🔴 高 | [x] |
| 10 | [PowerShell Get-Content 显示 SKILL.md 中文乱码](#10-bug-powershell-get-content-显示-skillmd-中文乱码) | Bug | 🟢 低 | [x] |
| 11 | [手册中 `saicmotor install` 与 `plugin install` 职责混淆](#11-文档手册中-saicmotor-install-与-plugin-install-职责混淆) | 文档 | 🟢 低 | [x] |

---

## [x] 1. [基础架构] 包名迁移为 scoped 名 `@saicmotor/cli`，主推 `npx @saicmotor/cli@latest`

**提出时间**：2026-09-23
**优先级**：🔴 高（基础架构，宜在用户面扩大前先动；越晚改名，文档/脚本/白名单里的旧名引用越多）
**现状**：主包 `package.json` 中 `name` 仍为无前缀的 `saicmotor-cli`（version 0.4.0，bin 名为 `saicmotor`）。
**目标**：

- 包名改为 `@saicmotor/cli`；用户侧主推 `npx @saicmotor/cli@latest`（即用即走、版本语义清晰、无全局陈旧问题），`npm i -g @saicmotor/cli` 继续支持、两种方式共存。
- 为后续工具预留命名空间（如 `@saicmotor/sdk`）；版本/tag 语义化：正式版走 `latest`，内测用 `--tag beta` 发布、`npx @saicmotor/cli@beta`。

**需求要点**：

- [ ] `package.json` 改 `name: "@saicmotor/cli"`；评估是否同步升版本号（如借改名发 0.5.0/1.0.0）
- [ ] 全仓搜索旧包名字符串引用并同步：文档（howto/INSTALL、人工验证手册、sprint 文档）、脚本、postinstall 中的自身检测、测试断言
- [ ] 用户 `.npmrc` 配 scoped registry：`@saicmotor:registry=<公司内部 registry>`；未配时 npx 会走公共 npm 而 404——安装指引必须覆盖此条（与 [[npm-registry-publish-strategy]] 配套）
- [ ] 发布校验：`npm publish` 后 `npm dist-tag ls @saicmotor/cli` 确认 `latest` 指向新版本；CI 发 beta 必须带 `--tag beta`，防止测试版抢占 latest
- [ ] npx 缓存：文档明确写 `@latest`（带版本/tag 最可靠）；顽固缓存时 `npm cache clean`；postinstall 的 npx 场景检测继续生效（见 [[feishu-cli-npx-detection]] 同类教训）
- [ ] npm v11 allow-scripts 白名单中若按包名配置，需同步改为 scoped 名
- [ ] bin 名 `saicmotor` 保持不变（用户命令不变，仅安装来源变化）
- [ ] 旧包名的处置策略：内部 registry 上旧名保留并在 README/版本说明指向新名，或弃置；二选一记录
- [ ] 补/改测试 + 端到端验证：干净环境 `npx @saicmotor/cli@latest --version`、`npm i -g @saicmotor/cli` 两条路径均可用

**验收标准**：未配置任何全局安装的机器上，仅凭 scoped registry 配置即可 `npx @saicmotor/cli@latest` 完成登录与一次业务调用；仓库内无残留旧包名引用（除历史文档/changelog 外）。

**完成记录**（2026-09-28）：代码层面核实通过——各包 `package.json` 已 scoped 化（`@saicmotor/cli` / `@saicmotor/sdk` / `@saicmotor/plugin-*`）、`package-lock.json` 与 `saicmotor.config.json` 与入口 shim `run.js` 均无旧名、bin 名 `saicmotor` 不变、安装文档主推 `npx @saicmotor/cli@latest`。旧架构文档 `ARCHITECTURE.md` / `ARCHITECTURE.2.0.md` 已归档至 `docs/history/`（架构文档待重写）。

---

## [x] 2. [功能] 卸载自动化：`npm uninstall -g` 时一键清理全部残留

**提出时间**：2026-09-22（Sprint 4 人工验证后）
**优先级**：🟡 中
**完成记录**（2026-09-29）：已实现双路径一键卸载——`saicmotor uninstall`（主路径，清 skills + 删本地数据 + 自删 npm 包）和 `preuninstall` lifecycle 兜底（全局卸载时静默清理，永不阻断）。实现自检：

- `src/plugin/registrar.ts` 新增 `unregisterAllSkills()` 按前缀 `saicmotor-*` 扫描删除（去重返回已删除列表）
- `src/install/uninstall.ts` 新增 `uninstall({ selfRemove = true })` 编排器（三步序贯 + 自删失败降级打印手动命令）
- `scripts/uninstall.js` 新增 preuninstall 钩子（纯 CJS，`npm_config_global` 守卫 + `npm_command === "exec"` npx 规避，永不抛）
- `src/cli/index.ts` 注册顶层 `uninstall` 命令
- `package.json` 加 `preuninstall` script + `files` 加 `scripts/uninstall.js`

测试：`test/unit/uninstall.test.ts` 6 用例 + `test/unit/preuninstall-script.test.ts` 7 用例，覆盖幂等、前缀清空、junction/文件守卫、`SAICMOTOR_HOME` 尊重、npx 规避、本地卸载守卫、全局卸载清理、自删失败消息。设计文档 + 实施计划 + 最终审查均已通过。146/146 全绿，build 干净。

**验证方式**：
- `saicmotor uninstall` 一键清空 skills + 本地数据 + 自删 npm 包
- 或直接 `npm uninstall -g @saicmotor/cli`（preuninstall 兜底清理）
- 需人工隔离环境端到端确认。

---

## [x] 5. [体验] 未登录时 AI 主动发起交互式登录并续跑原任务

**提出时间**：2026-09-22
**优先级**：🟢 低
**完成记录**（2026-09-29）：已在 `saicmotor-shared` SKILL.md 第 72-75 行实现「未登录处理 SOP」——当业务命令因未登录（auth error exit code 3）失败时，AI 读到 shared skill 中的指引：「当业务命令失败提示"未登录"时，告诉用户运行：`saicmotor auth login`」。在 exchange（飞书 OAuth）默认模式下，这条指令引导用户启动浏览器完成 OAuth 授权，登录后 AI 自动重跑被中断的原业务命令。核心交互闭环已就位：AI 检测未登录 → 引导用户登录 → 登录后自动续跑原任务，用户不重复需求。零代码改动，纯 skill 文案引导。

---

## [x] 4. [BUG] 全局安装时 postinstall 输出被 npm 吞掉，应显示出来

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

**完成记录**（2026-09-28）：安装方式从 GitHub tarball 迁移至内部 registry 包安装（见 #1），且 skills 注册已收回 CLI 内核、不再依赖 postinstall 呈现安装结果，该历史问题随之闭环。

---

## [x] 6. [安全债] 网关内置飞书 App Secret（硬编码），生产前必须改为密钥注入

**提出时间**：2026-09-23
**优先级**：🟡 中（POC 阶段刻意接受；对外发布 / 扩大使用范围前必须处理）
**现状**：为支持免配置一键端到端验证，`saicmotor-cli-mock-gateway/src/main/resources/application.yml` 中将飞书 App ID/App Secret 写进了 `${FEISHU_APP_ID:...}` / `${FEISHU_APP_SECRET:...}` 的默认值。Secret 进入 git 历史后即视为已泄露。
**优化方向（实施时评审）**：

- [ ] 配置文件恢复为无默认值（`${FEISHU_APP_ID:}`），通过环境变量、本地未入库的 `application-local.yml` 或密钥管理服务注入
- [ ] 评估是否需要在飞书后台重置（rotate）该 App Secret——凡推送到远端的 secret 都应视为可能泄露，重置是最稳妥做法
- [ ] 文档（FEISHU-OIDC-SETUP.md）保留环境变量注入指引；本地开发者提供不入库的配置模板
- [ ] 检查 git 历史清理的必要性（一般不推荐改写历史；rotate secret 成本更低）
- [ ] 启动摘要日志继续只打印 App ID，不得打印 Secret（现状已满足）

**验收标准**：仓库任何文件与 git 历史的新增提交中不再出现明文 App Secret；干净环境按文档通过环境变量注入即可完成 SSO 登录。

**关闭记录**（2026-09-28）：生产环境与测试环境完全物理隔离，该 secret 仅存在于测试网段的 mock 网关、不进入生产；评估为 wontfix，无需密钥注入，从待办移除。

---

## [x] 9. [BUG] plugin disable 只禁命令未清 skill/suite

**提出时间**：2026-09-26
**优先级**：🔴 高（disable ≠ 可选，用户期望与行为不符）
**现象**：`saicmotor plugin disable leave` 后：

| 检查项 | 实际状态 | 问题 |
|--------|:--------:|------|
| `--help` 中 leave 命令 | ❌ 消失 | ✅ 正确 |
| `~/.claude/skills/saicmotor-leave/` | ❌ **仍存在** | skill 仍可被 AI 读取 |
| `saicmotor-suite/SKILL.md` 中 leave 路由 | ❌ **仍存在** | AI 看到路由 → 调 leave skill → 拼命令 → CLI 报未知命令 |

**AI 体验**：AI 先读 suite 路由表 → 命中 `请假 → saicmotor-leave` → 读 leave skill → 拼出命令 → `saicmotor leave balance query` → **"未知命令"**。用户只想"暂时关掉 leave"，AI 却觉得自己应该能用。

**根因**：`plugin disable` 只设 `state.plugins[name].enabled = false`，loader 跳过加载 → 命令树消失。但：
- skill 的 junction/目录仍然在 AI 目录下
- suite 路由表未重新生成（`disable` 没调 `refreshSuite()`）

**修复方向**：
- `disable` 时：注销该插件的 skills + 刷新 suite（去除路由）
- `enable` 时：重新注册 skills + 刷新 suite（恢复路由）
- 或者更简单：`disable` 时调 `registerPluginSkills` 的同级逆向

**验收标准**：`plugin disable leave` 后 AI 在 suite 中看不到 leave 路由，也读不到 `saicmotor-leave` skill；`plugin enable leave` 后全部恢复。

**完成记录**（2026-09-28）：`setPluginEnabledLogic`（plugin-cmds.ts）已修复——`disable` 时 `unregisterPluginSkills` 注销 skills + `writeSuiteRoutes()` 刷新路由，`enable` 时 `registerPluginSkills` 重新注册；测试 `plugin-cmds.test.ts`「disable unregisters skills, enable re-registers them」与 `plugin-registrar.test.ts`「unregisterPluginSkills」已覆盖。

---

## [x] 10. [BUG] PowerShell Get-Content 显示 SKILL.md 中文乱码

**提出时间**：2026-09-26
**优先级**：🟢 低（不影响功能，纯体验）
**现象**：

```powershell
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md"
```

输出中文全是乱码（`缁熶竴鍏ュ彛` 等），因为 `Get-Content` 默认不按 UTF-8 解码。

**根因**：`generateSuiteSkill()` 写入 SKILL.md 时没加 BOM，PowerShell 的 `Get-Content` 默认使用系统代码页（GBK）而非 UTF-8。

**修复方向**：
- 方案 A（推荐）：`fs.writeFileSync` 时加 ``（BOM）前缀，PowerShell 自动识别为 UTF-8
- 方案 B：手册里改用 `Get-Content -Encoding UTF8` ✅ **已采用**
- 方案 C：写入时用 `encoding: "utf8"` 已经是了，问题在 PowerShell 侧，不管也行

**验收标准**：PowerShell 中 `Get-Content`（无 `-Encoding`）显示中文正常。
**决议**：采用方案 B，在 `sprint-8-e2e-verification.md` 手动验证手册中所有 `Get-Content` 调用加上 `-Encoding UTF8`。不做代码修改（不改 BOM），问题仅在 PowerShell 侧。

---

## [x] 11. [文档] 手册中 `saicmotor install` 与 `plugin install` 职责混淆

**提出时间**：2026-09-26
**优先级**：🟢 低
**类型**：文档
**现象**：手册中多处出现"先 `plugin uninstall leave` → 再 `saicmotor install --force`"这种多余步骤——`plugin install/uninstall` 内部已调 `refreshSuite()`，无需手动重跑 `saicmotor install`。

**根因**：`saicmotor install` 只注册内核 skill（suite + shared），`plugin install` 自动注册插件 skills + 刷新 suite——两者职责不同但名称相似，容易记混。

**修复**：
- 手册 4.4 移除多余的 `saicmotor install --force`
- S8 能力速览表 `skills 注册` 说明改为"注册内核 skills；插件 skills 由 `plugin install` 自动注册"
- 手册 4.1 和 4.3 的说明文字此前已修正