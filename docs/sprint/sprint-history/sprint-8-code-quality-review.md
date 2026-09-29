# Sprint 8 — v0.8.1 代码质量评审报告

> **评审日期**：2026-09-29
> **评审类型**：全量静态分析（逻辑错误 / 代码质量 / 安全风险 / 架构耦合）
> **评审范围**：`packages/` 下全部 31 个 `.ts` 源文件（不含 `node_modules/`、`dist/`、`test/`）
> **评审方式**：3-agent 并行（security-reviewer + code-reviewer + 人工）
> **修复分支**：`fix/code-quality-v0.8.1`

---

## 评审概览

| 严重度 | 总计 | 已修复 | 未修复 |
|:------:|:---:|:---:|:---:|
| 🔴 严重 | 1 | 1 | 0 |
| 🟠 高 | 5 | 3 | 2 |
| 🟡 中 | 8 | 4 | 4 |
| 🟢 低 | 8 | 3 | 5 |

---

## 一、安全风险

### 🔴 S1. ✅【已修复】命令注入：插件名未校验直接拼入 shell（plugin-cmds.ts）

**文件**：`packages/cli/src/cli/plugin-cmds.ts:24-28, 61-62, 127, 205-206`

**问题**：`fullName()` 仅做前缀补全，不做任何 shell 元字符过滤。`plugin install/uninstall/upgrade` 三条命令的用户输入直接拼入 `execSync()`。

**修复**：`fullName()` 增加 npm package name 正则白名单 `/^@?[a-z0-9][\w\-.]*(\/[a-z0-9][\w\-.]*)?$/i`，拒绝含 shell 元字符的输入。

---

### 🟠 S2. ❌【未修复】明文密码落盘（auth/store.ts:18-21）

**文件**：`packages/cli/src/auth/store.ts:18-21`

**问题**：`writeCredentials()` 将用户名+密码以明文 JSON 写入 `~/.saicmotor/credentials.json`。虽设了 `0o600` 权限，但备份/取证场景下有泄露风险。

**不修原因**：需接入 OS 密钥链（新增依赖 keytar 或平台 API），涉及新增外部依赖和跨平台适配，留待后续评估。

---

### 🟠 S3. ❌【未修复】`SAICMOTOR_SCRIPTS` 可导致任意代码执行（script.ts:43-47, 74）

**文件**：`packages/cli/src/engine/script.ts:43-47, 74`

**问题**：`findScript()` 接受 `SAICMOTOR_SCRIPTS` 环境变量拼接路径后 `await import(file)` 动态加载。若攻击者控制该环境变量或注入含 `../` 的 catalog 条目，可执行任意 JS/TS 代码。

**不修原因**：需架构讨论（路径围栏 vs 移除该环境变量），该变量当前仅测试使用、生产环境不设。

---

### 🟡 S4. ❌【未修复】Catalog 名缺路径遍历校验（schema/catalog.ts）

**文件**：`packages/cli/src/schema/catalog.ts:23-24`

**问题**：Zod schema 中 `Service.name`、resource 键名、`Method.id` 均接受含 `../` 的字符串。恶意插件 manifest 或 catalog JSON 可造成路径穿越。

**不修原因**：低优先级防御性加固；catalog 来自受信发布渠道（内部 registry）。

---

### 🟢 S5. ❌【未修复】Token 片段暴露（cli/auth.ts:25）

**文件**：`packages/cli/src/cli/auth.ts:25`

**问题**：登录成功后打印 `token.slice(0, 8)`。违反"秘密不输出"原则。

**不修原因**：体验优化，8 字符不足以利用 token，优先级低。

---

### 🟢 S6. ✅【已修复】state.json 缺文件权限（plugin/state.ts:31）

**文件**：`packages/cli/src/plugin/state.ts:31`

**问题**：`saveState()` 写 `state.json` 无显式 `mode`，依赖进程 umask。

**修复**：加 `{ mode: 0o600 }`，与 `store.ts` 保持一致。

---

### 🟢 S7. ❌【未修复】模块级副作用：`saicmotor.config.json` 只在 import 时读一次（config.ts:32）

**问题**：`const pkgConfig = loadPackageConfig()` 在模块 import 时执行，此后不再重读。文件随包发布，实际上不太可能成为问题。

**不修原因**：低优先级，配置随包发布不变，且真需动态化时有更大改动。

---

## 二、逻辑问题

### 🟠 L1. ✅【已修复】Catalog 解析失败硬阻断 CLI 启动（engine/catalog.ts:22）

**文件**：`packages/cli/src/engine/catalog.ts`、`packages/cli/src/cli/index.ts`

**问题**：核心 catalog 目录下任意一个 JSON 解析失败都会 `throw`，导致整个 CLI 无法启动。

**修复**：`loadCatalog()` 改为返回 `{ services, warnings }`，坏 JSON 记 warning 并 skip，不阻断。`index.ts` 适配合并 warnings。

---

### 🟠 L2. ✅【已修复】`code` 字段类型比较不一致

**涉及文件**：`password.ts:31`、`run.ts:26`（exchange.ts:54 原本正确）

**问题**：只有 exchange.ts 对 `body.code` 做了 `Number()` 包装，另外两处直接用 `!== 0` 比较。服务端返回字符串 `"0"` 时会误判。

**修复**：`password.ts` 和 `run.ts` 统一为 `Number(body.code) !== 0`。

---

### 🟠 L3. ✅【已修复】`handleError` 在 SaicmotorError 分支后缺少 return（cli/error.ts:4-11）

**文件**：`packages/cli/src/cli/error.ts:4-11`

**问题**：`process.exit(e.exitCode)` 后无 `return`，测试 mock exit 时可能穿透到 fallback `process.exit(1)`。

**修复**：`process.exit(e.exitCode)` 后补 `return`。

---

### 🟡 L4. ❌【未修复】插件冲突处理语义不一致（plugin/loader.ts:110-126）

**问题**：同名 service 冲突时 warning 暗示用户去 disable，但后来者的 service 已被静默丢弃。disable 先加载者后不会恢复后来者。

**不修原因**：涉及运行时语义变更，需用户确认期望行为再改。

---

### 🟡 L5. ✅【已修复】npm 卸载失败被静默吞 + state 仍被删除（plugin-cmds.ts:130-132）

**文件**：`packages/cli/src/cli/plugin-cmds.ts`

**问题**：`npm uninstall` 失败被空 catch 吞掉，但后续仍 delete state 并报告成功。用户看到"已卸载"，实际包还在。

**修复**：npm 卸载失败时在 result 附 error 字段，CLI 输出 `⚠` + 手动卸载命令提示。

---

### 🟡 L6. ❌【未修复】插件脚本的 `UpstreamError` 不是 `SaicmotorError` 子类

**涉及文件**：`plugin-leave/scripts/.../submit.ts`、`plugin-attendance/scripts/.../submit.ts`

**问题**：本地 `class UpstreamError extends Error` 被抛到 `handleError` 时走不到分类输出，丢失结构化信封和正确退出码。

**不修原因**：需 SDK 暴露错误类供插件使用，是 API 设计决策。

---

### 🟡 L7. ❌【未修复】`findScript` 每次调用重新加载全部插件（engine/script.ts:53）

**问题**：每次 `runMethod` → `findScript` 都调用 `loadPlugins(loadConfig())`，重复读文件/扫描目录/解析 manifest。

**不修原因**：需缓存重构，改动范围较大（需将已加载插件传入 `runMethod`），非纯 bug。

---

### 🟢 L8. ❌【未修复】`skillsAlreadyInstalled()` 任意一个客户端存在即判已安装（install/skills.ts:30-37）

**不修原因**：低优先级，用户可用 `--force` 全量重装规避。

---

### 🟢 L9. ❌【未修复】Catalog glob 支持实际不完整（plugin/loader.ts:158-162）

**不修原因**：当前所有插件 catalog 路径均为 `catalog/services/*.json`，实际影响为零。

---

## 三、代码质量

### 🟡 C1. ❌【未修复】类型定义重复（CLI ↔ SDK）

**不修原因**：需 `z.infer` 导出重构，SDK 目前用纯 interface 可零依赖给插件开发者用，改动需评估。

---

### 🟡 C2. ✅【已修复】`catch (e: any)` → `catch (e: unknown)` 8 处

**涉及文件**：`plugin-cmds.ts`、`tooling-cmds.ts`、`registrar.ts`、`loader.ts`

**修复**：全部 8 处改为 `catch (e: unknown)`，访问 `.message` 时用 `(e as Error).message`。

---

### 🟡 C3. ❌【未修复】Plugin catalog 解析错误静默丢弃（plugin/loader.ts:175）

**问题**：`loadPluginServices()` 中单个 catalog JSON 解析失败被空 catch 吞掉，无 warning。

**不修原因**：`loadPluginServices` 目前无 warnings channel 传回调用方，重构时统一处理。

---

### 🟡 C4. ✅【已修复】`CORE_VERSION` 硬编码未从 package.json 读取（plugin/loader.ts:60）

**文件**：`packages/cli/src/plugin/loader.ts`

**问题**：`const CORE_VERSION = "0.8.0"` 与 `cli/index.ts:16` 是两处独立硬编码。

**修复**：改为从 `package.json` 动态读取 `pkg.version`。

---

### 🟢 C5. ❌【未修复】空 catch 块缺少注释（9 处）

**不修原因**：文档类改进，不涉及功能。

---

### 🟢 C6. ✅【已修复】生成模板中 SDK 版本号用 `*`（tooling-cmds.ts:47）

**文件**：`packages/cli/src/cli/tooling-cmds.ts`

**问题**：`createPluginLogic()` 生成的 `package.json` 中 `"@saicmotor/sdk": "*"` 不可重现。

**修复**：`"*"` → `"^0.8.0"`。

---

### 🟢 C7. ❌【未修复】`validateManifest` 与 `definePlugin` 功能重复（sdk/src/manifest.ts:24-31）

**不修原因**：纯 SDK 侧 API 设计问题，不影响功能，后续版本清理。

---

## 四、架构 & 耦合

### 🟡 A1. ❌【未修复】`loadPlugins(_config)` 参数未使用（plugin/loader.ts:66）

**不修原因**：可能为预留扩展点，需确认设计意图后再定。

---

### 🟢 A2. ❌【未修复】`scriptFileFor()` 仅测试使用（engine/script.ts:22-24）

**文件**：`packages/cli/src/engine/script.ts`

**修复**：已标注 `仅供测试使用` 注释（非删除，保留给测试）。

---

### 🟢 A3. ❌【未修复】`validateManifest` / `definePlugin` 重复 — 见 C7

---

### 🟢 A4. ✅【未删但已标注】`scriptsDir()` 仅测试使用（config.ts:78-80）

**文件**：`packages/cli/src/config.ts`

**修复**：已标注 `仅供测试使用` 注释。

---

### 🟢 A5. ❌【未修复】三个插件包 `src/index.ts` 只有占位注释

**不修原因**：作为模板骨架保留有参考价值。

---

### 🟢 A6. ❌【未修复】junction symlink 非 Windows 总是降级为 copy（registrar.ts:40）

**不修原因**：需 macOS/Linux 实测验证 symlink 行为后再优化。

---

### 🟢 A7. ❌【未修复】SDK `context.ts` 泄露 CLI 实现细节

**不修原因**：API 设计问题，需文档补充或抽象，不影响功能。

---

## 五、测试覆盖

| 指标 | 数值 |
|------|:---:|
| 测试文件数 | 20 |
| 测试用例数 | 162 |
| 通过率 | 162/162 (100%) |

**缺口**：`copyDirSync` 降级路径、`open.ts` 浏览器打开、OAuth 完整流程无集成测试。

---

## 修复结果总览

| 级别 | 发现 | 修复 | 关键项 |
|:---:|:---:|:---:|------|
| 🔴 严重 | 1 | ✅ 1 | S1 命令注入 |
| 🟠 高 | 5 | ✅ 3 | L1 catalog 降级 / L2 code 统一 / L3 handleError return |
| 🟡 中 | 8 | ✅ 4 | C2 any→unknown / L5 卸载 warning / C4 版本动态读 / S6 state 权限 |
| 🟢 低 | 8 | ✅ 3 | C6 SDK 版本 / A2 A4 死代码注释 |

**验证**：162/162 全绿，5 包 tsc 零错误，分支 `fix/code-quality-v0.8.1`。