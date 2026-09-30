# Sprint 8 — v0.8.1 代码质量评审与修复报告（2.0 合并版）

> **日期**：2026-09-29
> **分支**：`fix/code-quality-v0.8.1`
> **评审范围**：`packages/` 下全部 31 个 `.ts` 源文件（不含 `node_modules/`、`dist/`、`test/`）
> **评审方式**：3-agent 并行静态分析（security-reviewer + code-reviewer + 人工）
> **本文档**：合并 [评审报告](./sprint-8-code-quality-review.md) 与 [修复记录](./sprint-8-code-quality-fix.md)，形成单一看板（已修复 + 未修复 + 验证）。

> **合并说明**：原两份文档在「C5/C6 编号」和「严重度统计」上存在不一致（见文末附录），本版按正文实际条目重新核对——SDK 版本号项记作 **C6**；修复记录中多出的「移除 `catalog.ts` 未使用 import」已并入低优修复。

---

## 一、总览

| 严重度 | 发现 | 已修复 | 未修复 |
|:------:|:---:|:---:|:---:|
| 🔴 严重 | 1 | 1 | 0 |
| 🟠 高 | 5 | 3 | 2 |
| 🟡 中 | 10 | 3 | 7 |
| 🟢 低 | 14 | 5 | 9 |
| **合计** | **30** | **12** | **18** |

- 已修复 12 项：1 🔴 + 3 🟠 + 3 🟡 + 5 🟢。
- 未修复 18 项：均记录「不修原因」，归入三类——需人工决策 / 低优先级防御 / 架构重构预留。

---

## 二、已修复项（12）

### 🔴 S1. 命令注入 — `fullName()` 无输入校验

**文件**：`packages/cli/src/cli/plugin-cmds.ts`

**问题**：`plugin install/uninstall/upgrade` 三条命令的用户输入直接拼入 `execSync("npm install ${name} ...")`，含 `;`、`$()` 等 shell 元字符时可执行任意命令。

**修复**：`fullName()` 增加 npm package name 正则白名单，拒绝 shell 元字符：

```typescript
const SAFE_PKG_NAME_RE = /^@?[a-z0-9][\w\-.]*(\/[a-z0-9][\w\-.]*)?$/i;
export function fullName(input: string): string {
  if (!SAFE_PKG_NAME_RE.test(input) && !SAFE_PKG_NAME_RE.test(`@saicmotor/plugin-${input}`)) {
    throw new Error(`无效的包名: ${input}`);
  }
  // ... 原有展开逻辑
}
```

---

### 🟠 L1. Catalog 坏 JSON 硬阻断 CLI 启动

**文件**：`packages/cli/src/engine/catalog.ts`、`packages/cli/src/cli/index.ts`

**问题**：核心 catalog 目录下任意一个 JSON 解析/校验失败都会 `throw`，整个 CLI 无法启动，与插件 loader 的 warning 降级策略不一致。

**修复**：
- `loadCatalog()` 返回类型从 `Service[]` 改为 `{ services: Service[]; warnings: string[] }`。
- 坏 JSON 记 `warnings` 并 `continue`，不阻断加载。
- `index.ts` 合并 catalog warnings 与 plugin warnings 统一输出。

---

### 🟠 L2. `body.code` 类型比较不一致

**文件**：`packages/cli/src/auth/password.ts:31`、`packages/cli/src/engine/run.ts:26`

**问题**：只有 `exchange.ts` 对 `body.code` 做了 `Number()` 包装，另外两处直接 `!== 0` 比较。服务端返回字符串 `"0"` 时会被误判为错误。

**修复**：两处统一为 `Number(body.code) !== 0`。

---

### 🟠 L3. `handleError` SaicmotorError 分支缺 return

**文件**：`packages/cli/src/cli/error.ts`

**问题**：`process.exit(e.exitCode)` 后无 `return`，测试 mock `process.exit` 或极端时序下会穿透到 fallback `process.exit(1)`。

**修复**：`process.exit(e.exitCode)` 后补 `return`。

---

### 🟡 L5. npm 卸载失败静默吞

**文件**：`packages/cli/src/cli/plugin-cmds.ts:130-140`

**问题**：`npm uninstall` 失败被空 catch 吞掉，但后续仍删除 state 并报告成功——用户看到「已卸载」，实际包还在。

**修复**：卸载失败时在 result 附 `error` 字段（warning 级别），CLI 输出 `⚠` 提示 + 手动卸载命令。

---

### 🟡 C2. `catch (e: any)` → `catch (e: unknown)` 8 处

**涉及文件**：`plugin-cmds.ts`、`tooling-cmds.ts`、`registrar.ts`、`loader.ts`

**问题**：strict 模式下 `any` 绕过类型检查，非 Error 值的 `.message` 访问可能抛 TypeError。

**修复**：8 处改 `catch (e: unknown)`，访问 `.message` 时用 `(e as Error).message`。

---

### 🟡 C4. `CORE_VERSION` 硬编码

**文件**：`packages/cli/src/plugin/loader.ts:60`

**问题**：`const CORE_VERSION = "0.8.0"` 与 `cli/index.ts:16` 的 `program.version("0.8.0")` 是两处独立硬编码，版本升级时需手动同步。

**修复**：改为从 `package.json` 动态读取（失败回退 `"0.0.0"`）。

---

### 🟢 S6. state.json 缺文件权限

**文件**：`packages/cli/src/plugin/state.ts:31`

**修复**：`writeFileSync` 加 `{ mode: 0o600 }`，与 `store.ts` 的 credentials/token 存储保持一致。

---

### 🟢 C6. 生成模板 SDK 版本号用 `*`

**文件**：`packages/cli/src/cli/tooling-cmds.ts`

**修复**：`createPluginLogic()` 生成的 `package.json` 中 `"@saicmotor/sdk": "*"` → `"^0.8.0"`，保证可重现。

---

### 🟢 A2 / A4. 死代码标注（非删除）

**文件**：`packages/cli/src/engine/script.ts`（`scriptFileFor()`）、`packages/cli/src/config.ts`（`scriptsDir()`）

**修复**：标注「仅供测试使用」注释，保留给测试引用。

---

### 🟢（额外）移除未使用 import

**文件**：`packages/cli/src/engine/catalog.ts`

**修复**：移除未使用的 `SaicmotorError` import。

---

## 三、未修复项（18）

### 需人工决策（架构 / API / 依赖）

| # | 严重度 | 问题 | 文件 | 不修原因 |
|---|:---:|------|------|---------|
| S2 | 🟠 | 明文密码落盘 | `auth/store.ts` | 需接入 OS 密钥链（keytar 或平台 API），新增跨平台依赖 |
| S3 | 🟠 | `SAICMOTOR_SCRIPTS` 动态 import 可任意执行 | `engine/script.ts` | 需架构讨论（路径围栏 vs 移除变量），当前仅测试用 |
| L6 | 🟡 | 插件脚本 `UpstreamError` 非 `SaicmotorError` 子类 | 插件 `submit.ts` | 需 SDK 暴露错误类，是 API 设计决策 |
| L7 | 🟡 | `findScript` 每次调用重载全部插件 | `engine/script.ts` | 需缓存重构（将已加载插件传入 `runMethod`），非纯 bug |
| C1 | 🟡 | CLI ↔ SDK 类型定义重复 | — | 需 `z.infer` 导出重构，工作量较大 |
| A1 | 🟡 | `loadPlugins(_config)` 参数未使用 | `plugin/loader.ts` | 可能为预留扩展点，需确认设计意图 |

### 低优先级防御性 / 体验

| # | 严重度 | 问题 | 文件 | 不修原因 |
|---|:---:|------|------|---------|
| S4 | 🟡 | Catalog 名缺路径遍历校验 | `schema/catalog.ts` | 低优先防御加固，catalog 来自受信内部 registry |
| S5 | 🟢 | Token 片段暴露（`token.slice(0,8)`） | `cli/auth.ts` | 体验优化，8 字符不足以利用 |
| S7 | 🟢 | 模块级副作用：config 仅 import 时读一次 | `config.ts` | 配置随包发布不变，优先级低 |
| L8 | 🟢 | `skillsAlreadyInstalled()` 任一客户端存在即判已装 | `install/skills.ts` | 用户可用 `--force` 全量重装规避 |
| L9 | 🟢 | Catalog glob 支持不完整 | `plugin/loader.ts` | 当前所有插件路径均为 `catalog/services/*.json`，零实际影响 |
| C5 | 🟢 | 空 catch 块缺注释（9 处） | — | 文档类改进，不涉及功能 |

### 后续 / 跨平台 / 清理

| # | 严重度 | 问题 | 文件 | 不修原因 |
|---|:---:|------|------|---------|
| L4 | 🟡 | 插件冲突处理语义不一致（disable 后不恢复） | `plugin/loader.ts` | 涉及运行时语义变更，需确认期望行为 |
| C3 | 🟡 | 插件 catalog 解析错误静默丢弃无 warning | `plugin/loader.ts` | 需为 `loadPluginServices` 补 warnings channel |
| C7（含 A3） | 🟢 | `validateManifest` 与 `definePlugin` 功能重复 | `sdk/src/manifest.ts` | 纯 SDK API 设计，后续版本清理 |
| A5 | 🟢 | 三个插件包 `src/index.ts` 仅占位注释 | 插件包 | 作为模板骨架保留有参考价值 |
| A6 | 🟢 | junction symlink 非 Windows 总降级为 copy | `registrar.ts` | 需 macOS/Linux 实测后再优化 |
| A7 | 🟢 | SDK `context.ts` 泄露 CLI 实现细节 | `sdk` | API 设计问题，需文档补充或抽象 |

---

## 四、测试与验证

| 指标 | 数值 |
|------|:---:|
| 测试文件数 | 20 |
| 测试用例数 | 162 |
| 通过率 | 162/162 (100%) |

- **测试**：162/162 全绿（149 CLI + 10 SDK + 3 plugin）。
- **构建**：5 包 `tsc` 零错误。
- **分支**：`fix/code-quality-v0.8.1`，基于 `master`。
- **测试缺口**：`copyDirSync` 降级路径、`open.ts` 浏览器打开、OAuth 完整流程无集成测试。

---

## 五、结论

- 高危问题已清零：唯一的 🔴 命令注入已修复，🟠 中 3 项逻辑错误（L1/L2/L3）已修复。
- 剩余 2 项 🟠（S2 明文密码、S3 动态 import）与 7 项 🟡 均属「需架构/API/依赖决策」，非纯 bug，不影响 v0.8.1 发布。
- v0.8.1 可发布；遗留项建议归入后续 sprint 专项（版本管理 / 安全加固 / 缓存重构）。

---

## 六、逐项决策记录

> 针对「未修复项」逐项讨论的结论（2026-09-30），随讨论进度增量补充。

### S2 — 明文密码落盘 → 降级「非风险 / won't fix」

**结论**：非风险，不修。真实业务永远走 SSO / 扫码登录，客户端只持有 token（等同浏览器凭证），不存在「明文账号密码」这一场景；`0o600` 明文本身也是 CLI 凭证存储的行业惯例（AWS `~/.aws/credentials`、gcloud 同理）。原 🟠 降为 🟢 归档。

### S3（含 S4）— 动态 import 路径穿越 → 决定修复（路径围栏，待实现）

**结论**：
- 「攻击者控制 `SAICMOTOR_SCRIPTS` 环境变量」判定为**伪风险**：能设该变量的攻击者同样能设 `NODE_OPTIONS="--require ..."` 或劫持 `PATH`，环境变量可控 ≈ 已 RCE，不构成新的安全边界。
- 真实风险是 `service/resource/method` 拼进 `path.join` 可能含 `../` 穿越，与 **S4**（catalog 名缺路径校验）同根。
- **决定修复**：`findScript()` 增加路径围栏——候选路径 `path.resolve()` 后校验仍落在对应 base 目录内，否则跳过。一次关闭 S3 + S4，S4 并入本项不再单独讨论。

### L4 — 插件冲突处理语义 → 决定修复（改进 warning，待实现）

**结论**：
- 采纳甲：保持 first-wins 语义，改进 warning 文案为可操作——明确「当前 `X` 生效，若要 `Y` 生效请 disable `X`」（点名胜者/败者）。
- **纠正评审报告**：报告中「disable 先加载者后不会恢复后来者」与代码不符。实际 `loadPlugins()` 每次命令重扫描、disabled 插件在加载前即被跳过（`loader.ts:146-149`），因此 disable 掉胜出者后，下一次运行败者的 service 会正常恢复。真实问题仅是：warning 没说清该 disable 谁，以及 first-wins 顺序依赖 `readdirSync` 未排序（隐式）。

### L6 — 插件脚本 `UpstreamError` 非 `SaicmotorError` → 决定修复（SDK 导出错误类 + 结构判断，待实现）

**结论**：
- 采纳甲：SDK 导出运行时 `SaicmotorError`（单一真相源，含 `category`/`hint`/`upstream`/`exitCode`）；CLI `handleError` 改为**结构性判断**（认 `category` + `exitCode`，或用 `Symbol.for` 全局符号打标），避免 `instanceof` 因「插件与 CLI 各有一份 `@saicmotor/sdk`」而失灵；两个插件脚本改 `import { SaicmotorError } from "@saicmotor/sdk"` 并删除本地重复的 `UpstreamError`。
- 顺带修复语义 bug：原 `new UpstreamError("upstream", ...)` 把分类字符串塞进 `code` 字段，改为 `new SaicmotorError("upstream", msg, { upstream })`。

### L7 — `findScript` 每次重载全部插件 → 归档（稍后处理，见 backlog）

**结论**：
- 采纳丙：归档为「过早优化」。当前 3 个插件，重复扫描成本 ~ms 级，无实际影响。
- **关键澄清**：最初设想的「模块级 memo 3 行」不安全——`loadPlugins` 的调用点需求不同：`registrar.writeSuiteRoutes()` → `buildSuiteRoutes()`（`suite.ts:6`）在 install/uninstall/dev 之后调用，必须读到**刚变更**的 state，不能命中缓存；仅 `findScript`（`script.ts:54`）和 `plugin list`（`plugin-cmds.ts:326`）可复用启动结果。
- 正确修法（把启动 `plugins` 传入 `runMethod`→`findScript`）改动中等、收益毫秒级，故延后。已单独立 story 至 [`../backlog/loadplugins-cache-refactor.md`](../backlog/loadplugins-cache-refactor.md)，待插件数量上来再做。

### C1 — CLI ↔ SDK 类型定义重复 → 归档（backlog，计划 Sprint 9 处理）

**结论**：
- 归入 Sprint 9 处理。详见 [`../sprint-9/cli-sdk-type-deduplication.md`](../sprint-9/cli-sdk-type-deduplication.md)。
- 重复 3 处：catalog 类型（SDK `catalog-types.ts` interface ↔ CLI `schema/catalog.ts` zod）、脚本上下文（SDK `context.ts` ↔ CLI `engine/script.ts`/`run.ts`）、配置（SDK `config-types.ts` ↔ CLI `config.ts`）。
- 评审原「SDK 零依赖」理由已失效：`sdk/package.json` 中 zod 为 runtime dependency。
- 修复方向：SDK 收口单一真相源（catalog zod schema + 脚本上下文类型搬入 SDK，CLI 从 SDK import）。

### C3 — 插件 catalog 解析错误静默丢弃 → 决定修复（待实现）

**结论**：
- 采纳甲：`loadPluginServices` 改为返回 `{ services, warnings }`，`loadPlugins` 将其并入已有 `warnings` 数组。
- 与 L1 对齐：L1 已修复核心 catalog（`engine/catalog.ts`）的「降级不阻断 + 记 warning」，本条补齐插件 catalog 的对称缺口，并关闭原注释里的「后续重构时统一传递」TODO。

### A1 — `loadPlugins(_config)` 参数未使用 → 决定修复（待实现）

**结论**：
- 采纳甲：删除 `loadPlugins` 的 `_config` 参数，4 个调用点（`index.ts` / `script.ts` / `plugin-cmds.ts` / `suite.ts`）改为 `loadPlugins()`。YAGNI，死参数应删。

### S5 — 登录后打印 token 片段 → 决定修复（待实现）

**结论**：
- 采纳甲：`cli/auth.ts:25` 去掉 `${token.slice(0, 8)}…` 插值，改为 `已登录，token 已缓存`。8 字符本无可利用性，但删一个插值即可消除「输出 token」的字面嫌疑。

### S7 — 模块级副作用：config 仅 import 时读一次 → 归档（非风险）

**结论**：
- 归档，不改。`pkgConfig` 读的是**随包发布**的 `saicmotor.config.json`，运行期无任何代码改写它（对比：用户 `~/.saicmotor/config.json` 才会被 `saicmotor config` 改写，故 `loadConfig()` 需每次重读）。
- `pkgConfig.defaults.gateway` 仅作最低优先级兜底默认值（`env.SAICMOTOR_GATEWAY` > 用户 config > 此默认），运行期不可能「读到旧值」。原 🟢 维持，结论 won't fix。

### L8 — `skillsAlreadyInstalled()` 任一客户端存在即判已装 → 归档（backlog）

**结论**：
- 采纳丙：维持现状，归入 backlog（见 [`../backlog/skills-already-installed-granularity.md`](../backlog/skills-already-installed-granularity.md)）。
- 真实风险存在（升级新增 skill / 客户端时 `install` 会整体跳过，用户不知需 `--force`），但当前核心 skills 与客户端集合稳定，无触发条件；`registerSkill()` 本身幂等，缺的只是这道门。
- 修法（推荐甲，待实现）：判定改为「每个 skill × 每个客户端**都**存在才返回 `true`」，任一缺失走幂等补装。

### L9 — Catalog glob 支持不完整 → 归档（backlog）

**结论**：
- 采纳丙：归档 backlog（见 [`../backlog/catalog-glob-support.md`](../backlog/catalog-glob-support.md)）。
- `manifest.catalog` 声明为 glob 数组但实现不解析 glob，只认 pattern 是否含 `"services"` 再读死 `catalog/services/*.json`。当前 3 个插件全用默认值，零实际影响。
- **已记录的陷阱**：声明非默认 glob（如 `schemas/*.json`）会被静默跳过、插件加载成零 service 且无 warning。待有插件用非默认 layout 时，按乙（先补 warning）或甲（真 glob）处理。

### C5 — 空 catch 块缺注释（9 处）→ 决定修复（待实现）

**结论**：
- 采纳甲：给 9 处「裸吞 + 无注释」的空 catch 各补一句说明为何吞掉是安全/有意的。纯文档改动，零风险。
- 9 处清单：`config.ts:27`、`state.ts:23`、`registrar.ts:140`、`loader.ts:21/35/65/178`、`plugin-cmds.ts:139`、`engine/catalog.ts:11`。
- 典型高风险缺注释：`state.ts:23` 静默返回空插件表——state.json 损坏时用户已装插件「看似全消失」，必须注明是有意降级（文件缺失/损坏时不阻断 CLI 启动）。

### C7（含 A3）— `validateManifest` 与 `definePlugin` 功能重复 → 归档（并入 Sprint 9 SDK 清理）

**结论**：
- 采纳丙：归档，并入 Sprint 9 的 SDK 清理（与 C1 同批）。
- 两个函数都是 `PluginManifestSchema.parse()` 的一行包装，仅入参类型不同（`unknown` vs `PluginManifest`）。核对全仓：CLI 实际直接 `PluginManifestSchema.parse()`（`loader.ts:101`），`validateManifest`/`definePlugin` 仅出现在 SDK test + README，**生产零使用**。
- 关键判断：manifest 是 **JSON 文件**（`saicmotor.plugin.json`）而非 TS，`definePlugin` 这个「TS 作者助手」是死 API（README 画了饼但无消费者），且入参已被类型系统保证合法，再 `.parse()` 纯冗余。
- Sprint 9 处理方向：只留 `validateManifest`（校验未知输入的正确形态），`definePlugin` 或删或降级为文档示例。

### A5 — 三个插件包 `src/index.ts` 仅占位注释 → 归档（保留，方向未定）

**结论**：
- 采纳丙：保留现状。`src/index.ts`（一行 `placeholder` 注释）是脚手架（`saicmotor create`）生成的预留骨架，编译成无操作 `dist/src/index.js` 并随包发布，但**无任何消费者**——插件入口在声明式（catalog/skills）+ 命令式（`scripts/*.ts`）两侧，不经过 `src/`。
- **纠正评审报告**：报告中「作为模板骨架保留有参考价值」不准确——真正的命令式范本是 `scripts/*.ts`（如 plugin-leave 的 `submit.ts`），`src/index.ts` 无参考价值。
- 保留理由：无害 + 与脚手架约定一致；删除需连带改脚手架模板、收益为零。留给后续「插件是否需要 TS 入口」的 API 方向决策一并处理。

### A6 — junction symlink 非 Windows 总降级为 copy → backlog（非 bug，跨平台规划需求）

**结论**：
- 采纳丙，后续调整为 **backlog**：评审前提大概率有误——`fs.symlinkSync(target, path, "junction")` 的 `type` 是 **Windows 专属**，非 Windows 平台该参数被**忽略**（Node 文档），正常建 symlink，不抛错、不降级为 copy；`catch` 降级只在真正建链失败（文件系统不支持 symlink / 权限）时触发，与平台无关。**故非 bug。**
- 唯一沾边的点是「`"junction"` 硬编码在跨平台代码里语义违和」，且 `saicmotor install` 从未在 macOS/Linux 实测过。
- 动作：因用户迟早要支持 macOS/Linux，作为**跨平台规划需求**入 backlog（story 见 [cross-platform-support.md](../backlog/cross-platform-support.md)），待决定支持时一并实测 + 按平台选 `process.platform === "win32" ? "junction" : "dir"` 收口。

### A7 — SDK `context.ts` 泄露 CLI 实现细节 → 归档（并入 Sprint 9 SDK 清理）

**结论**：
- 采纳丙：归档，并入 Sprint 9 SDK 清理（与 C1/C7 同批）。
- `ScriptContext.config` 的类型是完整 `Config`（含 `auth` 的 9 个字段：loopback 端口、token 路径、exchange 路径等），但插件脚本实际只消费 `config.gateway`。插件契约暴露了 CLI 认证内部实现，契约太宽。
- 与 C1（类型重复）、C7（死 API）收敛到同一动作：SDK 收口一个**窄化、稳定的插件契约**——`Config` 只剩 `{ gateway: string }`，`ScriptContext` 只保留插件真正消费的字段（`gateway`/`service`/`method`/`values`/`dryRun`/`ensureToken`）。

---

## 七、全部发现去向总览（30 项闭环）

> 2026-09-30 汇总：30 项发现（12 已修复 + 18 未修复）均已规划去向，无遗漏、无悬空项。

### 已修复（12 项）→ 无需后续

| ID | 严重度 | 问题 | 处理 | 状态 |
|----|:---:|------|------|------|
| S1 | 🔴 | 命令注入 `fullName()` 无校验 | 正则白名单 | ✅ 已完成 v0.8.1 |
| L1 | 🟠 | Catalog 坏 JSON 硬阻断启动 | 降级 + warning | ✅ 已完成 |
| L2 | 🟠 | `body.code` 类型比较不一致 | 统一 `Number()` | ✅ 已完成 |
| L3 | 🟠 | `handleError` 缺 return | 补 return | ✅ 已完成 |
| L5 | 🟡 | npm 卸载失败静默吞 | 附 warning + 手动命令 | ✅ 已完成 |
| C2 | 🟡 | `catch(e:any)` 8 处 | 改 `unknown` | ✅ 已完成 |
| C4 | 🟡 | `CORE_VERSION` 硬编码（loader.ts） | 动态读 package.json | ✅ 已完成（残余版本号硬编码 → Sprint 10） |
| S6 | 🟢 | state.json 缺文件权限 | `mode: 0o600` | ✅ 已完成 |
| C6 | 🟢 | 模板 SDK 版本号 `*` | 改 `^0.8.0` | ✅ 已完成 |
| A2 | 🟢 | `scriptFileFor()` 死代码 | 标注供测试 | ✅ 已完成 |
| A4 | 🟢 | `scriptsDir()` 死代码 | 标注供测试 | ✅ 已完成 |
| 额外 | 🟢 | `catalog.ts` 未使用 import | 移除 | ✅ 已完成 |

### 未修复（18 项）→ 4 类去向

#### ① Sprint 9 直接修复（7 项 / 8 发现，已定方案，待实现）

| ID | 严重度 | 问题 | 处理 | 何时 |
|----|:---:|------|------|------|
| S3 + S4 | 🟠/🟡 | 动态 import 路径穿越 + catalog 名路径校验 | `path.resolve()` 路径围栏 | Sprint 9（待排期） |
| L4 | 🟡 | 插件冲突 warning 没说清 disable 谁 | 文案点名「当前 X 生效，disable X」 | Sprint 9 |
| L6 | 🟡 | 插件脚本 `UpstreamError` 非 `SaicmotorError` | SDK 导出错误类 + 结构判断 | Sprint 9 |
| C3 | 🟡 | 插件 catalog 解析错误静默丢弃 | `{ services, warnings }` 并入 | Sprint 9 |
| A1 | 🟡 | `loadPlugins(_config)` 死参数 | 删参数，4 调用点改 | Sprint 9 |
| S5 | 🟢 | 登录打印 `token.slice(0,8)` | 改「已登录，token 已缓存」 | Sprint 9 |
| C5 | 🟢 | 9 处空 catch 裸吞无注释 | 各补一句「为何吞安全」 | Sprint 9 |

#### ② Sprint 9 SDK 契约收口（3 项合一）

| ID | 严重度 | 问题 | 处理 | 何时 |
|----|:---:|------|------|------|
| C1 | 🟡 | CLI ↔ SDK 类型重复（3 组） | SDK 收口单一真相源（zod + 类型搬入） | Sprint 9 |
| C7（含 A3） | 🟢 | `validateManifest` / `definePlugin` 一行 `.parse()` 重复 | 只留 `validateManifest`，`definePlugin` 删/降级 | Sprint 9 |
| A7 | 🟢 | SDK `context.ts` 契约太宽（9 个 auth 字段） | 窄化 `Config` → `{ gateway }` | Sprint 9 |

#### ③ backlog（4 项，触发条件满足时再捡起）

| ID | 严重度 | 问题 | 处理 | 何时 |
|----|:---:|------|------|------|
| L7 | 🟡 | `findScript` 每次重载插件 | 缓存重构（传已加载 plugins） | 插件数量上到几十个 |
| L8 | 🟢 | `skillsAlreadyInstalled()` 任一命中即判已装 | 逐 skill×客户端判断 + 幂等补装 | 核心新增 skill 或客户端 |
| L9 | 🟢 | catalog glob 声明不解析 | 补 warning 或真 glob | 有插件用非默认 layout |
| A6 | 🟢 | junction symlink 跨平台语义 | 实测 + 按平台选 `junction`/`dir` | 决定支持 macOS/Linux |

#### ④ 归档（3 项，won't fix / 方向未定）

| ID | 严重度 | 问题 | 处理 | 何时 |
|----|:---:|------|------|------|
| S2 | 🟠 | 明文密码落盘 | 非风险不修（真实业务只走 SSO/扫码） | 不修 |
| S7 | 🟢 | config 模块级副作用（import 读一次） | 非风险不修（读随包发布静态文件） | 不修 |
| A5 | 🟢 | 插件 `src/index.ts` 占位 | 方向未定，随「插件是否需 TS 入口」决策 | 不修 |

---

## 附录：源文档不一致的核对

1. **C5/C6 编号错位**：评审报告正文里 C5=「空 catch 注释」、C6=「SDK 版本 `*`」；修复记录的低优表却把「SDK 版本」标成 C5。本版按评审报告正文，SDK 版本项记作 **C6**。
2. **严重度统计**：两份文档头部「发现/修复」合计（1/5/8/8 = 22）与正文实际列出的条目数（30）不符，且 S6 在正文标 🟢、汇总却计入 🟡 修复。本版按正文逐条重新核对，得 **30 发现 / 12 修复 / 18 未修复**。
3. **额外修复项**：修复记录多出「移除 `catalog.ts` 未使用 `SaicmotorError` import」，评审报告未列，本版并入低优修复。
