# TODO — 待办事项清单

> 记录人工验证 / 开发中发现的优化项，按优先级排序。
> 已完成事项请见 [done.md](./done.md)。

---

## 目录

| # | 事项 | 类型 | 优先级 | 状态 |
|---|------|------|:------:|:----:|
| 7 | [npm publish 时 prepublishOnly → test 触发 exchange 认证弹浏览器](#7-bug-npm-publish-时-prepublishonly--test-触发-exchange-认证弹浏览器) | Bug | 🟡 中 | [ ] |
| 8 | [根 build SDK 编译两次](#8-构建优化根-build-时-sdk-编译两次) | 优化 | 🟢 低 | [ ] |

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
