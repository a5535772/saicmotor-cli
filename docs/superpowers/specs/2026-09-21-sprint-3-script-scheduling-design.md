# Sprint 3 — Scripts 调度机制设计

> **状态**: ⬜ 待实施 | **时间**: 2026-09-21

## 1. 目标

实现三层架构中缺失的 **scripts 层调度机制**：引擎在执行 method 前检测是否存在同名脚本，有则走脚本，无则 HTTP 回放。

## 2. 核心设计

### 2.1 路径约定（不改 catalog）

```
catalog/services/leave.json  →  声明 API（不改）
scripts/leave/applications/submit.ts  →  覆盖同一条 method 的执行
```

匹配规则：`scripts/{serviceName}/{resourceName}/{methodName}.ts`

- 文件存在 → `import()` 动态加载 → 执行脚本
- 文件不存在 → 走现有 HTTP 路径（行为不变）

### 2.2 脚本接口契约

每个脚本文件 `export default` 一个函数：

```typescript
import type { Config } from "../../src/config";
import type { Service, Method } from "../../src/schema/catalog";
import type { RunResult } from "../../src/engine/run";

interface ScriptContext {
  config: Config;
  service: Service;
  method: Method;
  values: Record<string, unknown>;      // coerceFields 已处理，脚本不用再 parse
  dryRun: boolean;
  ensureToken: () => Promise<string>;    // 如需在脚本内调其他 API
}

type ScriptFn = (ctx: ScriptContext) => Promise<RunResult>;
```

### 2.3 run.ts 改造

```
现有: coerceFields → ensureToken → HTTP → checkEnvelope → return
改造: coerceFields → 检测脚本? → [有] executeScript → return
                              → [无] ensureToken → HTTP → checkEnvelope → return
```

关键点：**脚本检测在 ensureToken 之前**。脚本内部如需 token 可自己调用 `ctx.ensureToken()`。这样 dry-run 场景不需要 token 就能走脚本。

### 2.4 runMethod 签名变更

```typescript
// 旧
runMethod(config, service, method, raw, opts)

// 新 — 加 resourceName, methodName 用于脚本路径解析
runMethod(config, service, resourceName, methodName, method, raw, opts)
```

## 3. 文件清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/engine/script.ts` | `findScript()` + `executeScript()` |
| 修改 | `src/engine/run.ts` | 加脚本检测分支，签名加 resourceName/methodName |
| 修改 | `src/cli/index.ts` | 传 resourceName/methodName 给 runMethod |
| 修改 | `src/config.ts` | 加 `scriptsDir()` |
| 新建 | `scripts/` | 空目录（占位） |
| 新建 | `test/unit/script.test.ts` | 单元测试 |
| 修改 | `doc/ARCHITECTURE.md` | 状态标记更新 |

## 4. 验证脚本

写一个小脚本 `scripts/attendance/corrections/submit.ts` 验证调度机制：

- 在 HTTP 提交之前多打一行 log："[script] 补卡申请前校验通过"
- 然后正常走 HTTP（调用内部 HTTP 工具发请求）
- 证明脚本被调用了，且结果正常返回

## 5. 测试计划

`test/unit/script.test.ts` 覆盖：

| 测试 | 覆盖 |
|------|------|
| 有脚本文件时走脚本不走 HTTP | 检测到脚本 → executeScript → 返回脚本结果 |
| 无脚本文件时回退 HTTP | findScript 返回 null → 正常 HTTP 路径 |
| dry-run 走脚本 | 脚本内 dryRun=true 时不发 HTTP |
| 脚本内可调用 ensureToken | 验证 ctx 传递正确 |