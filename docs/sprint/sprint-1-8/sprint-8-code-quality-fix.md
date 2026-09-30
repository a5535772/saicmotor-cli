# Sprint 8 — v0.8.1 代码质量修复

> **日期**：2026-09-29
> **分支**：`fix/code-quality-v0.8.1`
> **来源**：[v0.8.0 代码质量评审报告](../../howto/test-reports/v0.8.0-code-quality.md)
> **评审方式**：3-agent 并行静态分析（security-reviewer + code-reviewer + 人工），覆盖 `packages/` 下全部 31 个 `.ts` 源文件

---

## 评审发现汇总

| 严重度 | 发现 | 本次修复 |
|:------:|:---:|:---:|
| 🔴 严重 | 1 | 1 |
| 🟠 高 | 5 | 3 |
| 🟡 中 | 8 | 4 |
| 🟢 低 | 8 | 3 |

---

## 修复明细

### 🔴 S1. 命令注入 — `fullName()` 无输入校验

**文件**：`packages/cli/src/cli/plugin-cmds.ts`

**问题**：`plugin install/uninstall/upgrade` 三条命令的用户输入直接拼入 `execSync("npm install ${name} ...")`，含 `;` `$()` 等 shell 元字符时可执行任意命令。

**修复**：`fullName()` 增加 npm package name 正则白名单：

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

**问题**：核心 catalog 目录下任意一个 JSON 解析/校验失败都会 `throw`，整个 CLI 无法启动。与插件 loader 的 warning 降级策略不一致。

**修复**：
- `loadCatalog()` 返回类型从 `Service[]` 改为 `{ services: Service[]; warnings: string[] }`
- 坏 JSON 记 `warnings` 并 `continue`，不阻断加载
- `index.ts` 合并 catalog warnings 和 plugin warnings 统一输出

---

### 🟠 L2. `body.code` 类型比较不一致

**文件**：`packages/cli/src/auth/password.ts:31`、`packages/cli/src/engine/run.ts:26`

**问题**：只有 `exchange.ts` 对 `body.code` 做了 `Number()` 包装，另外两处直接用 `!== 0` 比较。服务端若返回字符串 `"0"`（某些 JSON 库行为），会被误判为错误。

**修复**：两处统一为 `Number(body.code) !== 0`。

---

### 🟠 L3. `handleError` SaicmotorError 分支缺 return

**文件**：`packages/cli/src/cli/error.ts`

**问题**：`process.exit(e.exitCode)` 后无 `return`。正常情况进程终止，但测试 mock `process.exit` 或极端时序下会穿透到 fallback `process.exit(1)`。

**修复**：`process.exit(e.exitCode)` 后补 `return`。

---

### 🟡 C2. `catch (e: any)` → `catch (e: unknown)` 8 处

**涉及文件**：`plugin-cmds.ts`、`tooling-cmds.ts`、`registrar.ts`、`loader.ts`

**问题**：TypeScript strict 模式下 `any` 绕过类型检查，非 Error 值的 `.message` 访问可能抛出 TypeError。

**修复**：全部 8 处改为 `catch (e: unknown)`，访问 `.message` 时用 `(e as Error).message`。

---

### 🟡 L5. npm 卸载失败静默吞

**文件**：`packages/cli/src/cli/plugin-cmds.ts:130-140`

**问题**：`uninstallPluginLogic()` 中 `npm uninstall` 失败被空 catch 吞掉，但后续仍删 state 并报告成功。用户看到"已卸载"，实际 npm 包还在。

**修复**：npm 卸载失败时在 result 中附 `error` 字段（warning 级别），CLI 输出 `⚠` 提示 + 手动卸载命令。

---

### 🟡 C4. `CORE_VERSION` 硬编码

**文件**：`packages/cli/src/plugin/loader.ts:60`

**问题**：`const CORE_VERSION = "0.8.0"` 与 `cli/index.ts:16` 的 `program.version("0.8.0")` 是两处独立硬编码，版本升级时需手动同步。

**修复**：改为从 `package.json` 动态读取：

```typescript
function readCoreVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(findPackageRoot(), "package.json"), "utf8"));
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
const CORE_VERSION = readCoreVersion();
```

---

### 🟡 S6. state.json 缺文件权限

**文件**：`packages/cli/src/plugin/state.ts:31`

**修复**：`writeFileSync` 加 `{ mode: 0o600 }`，与 `store.ts` 的 credentials/token 存储保持一致。

---

### 🟢 低优项

| 项 | 文件 | 修复 |
|----|------|------|
| C5 模板 SDK 版本 `"*"` | `tooling-cmds.ts` | `"*"` → `"^0.8.0"` |
| 未使用 import | `catalog.ts` | 移除 `SaicmotorError` import |
| 死代码注释 | `script.ts`、`config.ts` | `scriptFileFor()` / `scriptsDir()` 标注仅供测试 |

---

## 未修复项（需人工决策）

| # | 问题 | 原因 |
|----|------|------|
| S2 | 明文密码落盘 | 需接入 OS 密钥链（新增依赖 keytar 或平台 API） |
| S3 | `SAICMOTOR_SCRIPTS` 动态 import | 需架构讨论（路径围栏 vs 移除该环境变量） |
| L6 | 插件脚本 `UpstreamError` 不是 `SaicmotorError` | 需 SDK 暴露错误类供插件使用 |
| L7 | `findScript` 每次调 `loadPlugins` | 需缓存重构，非纯 bug |
| C1 | CLI/SDK 类型重复 | 需 `z.infer` 导出重构，工作量较大 |
| A1 | `loadPlugins(_config)` 参数未使用 | 可能为预留扩展点，需确认意图 |
| S4 | catalog 名缺路径遍历校验 | 低优先级防御性加固 |
| S5 | token 片段暴露 | 体验优化，token 8 字符不足以利用 |

---

## 验证

- **测试**：162/162 全绿（149 CLI + 10 SDK + 3 plugin）
- **构建**：5 包 tsc 零错误
- **分支**：`fix/code-quality-v0.8.1`，基于 `master`