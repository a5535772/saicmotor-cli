# TODO — 待办事项清单

> 记录人工验证 / 开发中发现的优化项，按优先级排序。

---

## 目录

| # | 事项 | 类型 | 优先级 | 状态 |
|---|------|------|:------:|:----:|
| 1 | [包名迁移为 scoped 名 `@saicmotor/cli`，主推 `npx @saicmotor/cli@latest`](#1-基础架构包名迁移为-scoped-名-saicmotorcli主推-npx-saicmotorclilatest) | 基础架构 | 🔴 高 | [ ] |
| 2 | [卸载自动化：`npm uninstall -g` 时一键清理全部残留](#2-卸载自动化npm-uninstall--g-时一键清理全部残留) | 功能 | 🟡 中 | [ ] |
| 3 | [安装/卸载知识零文档化：HTTP 安装指引 + uninstall skill](#3-安装卸载知识零文档化一个-http-安装指引--一个-uninstall-skill) | 功能 | 🟡 中 | [ ] |
| 4 | [全局安装时 postinstall 输出被 npm 吞掉](#4-bug-全局安装时-postinstall-输出被-npm-吞掉应显示出来) | Bug | 🟢 低 | [ ] |
| 5 | [未登录时 AI 主动交互登录并续跑原任务](#5-优化未登录时-ai-主动发起交互式登录并续跑原任务) | 体验 | 🟢 低 | [ ] |
| 6 | [网关内置飞书 App Secret（硬编码）——生产前改为密钥注入](#6-安全债网关内置飞书-app-secret硬编码生产前必须改为密钥注入) | 安全/技术债 | 🟡 中 | [ ] |
| 7 | [npm publish 时 prepublishOnly → test 触发 exchange 认证弹浏览器](#7-bug-npm-publish-时-prepublishonly--test-触发-exchange-认证弹浏览器) | Bug | 🟡 中 | [ ] |
| 8 | [根 build SDK 编译两次](#8-构建优化根-build-时-sdk-编译两次) | 优化 | 🟢 低 | [ ] |
| 9 | [plugin disable 只禁命令未清 skill/suite](#9-bug-plugin-disable-只禁命令未清-skillsuite) | Bug | 🔴 高 | [ ] |
| 10 | [PowerShell Get-Content 显示 SKILL.md 中文乱码](#10-bug-powershell-get-content-显示-skillmd-中文乱码) | Bug | 🟢 低 | [x] |
| 11 | [手册中 `saicmotor install` 与 `plugin install` 职责混淆](#11-文档手册中-saicmotor-install-与-plugin-install-职责混淆) | 文档 | 🟢 低 | [x] |
| 12 | [文档体系重构：框架开发者/业务开发者/架构全景三类手册 + 开发工具](#12-文档体系重构框架开发者业务开发者架构全景三类手册--开发工具) | 文档 | 🟡 中 | [ ] |

**已完成**：[跳转](#已完成)

---

## [ ] 1. [基础架构] 包名迁移为 scoped 名 `@saicmotor/cli`，主推 `npx @saicmotor/cli@latest`

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

---

## [ ] 2. 卸载自动化：`npm uninstall -g` 时一键清理全部残留

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

## [ ] 3. 安装/卸载知识零文档化：一个 HTTP 安装指引 + 一个 uninstall skill

**提出时间**：2026-09-22
**优先级**：🟡 中（与事项 2 可合并设计：卸载环节即由 uninstall skill 承担）
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

## [ ] 4. [BUG] 全局安装时 postinstall 输出被 npm 吞掉，应显示出来

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

## [ ] 5. 优化：未登录时 AI 主动发起交互式登录并续跑原任务

**提出时间**：2026-09-22
**优先级**：🟢 低
**类型**：体验优化（不是 bug——当前被动引导行为符合硬规则 4）
**现状**：命令返回未登录错误后，AI 只提示用户自己执行 `! saicmotor auth login ...` 或让用户把密码发给它；登录完成后用户还得把原始需求再说一遍。

**期望交互**：

1. AI 检测到未登录 → **主动询问**工号和密码（或提示用户用 `!` 自行登录，两者让用户选）。
2. 用户提供凭据后 AI 执行 `saicmotor auth login`。
3. 登录成功后**自动续跑**被中断的原命令（如查余额），无需用户重复需求。

**实施方式（二选一或组合）**：

- [ ] 在 `saicmotor-shared` 的 SKILL.md 中写明"未登录处理 SOP"：主动询问凭据 → 登录 → 续跑原任务（纯 skill 文案引导，零代码）
- [ ] CLI 侧让未登录错误输出携带可机读的续跑提示（如错误 JSON 增加 `"nextAction": "login"`），便于各 AI 客户端稳定遵循
- [ ] 安全注意：skill 中须提示避免让用户以明文在对话中发送密码，优先推荐 `!` 本地执行；凭据不落对话历史

**验收标准**：未登录态对 AI 说"帮我查年假余额"，它在一轮对话内完成询问/登录/续跑并返回余额，用户不重复需求。

---

## [ ] 6. [安全债] 网关内置飞书 App Secret（硬编码），生产前必须改为密钥注入

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

---

## [ ] 7. [BUG] npm publish 时 prepublishOnly → test 触发 exchange 认证弹浏览器

**提出时间**：2026-09-26
**优先级**：🟡 中
**类型**：Bug（发布流程干扰）
**现象**：执行 `npm publish --workspace=packages/cli` 时，`prepublishOnly` 运行 `npm test`（vitest），测试中 `ensureToken()` 无缓存 token → 走默认 `exchange` 认证 → `ExchangeProvider.login()` 在 `127.0.0.1:3000` 启动 loopback 回调服务器 → `openBrowser(authUrl)` 弹浏览器访问 mock 的飞书授权地址 `http://127.0.0.1:3000/callback?code=C1&state=WRONG`。

**根因链路**：
```
npm publish → prepublishOnly: "npm run build && npm test"
  → vitest run → run.test.ts / script.test.ts / auth-login.test.ts
    → ensureToken(config) → 无缓存 token
      → config.auth.type === "exchange"（默认值）
        → ExchangeProvider.login()
          → startCallbackServer({ port: 3000 })
          → openBrowser(authUrl)  ← 🔴 弹两轮浏览器
```

**为什么没有自动阻断发布**：测试中 7 个失败、导致 vitest 非零退出码，若 prepublishOnly 完全依赖 `npm test` 的退出码则本应被阻断——但浏览器弹窗本身就干扰了用户体验。

**修复方向**：
- 那三个测试文件（run.test.ts / script.test.ts / auth-login.test.ts）的 `beforeEach` 需临时设 `process.env.SAICMOTOR_AUTH_TYPE = "password"`，`afterEach` 恢复 `delete process.env.SAICMOTOR_AUTH_TYPE`，让测试走 password 协议不弹浏览器
- 注意 S5 已将默认改为 exchange（飞书 OAuth），这是正确的默认值，**发布流程不应该改回去**——只应让测试环境走 password mock
- 发布流程绕过方案：`prepublishOnly` 脚本加 `SAICMOTOR_AUTH_TYPE=password npm test` 临时覆盖（但常规还是要修测试）

**验收标准**：`npm publish --workspace=packages/cli` 全流程无浏览器弹窗，发布成功。

---

## [ ] 8. [构建优化] 根 build 时 SDK 编译两次

**提出时间**：2026-09-26
**优先级**：🟢 低（无害，仅强迫症）
**现象**：`npm run build` 执行后 SDK 被编译两次：

```
# 根 build 脚本当前内容
"build": "npm run build --workspace=packages/sdk && npm run build --workspaces"
```

`--workspaces` 已包含 `packages/sdk`，所以 SDK 先单独编译一次，又在 `--workspaces` 里并行编译一次。

**修复方向**：
- 方案 A：`npm run build --workspace=packages/sdk && npm run build --workspaces --workspace!=packages/sdk`（exclude 语法）
- 方案 B：workspaces 声明里把 sdk 放在第一位（利用 npm 拓扑排序），只保留 `npm run build --workspaces`

**验收标准**：`npm run build` 输出中 `@saicmotor/sdk` 只出现一次。

---

## [ ] 9. [BUG] plugin disable 只禁命令未清 skill/suite

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

---

## [ ] 10. [BUG] PowerShell Get-Content 显示 SKILL.md 中文乱码

**提出时间**：2026-09-26
**优先级**：🟢 低（不影响功能，纯体验）
**现象**：

```powershell
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md"
```

输出中文全是乱码（`缁熶竴鍏ュ彛` 等），因为 `Get-Content` 默认不按 UTF-8 解码。

**根因**：`generateSuiteSkill()` 写入 SKILL.md 时没加 BOM，PowerShell 的 `Get-Content` 默认使用系统代码页（GBK）而非 UTF-8。

**修复方向**：
- 方案 A（推荐）：`fs.writeFileSync` 时加 `﻿`（BOM）前缀，PowerShell 自动识别为 UTF-8
- 方案 B：手册里改用 `Get-Content -Encoding UTF8` ✅ **已采用**
- 方案 C：写入时用 `encoding: "utf8"` 已经是了，问题在 PowerShell 侧，不管也行

**验收标准**：PowerShell 中 `Get-Content`（无 `-Encoding`）显示中文正常。
**决议**：采用方案 B，在 `sprint-8-e2e-verification.md` 手动验证手册中所有 `Get-Content` 调用加上 `-Encoding UTF8`。不做代码修改（不改 BOM），问题仅在 PowerShell 侧。

---

## [ ] 12. [文档] 文档体系重构：框架开发者/业务开发者/架构全景三类手册 + 开发工具

**提出时间**：2026-09-26
**优先级**：🟡 中
**类型**：文档
**背景**：现有文档散落各处（ARCHITECTURE.2.0.md、DEVELOPER.md、INSTALL.md、sprint 验证手册），读者找不到自己要的信息，也不清楚"我是谁该读哪篇"。

**目标产出**：

| 文档 | 目标读者 | 内容 |
|------|----------|------|
| **框架开发者手册** | 维护/扩展 CLI 核心的人 | monorepo 结构、构建/发布流程、插件 loader/registrar/suite 机制、CLI 认证流程、测试策略、npm registry 发布机制 |
| **业务开发者手册** | 写业务插件的人（leave/attendance/user） | 插件工程脚手架（`create plugin`）、manifest 规范、catalog 定义、skills 编写、dev 联调、validate 校验、发布上线 |
| **业务开发工具** | 业务开发者 | `create plugin` / `validate` / `dev` 的详细用法、常见场景、错误排查；最好有 CLI 内置 wizard 或模板生成能力 |
| **架构全景文档** | 所有人（含非开发决策者） | 项目主体架构、周边架构（mock-gateway/mock-services）、npm 注册与分发机制、AI 阅读机制（skill → suite 路由 → CLI 命令链）、CLI 认证机制（password/exchange/飞书 SSO）、数据流全景 |

**架构全景需覆盖的主题**：
- 项目主体架构：monorepo workspaces、包依赖拓扑（sdk → cli → plugins）
- npm 注册机制：Verdaccio/npm registry → `@saicmotor/cli` + 插件包发布、`--registry` flag、scoped registry 配置
- CLI 分发机制：`npm install -g` / `npx @saicmotor/cli@latest` 双路径、postinstall skills 注册（含 npm v11 限制）
- AI 阅读机制：`saicmotor-suite` skill → 路由表 → 业务 skill（`saicmotor-leave`等）→ AI 拼出 CLI 命令 → 用户确认 → 执行
- CLI 认证机制：password / exchange（飞书 OAuth）双协议、token 缓存、`ensureToken()` 拦截器
- 周边架构：mock-gateway（飞书 SSO 回调 + 反向代理）、mock-services（业务 mock 数据）
- 插件生命周期：双根扫描（linked/ + installed/）、engine 校验、enable/disable、install/uninstall/upgrade

**实施建议**：
- 先讨论确定架构全景文档的结构（太大会没人读，太小不够全）——建议用"一张总图 + 分章深入"模式
- 框架/业务开发者手册可与现有 DEVELOPER.md / sprint 验证手册内容合并重构
- 开发工具可优先考虑 CLI 内置（`saicmotor create plugin --help` 已经很详细）、手册作为补充

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

---

## 已完成

（暂无）
