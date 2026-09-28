# 一键卸载设计（todo #2）

> 状态：已评审通过
> 关联：todo #2「卸载自动化：`npm uninstall -g` 时一键清理全部残留」

## 背景

用户卸载 saicmotor-cli 时，`npm uninstall -g @saicmotor/cli` 只删 npm 包自身，以下残留不会被动到：

1. 已注册到 AI 客户端的 skills 条目（junction / 目录）
2. 本地数据 `~/.saicmotor/`
3. 极端情况下 `npm ls -g` 的陈旧条目

目标：让用户一条命令（或直接 `npm uninstall -g`）即可彻底清干净，**无交互确认**。

## 现状（以代码为准）

| 能力 | 位置 | 说明 |
|------|------|------|
| `unregisterSkill(name)` | `src/plugin/registrar.ts:59` | 按 skill 名删除各 AI 客户端目录下的 junction/目录，失败不抛 |
| `unregisterPluginSkills(skillDirs)` | `src/plugin/registrar.ts:118` | 批量注销插件 skills |
| `AI_CLIENT_SKILL_DIRS` | `src/plugin/registrar.ts:8` | `~/.claude/skills` / `~/.agents/skills` / `~/.codebuddy/skills` |
| `saicmotorDir()` | `src/config.ts` | `SAICMOTOR_HOME ?? ~/.saicmotor` |
| `findPackageRoot()` | `src/pkg-root.ts` | 向上找 `saicmotor.config.json` 标记文件 |
| 顶层 `uninstall` 命令 | 无 | 待新增 |
| `preuninstall` 脚本 | 无（package.json 仅 prepublishOnly/build/clean/test/dev） | 待新增 |

核心 skills 共 2 个：`saicmotor-shared`、`saicmotor-suite`（`packages/cli/skills/` 下，各有 SKILL.md）。插件 skills 由各插件的 `skills/` 目录注册，命名均为 `saicmotor-<name>`。

## 卸载范围（三处残留）

| # | 残留 | 清理方式 |
|---|------|----------|
| A | 各 AI 客户端目录下 `saicmotor-*` 条目 | 按前缀扫描删除 |
| B | `~/.saicmotor/`（config + credentials + token + plugins） | `rm -rf`，尊重 `SAICMOTOR_HOME` |
| C | npm 全局包 `@saicmotor/cli` 自身 | `npm uninstall -g @saicmotor/cli` |

**关键决策：A 类按前缀 `saicmotor-*` 扫描删除，不按 `state.json` 精确枚举。**

理由：核心 2 个 + 未来所有插件 skill 都共享 `saicmotor-` 前缀，一次覆盖干净；且不依赖 `state.json` 完整——即使用户手动删过 state.json，残留 junction 也能被兜住。这正是「卸载干净」的语义。

## 触发路径（两者结合）

### 路径 1（主）：`saicmotor uninstall` 命令

新增顶层命令，注册于 `src/cli/index.ts`。执行顺序：

1. 按前缀清空 skills（A 类）
2. `rm -rf saicmotorDir()`（B 类）
3. `execSync("npm uninstall -g @saicmotor/cli", { stdio: "inherit" })`（C 类自删）
4. 打印验证提示（`saicmotor --version` 应不可用、各 skills 目录应无 `saicmotor-*`）

### 路径 2（兜底）：`preuninstall` lifecycle 脚本

`package.json` 新增 `"preuninstall": "node scripts/uninstall.js"`。

- 只做 A + B，**不碰 C**（npm 正在删包，脚本不再递归删包）。
- 全步骤 try/catch，**永不抛出、永不非零退出**，绝不阻断 `npm uninstall` 本身。

## 自删时序（关键坑）

1. **双触发**：路径 1 第 3 步 `npm uninstall -g` 会触发路径 2 的 preuninstall，A/B 被删两遍。**清理必须幂等**（删不存在目录是 no-op），否则第二次报错。
2. **进程自删安全**：`execSync` 删自身 `scripts/run.js`，Node 已读入内存，Windows 下安全。`stdio: "inherit"` 透传 npm 输出；捕获失败时**打印手动命令收尾，不静默**。
3. **cwd/定位**：preuninstall 脚本用 `__dirname` 定位自身，不依赖 `findPackageRoot()`（删到一半时 `saicmotor.config.json` 标记文件可能已被动）。

## npx 规避

复用飞书 CLI 已验证信号：`process.env.npm_command === "exec"`。

- **preuninstall 脚本**：`npm_command === "exec"` 时直接 `exit 0`，不清理。npx 临时缓存回收触发 hook 时，绝不能删用户全局的 `~/.saicmotor` 与 skills。
- **`saicmotor uninstall` 命令**：不做 npx 规避——用户显式敲 `uninstall` 即明确卸载意图，即使经 npx 也应执行。

## 测试策略

| 用例 | 断言 |
|------|------|
| 幂等 | 连跑两次，第二次不报错 |
| 按前缀清空 | 客户端目录 `saicmotor-*` 全消失，`其他skill` 保留 |
| 尊重 `SAICMOTOR_HOME` | 删的是 env 覆盖的目录 |
| preuninstall npx 规避 | `npm_command=exec` 时零删除 |
| preuninstall 永不抛 | 目录不存在/锁定时仍 exit 0 |
| 自删失败降级 | mock `npm` 失败 → 打印手动命令 |

## 文件改动清单

- `packages/cli/src/plugin/registrar.ts`：新增「按前缀清空全部 skills」函数
- `packages/cli/src/cli/index.ts`：注册顶层 `uninstall` 命令
- `packages/cli/scripts/uninstall.js`：新增 preuninstall 脚本（幂等、永不抛、npx 规避）
- `packages/cli/package.json`：新增 `preuninstall` script；`files` 补 `scripts/uninstall.js`
- 测试：新增 uninstall 命令 + preuninstall 脚本用例
