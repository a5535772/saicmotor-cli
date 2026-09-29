# TODO — 待办事项清单

> 记录人工验证 / 开发中发现的优化项，按优先级排序。
> 已完成事项请见 [done.md](./done.md)。

---

## 目录

| # | 事项 | 类型 | 优先级 | 状态 |
|---|------|------|:------:|:----:|
| 7 | [npm publish 时 prepublishOnly → test 触发 exchange 认证弹浏览器](#7-bug-npm-publish-时-prepublishonly--test-触发-exchange-认证弹浏览器) | Bug | 🟡 中 | [ ] |
| 8 | [根 build SDK 编译两次](#8-构建优化根-build-时-sdk-编译两次) | 优化 | 🟢 低 | [ ] |
| 9 | [版本号管理体系规划](#9-版本号管理体系规划) | 专题 | 🔴 高 | [ ] |

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

## [ ] 9. [专题] 版本号管理体系规划

**提出时间**：2026-09-29
**优先级**：🔴 高
**类型**：专题（需规划 + 文档 + 代码调整）

### 问题背景

当前版本号散落在多处且策略不一致，存在隐藏陷阱：

**版本号出现的位置**：

| 位置 | 当前值 | 类型 | 升级时需手动改？ |
|------|--------|------|:---:|
| `packages/cli/package.json` → `version` | `0.8.0` | 单一事实源 | ✅ |
| `src/cli/index.ts:16` → `program.version()` | `"0.8.0"` | 硬编码字符串 | ✅ |
| `src/plugin/suite.ts:27` → suite SKILL.md | `"version: 0.8.0"` | 硬编码字符串 | ✅ |
| `src/plugin/loader.ts:70` → `CORE_VERSION` | `readCoreVersion()` | ✅ 动态读取 `package.json` | ❌ |
| `src/cli/tooling-cmds.ts:47` → 脚手架 SDK 版本 | `"^0.8.0"` | 硬编码 | ✅ |
| `src/cli/tooling-cmds.ts:85` → 脚手架 engine 字段 | `"^0.8.0"` | 硬编码 | ✅ |

**核心陷阱 — semver 0.x 的 `^` 不跨小版本**：

```
插件 engine 声明 "^0.8.0"  → semver.satisfies("0.9.0", "^0.8.0") = false
```

CLI 从 0.8.0 升级到 0.9.0 时，所有声明 `"engine": "^0.8.0"` 的旧插件**全部被跳过**。这意味着：

1. **每次 CLI 升级都是一次 breaking change**（对插件而言）
2. 用户升级 CLI 后业务命令全部消失，看到的是 3 条 `[saicmotor] 插件不兼容` 警告
3. 插件开发者必须发布新版本（只改 `engine` 字段），用户重新安装

### 架构决策（已定）

**两层模型**：

```
┌─────────────────────────────────────────────┐
│  架构组维护（统一版本号，永远同步发版）         │
│  @saicmotor/cli  +  @saicmotor/sdk           │
│  +  saicmotor-suite  +  saicmotor-shared     │
│  例：cli 0.9.0 → sdk 0.9.0 → suite "0.9.0"  │
│  改一处，全体系自动同步                        │
├─────────────────────────────────────────────┤
│  项目组维护（独立版本号 + 声明核心兼容范围）     │
│  @saicmotor/plugin-leave       v1.2.0        │
│  @saicmotor/plugin-attendance  v2.0.1        │
│  @saicmotor/plugin-*           engine: ">=0.8.0" │
│  插件有自己的发布节奏，不受核心牵制            │
└─────────────────────────────────────────────┘
```

类比 Spring 生态：Spring Boot（核心）统一版本 → 各 Starter（插件）独立版本 + 声明兼容的 Boot 版本范围。

### 需决策的议题

1. **核心包版本硬编码消除**：`program.version()` 和 suite SKILL.md 的 `version` 字段应动态读取 `packages/cli/package.json`→`version`，与 `CORE_VERSION` 对齐——改一个文件，全体系同步。sdk 的 version 在 publish 脚本中自动同步到 cli 的 version 值。

2. **插件 engine 声明默认值**：过渡期（0.x）脚手架生成 `>=0.8.0` 而非 `^0.8.0`——因为 semver 0.x 的 `^` 连小版本都不跨（`^0.8.0` = `<0.9.0`），导致 CLI 每次升级都变成对插件的 breaking change。

   | 方案 | 声明 | 0.8→0.9 兼容？ | 适用阶段 |
   |------|------|:---:|------|
   | `>=0.8.0` | 开放上界 | ✅ | 0.x 过渡期（当前） |
   | `^1.0.0` | `<2.0.0` | — | 跳 1.0 后启用 semver 标准路径 |

3. **engine 兼容检查的粒度**：当前只检查 `CORE_VERSION` 是否满足 `manifest.engine`。未来是否做严格双向检查（核心也声明支持的插件最小版本）？目前先保持单向检查。

4. **何时跳 1.0**：API 稳定、插件生态 ≥ 3 个生产插件、连续 2 个小版本无 breaking change。

### 交付物

1. 版本管理规范文档（纳入 framework-v2，作为 `08-versioning.md` 或合并入 `09-build-and-publish.md`）
2. 代码调整：
   - `program.version()` → 动态读 `package.json`
   - suite `version` → 构建时从 `package.json` 注入
   - 脚手架 `engine` 默认值 → `>=0.8.0`
   - sdk 发布脚本 → 自动同步 cli version
3. 升级 checklist 文档

### 验收标准

- CLI 0.8 → 0.9 升级后，engine 声明 `>=0.8.0` 的旧插件不被禁用
- 核心三件套（cli/sdk/suite）版本号始终一致，只需改 `packages/cli/package.json` 的 `version` 一处
- 脚手架生成的插件 `engine` 字段默认值为 `>=x.y.z`（0.x 阶段）
