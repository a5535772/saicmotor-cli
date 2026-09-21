# npm Lifecycle Hooks 技术调研：全局安装后自动运行脚本的现状与方案

> **调研日期**：2026-09-22
> **调研范围**：npm v10-v11 lifecycle hooks、`--allow-scripts` 机制、社区 CLI 工具实践
> **结论**：npm v11 的 `allowScripts` 策略是分水岭 — `postinstall` 从默认运行变为需显式允许。最佳方案是"postinstall 尽力而为 + 首次运行懒加载"双保险。

---

## 1. npm Lifecycle Hooks 规范（v11 官方文档）

来源：[npm/cli release/v11 docs/lib/content/using-npm/scripts.md](https://github.com/npm/cli/blob/release/v11/docs/lib/content/using-npm/scripts.md)（2026-05-21 最后更新）

### 1.1 `npm install -g <pkg>` 的完整生命周期顺序

```
preinstall → install → postinstall → prepublish → preprepare → prepare → postprepare
```

**所有 7 个钩子都会触发**（前提是脚本被允许执行）。

### 1.2 各钩子的触发条件

| 钩子 | 触发条件 | 全局安装时？ |
|------|---------|:---------:|
| `preinstall` / `install` / `postinstall` | `npm install`（含 `-g`）| ✅ 运行 |
| `prepublish` (DEPRECATED) | `npm ci` / `npm install` | ✅ 运行 |
| `prepare` | 本地 `npm install`（无参数）+ 打包发布 + **git 依赖安装** | ✅ 运行 |
| `prepublishOnly` | 仅 `npm publish` | ❌ 不运行 |
| `dependencies` | `node_modules` 变更后 | ❌ **全局模式不运行** |

**关键发现：**
- `prepare` 文档明确写："If a package being installed through git contains a `prepare` script, its `dependencies` and `devDependencies` will be installed, and the prepare script will be run, before the package is packaged and installed."
- `dependencies` 脚本明确写："Does NOT run in global mode"
- npm 最佳实践："Don't use `install`. Use a `.gyp` file for compilation, and `prepare` for anything else."

---

## 2. npm v11 `allowScripts` 策略 — 核心变化

### 2.1 时间线

| 版本 | 日期 | 变化 |
|------|------|------|
| v11.16.0 | 2026-05-27 | **Phase 1**：`allowScripts` 引入，install scripts 变为 **opt-in**（默认不运行）|
| v11.17.0 | 2026-06-11 | 在 `unreviewed-scripts` 警告中 **suggest `--allow-scripts` for global installs** |
| v11.17.0 | 2026-06-11 | `allowScripts` tooling 和 `inBundle` 加固 |
| v11.18.0 | 2026-06-29 | `allowScripts` 覆盖 `prune/dedupe/uninstall/audit/link` |
| v11.18.0 | 2026-06-29 | 修复 `allowScripts` enforcement gaps |
| v11.19.0 | 2026-07-28 | install-scripts 命令命名空间化为 `npm install-scripts` |

### 2.2 `--allow-scripts` 的精确语义

**语法**: `--allow-scripts=<package-name>`
**行为**: 在安装期间允许**指定包**的 lifecycle scripts 运行。可多次指定允许多个包。

**当前 npm v11.17.0 的默认配置：**
```
allow-scripts = [""]           # 空列表 — 没有任何包被预授权
allow-scripts-pending = false
allow-scripts-pin = true        # 允许后自动持久化到 package.json
ignore-scripts = false          # 不等于"禁用脚本"，只是标记
strict-allow-scripts = false    # Phase 2 才强制
```

**三种操作模式：**

1. **无 `--allow-scripts`**：脚本不运行，显示警告（当前 Phase 1 行为）
2. **`--allow-scripts=saicmotor-cli`**：仅 `saicmotor-cli` 的脚本运行，其他包仍被阻止
3. **`--dangerously-allow-all-scripts`**：所有包的脚本都运行（不推荐）

### 2.3 用户安装时的警告解读

用户看到的警告：
```
npm warn allow-scripts  saicmotor-cli@0.4.0 (postinstall: ...; prepare: ...)
npm warn allow-scripts
npm warn allow-scripts Run `npm install -g --allow-scripts=saicmotor-cli` to allow these scripts once
```

这说明：**`--allow-scripts=saicmotor-cli` 后，`postinstall` 和 `prepare` 都会运行**。这是设计行为，不是 bug。

---

## 3. 社区 CLI 工具的实践对比

### 3.1 调查结果

| 工具 | `postinstall` | `prepare` | 策略 |
|------|:--:|:--:|------|
| **vite** | ❌ 无 | ❌ 无 | 完全无 lifecycle hook |
| **create-react-app** | ❌ 无 | ❌ 无 | 完全无 lifecycle hook |
| **husky** | ❌ 无 | ❌ 无 | 从 v5 起放弃 postinstall 方案 |
| **npm** 自身 | ❌ 无 | ❌ 无 | 使用 `prepack`/`dependencies` 而非 postinstall |
| **@anthropic-ai/claude-code** | ✅ `node install.cjs` | ✅ 发布守卫 | 仍用 postinstall，有 fallback |
| **saicmotor-cli** | ✅ skills 注册 | ✅ dist 检查 | 当前方案 |

### 3.2 趋势

**社区趋势是远离 lifecycle hooks 做关键操作。** 原因：
1. npm v11 `allowScripts` 使 hook 变得不可靠（用户可能不加 `--allow-scripts`）
2. 网络操作在 postinstall 中容易失败
3. 企业环境（代理、防火墙）不可控
4. husky v5 的经典案例：从 `postinstall` 迁移到 `git config core.hooksPath`

---

## 4. saicmotor-cli 当前代码分析

### 4.1 当前生命周期

```
npm install -g --allow-scripts=saicmotor-cli <tarball>
  │
  ├─ prepare     → node -e "检查 dist/cli/index.js 是否存在" → 永远不警告（dist/ 已提交）
  │
  └─ postinstall → scripts/postinstall.js → npx -y skills add ... --all -g
                    │
                    ├─ 成功 → "✓ AI skills 已注册"
                    └─ 失败 → "⚠ AI skills 注册失败，稍后可手动运行: saicmotor install"（|| true 兜底）
```

### 4.2 问题本质

**不是"脚本不运行"，而是两重不确定性叠加：**

1. **npm 层面**：用户必须加 `--allow-scripts=saicmotor-cli`（否则脚本被跳过）
2. **网络层面**：即使脚本运行了，`npx -y skills add` 依赖网络，可能失败

### 4.3 代码层面已有的兜底

- `postinstall` 已加 `|| true` — 失败不阻断安装 ✅
- `run.js` bin shim 检查 `dist/cli/index.js` — 缺失时给出修复指引 ✅
- `saicmotor install` 命令 — 手动重装 skills 入口 ✅
- `INSTALL.md` 说明文档 — 覆盖了各种失败场景 ✅

**缺失的是：`run.js` 在 `dist/` 存在但 skills 未注册时，没有任何提示。** 用户装完了，`saicmotor --help` 能跑，但 skills 没注册——用户不知道需要手动 `saicmotor install`。

---

## 5. 解决方案分析

### 方案对比

| 方案 | 可靠性 | 实现复杂度 | 用户体验 | 推荐 |
|------|:---:|:---:|:---:|:---:|
| **A: postinstall 尽力而为 + run.js 懒检查** | ⭐⭐⭐⭐ | 低 | 最佳 | ✅ |
| **B: 保持现状，仅改文档** | ⭐⭐ | 最低 | 差 | ❌ |
| **C: 移除所有 lifecycle hooks** | ⭐⭐⭐⭐⭐ | 中 | 一般（需两步）| ⚠️ |
| **D: 改用 `dependencies` 脚本** | ⭐ | 低 | — | ❌ 不运行于全局模式 |
| **E: publish 到 npm registry** | ⭐⭐⭐ | 高 | 好 | 🔮 长期 |

### 推荐方案 A 详解

**核心思路**：`postinstall` 照常尝试（能跑就跑），但如果跑不了或失败了，`run.js` 在首次调用时检测并提示。

**具体改动：**

1. **`scripts/run.js`**（bin 入口）：在 `require(entry)` 之前增加一个轻量检查：
   ```js
   // 检查 skills 是否已注册（只检查文件存不存在，不做网络调用）
   function checkSkillsHint() {
     try {
       const home = process.env.HOME || process.env.USERPROFILE;
       // skills 注册目录（根据 claude-code 的实际路径调整）
       const skillsDir = path.join(home, '.claude', 'skills');
       if (!fs.existsSync(skillsDir)) return;
       const files = fs.readdirSync(skillsDir);
       const hasSaicmotor = files.some(f => f.startsWith('saicmotor-'));
       if (!hasSaicmotor) {
         console.error('⚠ AI skills 未安装。运行 saicmotor install 完成注册。');
       }
     } catch { /* 静默跳过，不阻断 CLI 运行 */ }
   }
   ```
   但这种方式依赖于知道 skills 的存储位置。更好的方式是检查 `.claude`/`.trae` 等已知 AI 工具的目录。

2. **更简单的方式**：不检查文件系统，而是在 CLI 启动时始终打印一条"新用户提示"（只打印一次，通过标记文件判断）：
   ```js
   // 首次运行检测（通过 ~/.saicmotor/.skills-hint-shown 标记文件）
   const hintFile = path.join(configDir, '.skills-hint-shown');
   if (!fs.existsSync(hintFile)) {
     console.error('💡 提示：运行 saicmotor install 安装 AI skills');
     fs.writeFileSync(hintFile, '1');
   }
   ```

3. **`package.json`**：移除 `prepare` 脚本（它已经是无害的 no-op，但每次安装时仍会运行一个 node 进程判断 `dist/` 是否存在——浪费资源）：

   **当前：**
   ```json
   "prepare": "node -e \"if(!require('fs').existsSync('dist/cli/index.js'))console.warn('⚠ dist/ 缺失，请运行 npm run build')\""
   ```
   
   **改为：直接删除 `prepare`**（`dist/` 已提交到仓库，此检查无意义）。

4. **文档 `howto/INSTALL.md`**：在"安装后"第一步就提醒用户运行 `saicmotor install`（而非等到 Q&A）。

---

## 6. 详细建议

### 6.1 立即做（低风险，高收益）

1. **删除 `prepare` 脚本** — 它已经是 no-op，每装一次就浪费一次 node 启动。`dist/` 既然已提交，不需要检查。

2. **保持 `postinstall` 不变** — `|| true` 已经足够稳健。npm v11 用户需要加 `--allow-scripts=saicmotor-cli` 才能触发，这是 npm 生态的新常态。

3. **`run.js` 增加首次运行提示** — 当 skills 未注册时友好提醒用户运行 `saicmotor install`。这填补了当前唯一的体验缺口：用户装完了不知道 skills 没注册。

### 6.2 中期考虑（需要评估）

4. **发布到 npm registry** — 如果用户从 `npm install -g saicmotor-cli`（而非 GitHub tarball URL）安装，npm v11 对 registry 包和 URL 包的处理是一致的。但从 registry 安装有两个好处：
   - 更好的缓存
   - `npm update -g saicmotor-cli` 能正常工作
   - 参考 [npm registry 发布策略](../../../memory/npm-registry-publish-strategy.md)

### 6.3 不推荐的方案

5. **不要试图绕过 `allowScripts`** — npm 的安全策略是合理的，绕过去反而会让用户不安。
6. **不要改用 `dependencies` 脚本** — 明确规定不运行于全局模式。
7. **不要把 `typescript` 移回 `dependencies`** — 已证明这条路不通（见[安装生命周期钩子演变](../../../memory/install-lifecycle-hooks-evolution.md)）。

---

## 7. 调研总结

| 问题 | 答案 |
|------|------|
| `npm install -g` 时 `postinstall` 会运行吗？ | **npm v11+ 默认不运行**，需要 `--allow-scripts=saicmotor-cli` |
| 加上 `--allow-scripts` 后可靠吗？ | 可靠。`postinstall` 和 `prepare` 都会按顺序运行 |
| `prepare` 在全局安装时运行吗？ | 运行。npm v11 官方文档确认 `npm install -g <pkg>` 触发完整 7 步 |
| 社区 CLI 工具怎么做？ | 多数已放弃依赖 lifecycle hooks，改用手动初始化或首次运行懒加载 |
| 最佳方案是什么？ | **双保险**：postinstall 尽力而为 + run.js 首次运行提示 + `saicmotor install` 手动兜底 |

---

## 8. 参考链接

- [npm v11 Scripts 文档](https://docs.npmjs.com/cli/v11/using-npm/scripts) — lifecycle 完整规范
- [npm v11 Changelog](https://github.com/npm/cli/blob/release/v11/CHANGELOG.md) — allowScripts Phase 1 在 v11.16.0
- [npm v11 npm-install 文档](https://docs.npmjs.com/cli/v11/commands/npm-install) — `--allow-scripts` 参数说明
- [安装生命周期钩子演变（内部记忆）](../../../memory/install-lifecycle-hooks-evolution.md) — saicmotor-cli 的 prepare 退化过程