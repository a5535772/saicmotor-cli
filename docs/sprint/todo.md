# TODO — 待办事项清单

> 记录人工验证 / 开发中发现的优化项，按优先级排序。
> 已完成事项请见 [done.md](./done.md)。

---

## 目录

| # | 事项 | 类型 | 优先级 | 状态 |
|---|------|------|:------:|:----:|
| 3 | [安装/卸载知识零文档化：HTTP 安装指引 + uninstall skill](#3-安装卸载知识零文档化一个-http-安装指引--一个-uninstall-skill) | 功能 | 🟡 中 | [ ] |
| 7 | [npm publish 时 prepublishOnly → test 触发 exchange 认证弹浏览器](#7-bug-npm-publish-时-prepublishonly--test-触发-exchange-认证弹浏览器) | Bug | 🟡 中 | [ ] |
| 8 | [根 build SDK 编译两次](#8-构建优化根-build-时-sdk-编译两次) | 优化 | 🟢 低 | [ ] |

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

**部分完成**（2026-09-29）：HTTP 安装指引已由 `howto/FOR-AI-INSTALL.md` 覆盖——AI 可通过 WebFetch 获取安装步骤。卸载已由 `saicmotor uninstall` 命令 + `saicmotor-shared` skill 中的卸载指引覆盖，uninstall skill 的独立需求已退化。

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