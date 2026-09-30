# Sprint 10 — 版本号管理体系规划

> **状态**：⚪ 待排期（新建）
> **创建于**：2026-09-30
> **来源**：TODO 事项 9「版本号管理体系规划」（原 [../sprint-quick/todo.md](../sprint-quick/todo.md)）
> **性质**：专题 sprint——统一版本号单一真相源，消除 0.x 阶段 semver `^` 不跨小版本带来的插件兼容陷阱。

---

## 1. 背景

当前版本号散落在多处且策略不一致，存在隐藏陷阱：

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

## 2. 目标

1. 版本号**单一真相源**：核心包改一处 `version`，全体系（cli/sdk/suite/脚手架）自动同步。
2. 消除 0.x 阶段 `^` 跨小版本陷阱：脚手架默认 `engine` 用开放上界 `>=x.y.z`。
3. 沉淀版本管理规范 + 升级 checklist 文档。

## 3. 架构决策（已定）

**两层模型**（类比 Spring 生态：Spring Boot 统一版本 → 各 Starter 独立版本 + 声明兼容范围）：

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

## 4. 任务拆解

### 4.1 核心包版本硬编码消除

- [ ] `program.version()` 与 suite SKILL.md 的 `version` 字段动态读取 `packages/cli/package.json` → `version`，与 `CORE_VERSION` 对齐——改一个文件，全体系同步
- [ ] sdk 的 `version` 在 publish 脚本中自动同步到 cli 的 `version` 值

### 4.2 插件 engine 声明默认值

- [ ] 过渡期（0.x）脚手架生成 `>=0.8.0` 而非 `^0.8.0`——因为 semver 0.x 的 `^` 连小版本都不跨（`^0.8.0` = `<0.9.0`），导致 CLI 每次升级都变成对插件的 breaking change

  | 方案 | 声明 | 0.8→0.9 兼容？ | 适用阶段 |
  |------|------|:---:|------|
  | `>=0.8.0` | 开放上界 | ✅ | 0.x 过渡期（当前） |
  | `^1.0.0` | `<2.0.0` | — | 跳 1.0 后启用 semver 标准路径 |

### 4.3 engine 兼容检查的粒度

- [ ] 当前只检查 `CORE_VERSION` 是否满足 `manifest.engine`，先保持**单向检查**
- [ ] 未来是否做严格双向检查（核心也声明支持的插件最小版本）——暂缓，仅记录方向

### 4.4 跳 1.0 的时机

- [ ] API 稳定、插件生态 ≥ 3 个生产插件、连续 2 个小版本无 breaking change 时跳 1.0

## 5. 交付物

1. 版本管理规范文档（纳入 framework-v2，作为 `08-versioning.md` 或合并入 `09-build-and-publish.md`）
2. 代码调整：
   - `program.version()` → 动态读 `package.json`
   - suite `version` → 构建时从 `package.json` 注入
   - 脚手架 `engine` 默认值 → `>=0.8.0`
   - sdk 发布脚本 → 自动同步 cli version
3. 升级 checklist 文档

## 6. 验收标准

- CLI 0.8 → 0.9 升级后，engine 声明 `>=0.8.0` 的旧插件不被禁用
- 核心三件套（cli/sdk/suite）版本号始终一致，只需改 `packages/cli/package.json` 的 `version` 一处
- 脚手架生成的插件 `engine` 字段默认值为 `>=x.y.z`（0.x 阶段）

## 7. 关联文档

- [端到端架构设计（S7/S8/S9）](../sprint-1-8/sprint-7-2026-09-23-scoped-distribution-plugin-architecture.md)
- [TODO 清单](../sprint-quick/todo.md)
