# 脚本覆盖机制在全局安装后整个失效（两层缺陷）

> **日期**：2026-09-22
> **环境**：Windows 11, npm 11.17.0, Node v24.19.0
> **发现方式**：人工按验证手册执行 `saicmotor leave applications submit --dry-run`，必崩。

---

## 现象

全局安装（GitHub tarball）后，任何带脚本覆盖的命令都报：

```
Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is currently
unsupported for files under node_modules, for
"...\node_modules\saicmotor-cli\scripts\leave\applications\submit.ts"
```

注意：**连 `--dry-run` 都崩**——脚本在 dry-run 判断之前就被 import 了（`src/engine/run.ts:52-54` 先 `findScript` 再 `executeScript`）。

受影响命令：`leave applications submit`、`attendance corrections submit`（catalog 中仅这两个 method 有对应脚本）。无脚本的命令（balance/records query）走 HTTP 回退，正常。

---

## 缺陷 A：node_modules 内禁止 TypeScript type stripping（当前即阻塞）

`src/engine/script.ts:32`：

```typescript
const mod = await import(file);   // file = scripts/**/*.ts
```

Node ≥ 22.6 内置 TypeScript type stripping，但明确规定：**node_modules 内的文件不做 strip**。本地开发时脚本在项目目录内，一切正常；全局安装后脚本位于 node_modules 下，动态 import 直接抛错。

这是"开发环境能跑、安装后必崩"的典型路径假设错误。

## 缺陷 B：脚本 import 包内 src/，registry tarball 里没有（GitHub 安装下被掩盖）

两个脚本内部全部引用源码树：

```typescript
// scripts/leave/applications/submit.ts
import { buildUrl, buildBody } from "../../../src/engine/request";
import { send } from "../../../src/engine/http";
// ...共 5 个 src/ 引用（attendance 脚本同构）
```

关键知识点——**GitHub tarball 与 npm registry tarball 的内容机制不同**：

| | GitHub `tarball/master` | npm registry tarball（`npm pack` 生成） |
|---|---|---|
| 内容 | **整个 git 仓库快照**，tracked 文件全包含 | 只含 `package.json` `files` 字段声明的文件 |
| `files` 字段 | **不生效**（GitHub 不认） | 生效 |
| 实测内容 | 含 src/、test/、docs/、dist/ | 仅 dist/ skills/ catalog/ scripts/ saicmotor.config.json（59 文件） |

所以：
- **现在 GitHub 安装**：缺陷 B 被掩盖（tarball 里恰好有 src/，路径能解析），只剩缺陷 A 阻塞。
- **SP7 发布到 npm registry 后**：registry tarball 不含 src/，即使修好 A，脚本的 import 会 `MODULE_NOT_FOUND`。两个缺陷必须一起修。

---

## 为什么自动化测试全绿却没发现

- 集成测试（`test/integration/*-gateway.test.ts`）全部从**源码目录**运行：脚本不在 node_modules 下（缺陷 A 不触发），src/ 当然存在（缺陷 B 不触发）。
- 测试矩阵里没有"全局安装后调用带脚本命令"这一层。自动化测试覆盖了**代码逻辑**，覆盖不了**安装形态**。

教训：凡涉及运行时按文件路径动态加载的机制（scripts、catalog、plugins），必须有一次"打包→安装到隔离环境→调用"的验证，只在源码树跑测试不够。

---

## 修复（2026-09-22 已实施并验证）

1. **构建时把 scripts 编译进 dist**：tsconfig `rootDir: "."`、include 纳入 `scripts/**/*.ts`，产出 `dist/src/**` + `dist/scripts/**/*.js`。脚本源码的相对 import（`../../../src/*`）在编译布局中恰好解析到 `dist/src/*`，无需改脚本。
2. **运行时优先加载编译产物**：`findScript` 顺序 = `SAICMOTOR_SCRIPTS`（.js/.ts）→ `dist/scripts/**.js` → 源码树 `.ts`（仅本地 dev）。
3. **包根定位**：新增 `src/pkg-root.ts`（`findPackageRoot/packageFile/distRoot`），解决 src→dist/src 深度漂移。
4. postinstall 核心逻辑迁入 `src/install/skills.ts`，`scripts/postinstall.js` 降为薄壳。
5. 验证：npm pack（无 src/）→ 全局安装 tgz → 脱离源码树执行两个 submit `--dry-run`，全部成功；67 tests 全绿。

## 连带缺陷 C：skills ls 的 ANSI 颜色码导致"已安装"误判

修复中实测发现：`npx skills ls -g` 即使 stdio 为 pipe 也输出 ANSI 颜色码，行首为 `\x1b[36m`，`/^saicmotor-/m` 失配 → `skillsAlreadyInstalled()` 恒为 false → 每次 `saicmotor install` / postinstall 都重复注册。修复：匹配前先剥离 `\x1b\[[0-9;]*m`。

教训：对任何外部 CLI 的输出做正则匹配，都要假设它可能带颜色码/装饰字符；先净化再匹配。

否决项：用 tsx 运行时加载脚本——tsx/esbuild 必须进 dependencies，会重蹈 esbuild postinstall 崩溃的覆辙（见 `2026-09-21-deps-only-runtime-tsx-esbuild-postinstall-failure.md`）。