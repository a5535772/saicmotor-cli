# Sprint 7 Scoped 分发实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `saicmotor-cli` 改名为 `@saicmotor/cli` 并通过内部 npm registry（POC 用本地 Docker Verdaccio）发布，主推 `npx @saicmotor/cli@latest`，安装过程不再依赖 git/GitHub。

**Architecture:** 本 sprint 只改分发层，不动内部结构。scoped 改名确立 `@saicmotor/*` 命名空间；registry 端点仅出现在 `.npmrc`（可替换）；postinstall 加入 npx 检测跳过重量操作；`run.js` 在 dist 缺失时对开发环境尝试自动构建、否则提示用新包名重装。skills 注册机制（`npx skills add <GitHub repo>`）保持现状，其 GitHub 依赖是留到 S8 移除的已知欠账。

**Tech Stack:** Node.js + TypeScript + npm（publish / pack / dist-tag）、Verdaccio（Docker）、vitest（现有测试）。

**前置环境说明：** 全程需本地 Docker 可用；registry 端点用 `http://localhost:4873`（可替换为任意内部地址）。所有 `--registry` 与 `.npmrc` 配置均以此端点为占位，实施时替换为真实地址，代码/脚本不硬编码。

---

## Task 1: package.json 改名 + files 显式化 + 去 prepare

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 改 name 与去 prepare 钩子**

将 `package.json` 中 `"name": "saicmotor-cli"` 改为 `"name": "@saicmotor/cli"`。

删除 `scripts` 里的 `prepare` 这一行：
```json
"prepare": "node -e \"if(!require('fs').existsSync('dist/src/cli/index.js'))console.warn('⚠ dist/ 缺失，请运行 npm run build')\"",
```
保留 `prepublishOnly`（已含 `npm run build && npm test`，发布前保证 dist/ 构建）。

- [ ] **Step 2: files 字段显式化**

把 `files` 从目录通配改为显式列出：
```json
"files": [
  "dist/src/**/*.js",
  "dist/scripts/**/*.js",
  "skills/**/*.md",
  "catalog/**/*.json",
  "scripts/run.js",
  "scripts/postinstall.js",
  "saicmotor.config.json"
]
```
> 说明：`dist/scripts/**/*.js` 是 tsconfig 编译出的脚本产物；`src/` 刻意不打包（源码不进发布包）。`scripts/attendance`/`scripts/leave` 是 `.ts` 源码，不可直接打包（生产环境 `import()` `.ts` 抛 `ERR_UNKNOWN_FILE_EXTENSION`）。

- [ ] **Step 3: repository 字段保留现状确认**

保留 `"repository"` 的 `git+https://github.com/a5535772/saicmotor-cli.git`（源码仓库事实，非 npm 包名；内部 registry 场景不强制）。无需改动。

- [ ] **Step 4: 验证打包内容**

Run: `npm pack --dry-run`
Expected: 输出清单包含 `dist/src/**`、`skills/**/*.md`、`catalog/**/*.json`、`scripts/run.js`、`scripts/postinstall.js`、`saicmotor.config.json`；**不含** `src/` 任何文件；包名显示 `@saicmotor/cli@0.4.0`。

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "feat: package 改名 @saicmotor/cli，files 显式化，去 prepare 钩子"
```

---

## Task 2: saicmotor.config.json 与 run.js 安装来源更新

**Files:**
- Modify: `saicmotor.config.json`
- Modify: `scripts/run.js`

- [ ] **Step 1: 更新 saicmotor.config.json**

写入以下内容（删除未引用的 `repository` 字段，`installUrl` 改为新包名，`repo` 暂留——S8 移除）：
```json
{
  "repo": "a5535772/saicmotor-cli",
  "installUrl": "@saicmotor/cli",
  "defaults": {
    "gateway": "http://localhost:8081"
  }
}
```

- [ ] **Step 2: run.js 去掉对 config 的依赖，硬编码新包名 + 自动构建降级**

将 `scripts/run.js` 全文替换为：
```javascript
#!/usr/bin/env node
// saicmotor CLI — 入口 shim（对标 feishu-cli scripts/run.js）
// 职责：代理到编译产物 dist/src/cli/index.js；缺失时开发环境尝试自动构建，
//       否则给出用新包名重装的指引。

const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const entry = path.join(root, "dist", "src", "cli", "index.js");

function buildIfPossible() {
  // 仅开发环境有 src/ 与 node_modules 的 typescript 才尝试自动构建
  const hasSrc = fs.existsSync(path.join(root, "src"));
  const hasTsc = fs.existsSync(path.join(root, "node_modules", ".bin", "tsc"));
  if (!hasSrc || !hasTsc) return false;
  try {
    require("child_process").execSync("npm run build", { cwd: root, stdio: "inherit" });
    return fs.existsSync(entry);
  } catch {
    return false;
  }
}

if (!fs.existsSync(entry) && !buildIfPossible()) {
  console.error(
    [
      "saicmotor CLI 入口缺失。",
      "请重新安装: npm install -g @saicmotor/cli",
      "或在项目目录运行: npm run build",
    ].join("\n")
  );
  process.exit(1);
}

// 代理到真正的 CLI 入口
require(entry);
```

- [ ] **Step 3: 验证 run.js 降级行为（本地模拟 dist 缺失）**

Run:
```bash
mv dist dist.bak && node scripts/run.js --version; mv dist.bak dist
```
Expected: 若本地有 `src/` + `node_modules/.bin/tsc`，自动执行 `npm run build` 后正常输出版本；若无构建能力，打印：
```
saicmotor CLI 入口缺失。
请重新安装: npm install -g @saicmotor/cli
或在项目目录运行: npm run build
```
并以非零码退出。

- [ ] **Step 4: Commit**

```bash
git add saicmotor.config.json scripts/run.js
git commit -m "feat: 安装来源切到 @saicmotor/cli，run.js 自动构建降级"
```

---

## Task 3: postinstall 加入 npx 检测（TDD）

**Files:**
- Modify: `src/install/skills.ts`
- Test: `test/scripts/postinstall.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/scripts/postinstall.test.ts` 的 `import` 中追加 `runPostinstall`；在 describe 块末尾新增：
```typescript
  it("runPostinstall skips skill registration under npx", () => {
    vi.stubEnv("npm_command", "exec");
    execSyncMock.mockImplementation(() => {
      throw new Error("should not be called");
    });

    runPostinstall();

    expect(consoleLogSpy).toHaveBeenCalledWith("npx 模式，跳过 skills 自动注册");
    expect(execSyncMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
```
对应地，import 行改为：
```typescript
import {
  installSkills,
  runPostinstall,
  __setExecSync,
} from "../../src/install/skills";
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/scripts/postinstall.test.ts`
Expected: FAIL —— `runPostinstall is not a function` 或测试断言失败（当前 `runPostinstall` 未做 npx 检测，会调用 installSkills）。

- [ ] **Step 3: 实现 npx 检测**

在 `src/install/skills.ts` 的 `runPostinstall` 顶部插入检测：
```typescript
export function runPostinstall(): void {
  if (process.env.npm_command === "exec") {
    console.log("npx 模式，跳过 skills 自动注册");
    return;
  }
  console.log("\nsaicmotor CLI 安装完成。");
  installSkills();
  console.log("  首次使用前请运行: saicmotor auth login");
  console.log("  探索命令: saicmotor --help\n");
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/scripts/postinstall.test.ts`
Expected: 全部 PASS（含既有 6 个 + 新增 1 个）。

- [ ] **Step 5: 全量测试回归**

Run: `npm test`
Expected: 全绿。

- [ ] **Step 6: 构建**

Run: `npm run build`
Expected: 无类型错误，`dist/src/install/skills.js` 更新。

- [ ] **Step 7: Commit**

```bash
git add src/install/skills.ts test/scripts/postinstall.test.ts
git commit -m "feat: postinstall 在 npx 场景跳过 skills 注册"
```

---

## Task 4: 文档更新

**Files:**
- Modify: `README.md`
- Modify: `howto/INSTALL.md`
- Modify: `howto/DEVELOPER.md`
- Create: `docs/install.md`（HTTP 安装指引，todo#3 之"装"）

- [ ] **Step 1: README 与 howto 中旧包名替换**

用 Grep 定位后，把 README.md、howto/INSTALL.md、howto/DEVELOPER.md 中出现的安装命令替换为：
- `npm install -g saicmotor-cli` → `npm install -g @saicmotor/cli`
- `npx saicmotor-cli` → `npx @saicmotor/cli@latest`
- `github:a5535772/saicmotor-cli` → `@saicmotor/cli`

并在安装命令前补充说明（优先 `--registry` flag，备选 .npmrc scoped config）：
```bash
# 主推方式：--registry flag
npm install -g @saicmotor/cli --registry=http://localhost:4873
# 备选：长期固定配置
npm config set @saicmotor:registry http://localhost:4873
```

- [ ] **Step 2: 新建 HTTP 安装指引 docs/install.md**

创建 `docs/install.md`，内容为 AI 可 WebFetch 即可执行的单一页面：
```markdown
# 安装 saicmotor CLI

```bash
npm install -g @saicmotor/cli --registry=http://localhost:4873
saicmotor --version
```
验证：
```bash
saicmotor --help
```
失败时手动注册 skills：
```bash
saicmotor install
```
> 端点 `http://localhost:4873` 为 POC 占位，替换为内部 registry 地址后即可发布到内网页面。

- [ ] **Step 3: 全仓旧包名收尾检查**

Run（在仓库根目录）:
```bash
grep -rn "saicmotor-cli" --include="*.md" --include="*.json" --include="*.js" --include="*.ts" . --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git --exclude-dir=sprint-history
```
Expected: 仅 `saicmotor.config.json` 的 `repo`（`a5535772/saicmotor-cli`，S8 移除）与 `package-lock.json`（name 由 Step 提交后 npm 再生成为 `@saicmotor/cli`）残留；其余文件无旧包名。若 `package-lock.json` 仍含旧名，运行 `npm install` 重新生成并提交。

- [ ] **Step 4: Commit**

```bash
git add README.md howto/ docs/install.md package-lock.json
git commit -m "docs: 旧包名替换为 @saicmotor/cli，新增 HTTP 安装指引"
```

---

## Task 5: Verdaccio 发布 + 端到端验证

**Files:** 无（环境与验证操作）

- [ ] **Step 1: 启动本地 Verdaccio**

Run:
```bash
docker run -d --rm --name saicmotor-verdaccio -p 4873:4873 verdaccio/verdaccio
```
Expected: 容器运行，`curl -I http://localhost:4873` 返回 200。

- [ ] **Step 2: 登录 registry 并发布**

Run:
```bash
npm adduser --registry http://localhost:4873
npm publish --registry http://localhost:4873
npm dist-tag ls @saicmotor/cli --registry http://localhost:4873
```
Expected: 发布成功；`dist-tag ls` 显示 `latest: 0.4.0`。

- [ ] **Step 3: 干净环境 npx 验证**

Run（在一个临时目录、不依赖任何已有全局安装）:
```bash
cd "$(mktemp -d)"
npx @saicmotor/cli@latest --version --registry=http://localhost:4873
```
Expected: 输出 `0.4.0`；期间**不产生** skills 注册输出（npx 跳过 postinstall 重量操作）。

- [ ] **Step 4: 全局安装验证**

Run:
```bash
npm install -g @saicmotor/cli --registry=http://localhost:4873
saicmotor --version
```
Expected: 输出 `0.4.0`；postinstall 正常触发（打印"saicmotor CLI 安装完成"与 skills 注册结果）。

- [ ] **Step 5: 显式 -g 与 postinstall 输出核对（todo#4 低优先，仅记录不改）**

观察 Step 4 是否能看到 postinstall stdout（npm v11 可能吞掉全局脚本输出）。若被吞，记录到 `docs/sprint/todo.md` 事项 4 的现象备注，不在此 sprint 修复。

- [ ] **Step 6: dist-tag beta 演练（可选，验证 tag 规范）**

Run:
```bash
npm publish --registry http://localhost:4873 --tag beta
npm dist-tag ls @saicmotor/cli --registry http://localhost:4873
npx @saicmotor/cli@beta --version
```
Expected: `beta` tag 指向新版本，`latest` 不变；`npx @saicmotor/cli@beta` 可用。

---

## 自审记录

- **Spec 覆盖：** sprint-7 八项任务——registry 搭建(T5)、scoped 改名(T1)、files 显式化(T1)、run.js 降级(T2)、prepare 去除(T1)、postinstall npx 检测(T3)、HTTP 安装指引(T4)、发布+端到端验证(T5)均落在任务中。旧包名处置(T4 Step3)与 dist-tag 规范(T5 Step6)覆盖。
- **占位符扫描：** 无 TBD/TODO；唯一"暂留"是 `repo` 字段，已在代码注释与 commit 信息中说明 S8 移除，非未知占位。
- **类型一致性：** `runPostinstall`、`installSkills`、`__setExecSync`、`execSyncMock` 名称与 `src/install/skills.ts` 现有导出、测试现状一致；`npm_command === "exec"` 与飞书 CLI npx 检测经验一致。

**已知遗留（不阻塞 S7 验收）：** skills 注册仍经 `npx skills add a5535772/saicmotor-cli` 从 GitHub 拉取，属 S8"收回核心注册器"范围；S7 验收路径（npx 安装 + CLI 调用）不经过该步骤。