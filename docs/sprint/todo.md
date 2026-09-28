# TODO — 待办事项清单

> 记录人工验证 / 开发中发现的优化项，按优先级排序。
> 已完成事项请见 [done.md](./done.md)。

---

## 目录

| # | 事项 | 类型 | 优先级 | 状态 |
|---|------|------|:------:|:----:|
| 2 | [卸载自动化：`npm uninstall -g` 时一键清理全部残留](#2-卸载自动化npm-uninstall--g-时一键清理全部残留) | 功能 | 🟡 中 | [ ] |
| 3 | [安装/卸载知识零文档化：HTTP 安装指引 + uninstall skill](#3-安装卸载知识零文档化一个-http-安装指引--一个-uninstall-skill) | 功能 | 🟡 中 | [ ] |
| 5 | [未登录时 AI 主动交互登录并续跑原任务](#5-优化未登录时-ai-主动发起交互式登录并续跑原任务) | 体验 | 🟢 低 | [ ] |
| 7 | [npm publish 时 prepublishOnly → test 触发 exchange 认证弹浏览器](#7-bug-npm-publish-时-prepublishonly--test-触发-exchange-认证弹浏览器) | Bug | 🟡 中 | [ ] |
| 8 | [根 build SDK 编译两次](#8-构建优化根-build-时-sdk-编译两次) | 优化 | 🟢 低 | [ ] |
| 12 | [文档体系重构：框架开发者/业务开发者/架构全景三类手册 + 开发工具](#12-文档体系重构框架开发者业务开发者架构全景三类手册--开发工具) | 文档 | 🟡 中 | [ ] |

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