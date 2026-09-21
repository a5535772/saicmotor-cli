# Sprint 4 — 端到端回归验证：Sprint 1~3 全功能

> **用途**：在全新 Claude Code 会话中粘贴执行，验证 saicmotor-cli 所有已交付功能。
>
> **预计耗时**：15 分钟
>
> **前置条件**：当前工作目录在 `saicmotor-cli` 项目根目录。

---

## 给 AI Agent 的提示词

将下面整段粘贴到新的 Claude Code 对话中：

---

```
你的任务是执行 saicmotor-cli 项目的 Sprint 1~3 全功能端到端回归验证。

## 工作目录

D:\work\things\saicmotor-cli-all\saicmotor-cli

## 背景

saicmotor-cli 是一个面向 AI Agent 的企业 CLI 工具平台，用 skill 编排任务，用 catalog 声明接口，用引擎自动执行。已完成 4 个 Sprint，本次验证 Sprint 1~3 的核心交付。

## 验证流程

按顺序执行以下 5 个阶段，每阶段完成后报告结果。

---

### 阶段 0 — 环境检查

```
cd D:\work\things\saicmotor-cli-all\saicmotor-cli
node --version          # 确认 Node.js 可用
npm --version           # 确认 npm 可用
git status              # 确认在 saicmotor-cli 仓库
npm test                # 先跑一遍全量测试，确认基线
```

**预期**：66 个测试全部通过。

---

### 阶段 1 — Sprint 1 验证：POC 基础骨架

Sprint 1 交付了 CLI 骨架、8 模块引擎、认证体系、catalog 数据、mock-gateway。

#### 1.1 CLI 命令注册

```
npm run build
saicmotor --help
```

**验证点**：
- 能看到完整命令列表：`attendance`、`leave`、`install`、`auth`
- 描述文案：`面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行`

#### 1.2 版本号

```
saicmotor --version
```

**验证点**：输出版本号（非 "command not found"）。

#### 1.3 三种输出格式

```
saicmotor leave balance query --format json
saicmotor leave balance query --format pretty
saicmotor leave balance query --format table
```

**验证点**：
- `json`（默认）：`{"ok":true,"data":{...}}` 信封格式
- `pretty`：美化 JSON
- `table`：ASCII 表格

#### 1.4 配置优先级

```
node -e "
process.env.SAICMOTOR_GATEWAY = 'http://env-test:9999';
const { loadConfig } = require('./dist/config');
console.log('env override:', loadConfig().gateway);
"
```

**验证点**：输出 `http://env-test:9999`（环境变量优先于配置文件默认值）。

#### 1.5 认证命令

```
saicmotor auth --help
```

**验证点**：能看到 `login`、`logout`、`status` 三个子命令。

#### 1.6 写操作安全确认

```
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假
```

**验证点**：不传 `--yes` → 被拒绝，提示 `该命令有副作用，加 --yes 确认，或加 --dry-run 预览`。

#### 1.7 引擎模块测试覆盖

```
npx vitest run test/unit/config.test.ts test/unit/request.test.ts test/unit/http.test.ts test/unit/extract.test.ts test/unit/output.test.ts test/unit/errors.test.ts test/unit/catalog-schema.test.ts test/unit/catalog-load.test.ts test/unit/auth-login.test.ts test/unit/auth-store.test.ts test/unit/run.test.ts
```

**验证点**：全部通过。这覆盖了 Sprint 1 的 8 个引擎模块 + 认证模块。

---

### 阶段 2 — Sprint 2 验证：集成测试 + 401 重登

Sprint 2 补齐了 leave/attendance 集成测试，覆盖 401 自动重登。

#### 2.1 集成测试

```
npx vitest run test/integration/leave-gateway.test.ts test/integration/attendance-gateway.test.ts
```

**验证点**：8 个测试全部通过。关键场景：
- leave: balance → submit round-trip
- leave: 缺参数拒绝、dry-run 预览、401 重登重试
- attendance: records → corrections round-trip
- attendance: 缺参数拒绝、dry-run 预览、401 重登重试

#### 2.2 401 重登验证（代码审查）

读 `test/integration/leave-gateway.test.ts` 的 `relogs in on 401 and retries successfully` 测试，确认流程：
1. 预埋过期 token 到凭证存储
2. 触发业务请求 → 401 响应
3. 引擎自动清缓存、重新登录、获取新 token、重试原请求

---

### 阶段 3 — Sprint 3 验证：三层架构（skill / catalog / script）

Sprint 3 实现了 skill 编排 + catalog 声明 + script 覆盖的三层架构。

#### 3.1 catalog 声明式加载

```
node -e "
const { loadCatalog } = require('./dist/engine/catalog');
const services = loadCatalog();
console.log('systems:', services.map(s => s.name).join(', '));
console.log('leave resources:', Object.keys(services.find(s=>s.name==='leave').resources).join(', '));
"
```

**验证点**：
- 两个系统：`leave, attendance`
- leave 的 resources 包含 `balance` 和 `applications`

#### 3.2 script 覆盖机制

```
npx vitest run test/unit/script.test.ts
```

**验证点**：5 个测试全部通过，覆盖：
- `scriptFileFor` 路径构建
- `findScript` 存在/不存在判断
- `runMethod` 脚本优先于 HTTP
- 无脚本时回退 HTTP
- `dryRun` 和 `ensureToken` 传入脚本上下文

#### 3.3 skills 目录结构

```
ls -la skills/saicmotor-suite/SKILL.md
ls -la skills/saicmotor-leave/SKILL.md
ls -la skills/saicmotor-attendance/SKILL.md
ls -la skills/saicmotor-shared/SKILL.md
```

**验证点**：四个 skill 文件都存在。

#### 3.4 scripts 覆盖文件

```
ls -la scripts/leave/applications/submit.ts
ls -la scripts/attendance/corrections/submit.ts
```

**验证点**：两个脚本覆盖文件都存在（请假提交 + 考勤补签）。

#### 3.5 bin shim 入口

```
cat scripts/run.js
```

**验证点**：
- `bin` 不再直接指向 `dist/cli/index.js`，而是指向 `scripts/run.js`
- run.js 检查 `dist/cli/index.js` 是否存在 → 代理执行

#### 3.6 postinstall 注册 skills

```
node scripts/postinstall.js
```

**验证点**：成功输出 `saicmotor CLI 安装完成` 和 `✓ AI skills 已注册`（或降级提示）。

#### 3.7 saicmotor install 命令

```
saicmotor install --help
```

**验证点**：能看到 `--force` 选项。

#### 3.8 配置中心化

```
node -e "const c = require('./saicmotor.config.json'); console.log('repo:', c.repo); console.log('installUrl:', c.installUrl); console.log('defaults.gateway:', c.defaults.gateway);"
```

**验证点**：
- `repo` = `a5535772/saicmotor-cli`
- `installUrl` = tarball URL
- `defaults.gateway` = `http://localhost:8081`

#### 3.9 配置化读取（run.js 和 postinstall.js 都读配置）

```
node -e "process.env.SAICMOTOR_SKILLS_REPO='test-org/test-repo'; delete require.cache[require.resolve('./scripts/postinstall')]; const p = require('./scripts/postinstall'); console.log('SKILLS_REPO:', p.SKILLS_REPO);"
```

**验证点**：`SKILLS_REPO` = `test-org/test-repo`（环境变量覆盖配置文件默认值）。

---

### 阶段 4 — 全量测试 + 完整性检查

#### 4.1 全量测试

```
npm test
```

**验证点**：16 test files, 66 tests, all passing。

#### 4.2 文档完整性

```
ls docs/ARCHITECTURE.md docs/sprint/总览.md howto/INSTALL.md howto/DEVELOPER.md
```

**验证点**：四个核心文档都存在。

#### 4.3 配置文件完整性

```
node -e "
const c = require('./saicmotor.config.json');
const keys = Object.keys(c);
const required = ['repo', 'installUrl', 'repository', 'defaults'];
const missing = required.filter(k => !(k in c));
if (missing.length) { console.error('MISSING:', missing); process.exit(1); }
console.log('All config keys present:', keys.join(', '));
console.log('defaults keys:', Object.keys(c.defaults).join(', '));
"
```

**验证点**：四个必需配置键都存在，`defaults` 下包含 `gateway`。

#### 4.4 测试覆盖矩阵

| 模块 | 测试文件 | Sprint | 必须通过 |
|------|---------|--------|:---:|
| config | test/unit/config.test.ts | S1 | ✅ |
| request | test/unit/request.test.ts | S1 | ✅ |
| http | test/unit/http.test.ts | S1 | ✅ |
| extract | test/unit/extract.test.ts | S1 | ✅ |
| output | test/unit/output.test.ts | S1 | ✅ |
| errors | test/unit/errors.test.ts | S1 | ✅ |
| catalog-schema | test/unit/catalog-schema.test.ts | S1 | ✅ |
| catalog-load | test/unit/catalog-load.test.ts | S1 | ✅ |
| auth-login | test/unit/auth-login.test.ts | S1 | ✅ |
| auth-store | test/unit/auth-store.test.ts | S1 | ✅ |
| run | test/unit/run.test.ts | S1 | ✅ |
| script | test/unit/script.test.ts | S3 | ✅ |
| install-command | test/unit/install-command.test.ts | S4 | ✅ |
| postinstall | test/scripts/postinstall.test.ts | S4 | ✅ |
| leave-gateway | test/integration/leave-gateway.test.ts | S1/S2 | ✅ |
| attendance-gateway | test/integration/attendance-gateway.test.ts | S2 | ✅ |

---

### 阶段 5 — 报告

按以下格式输出验证报告：

```
## Sprint 1~3 端到端验证报告

| 阶段 | 内容 | 结果 | 备注 |
|------|------|:---:|------|
| 0 | 环境检查 + 全量测试基线 | | |
| 1.1 | CLI 命令注册 | | |
| 1.2 | 版本号 | | |
| 1.3 | 三种输出格式 | | |
| 1.4 | 配置优先级 | | |
| 1.5 | 认证命令 | | |
| 1.6 | 写操作安全确认 | | |
| 1.7 | 引擎模块测试 | | |
| 2.1 | 集成测试 (leave+attendance) | | |
| 2.2 | 401 重登 | | |
| 3.1 | catalog 加载 | | |
| 3.2 | script 覆盖机制 | | |
| 3.3 | skills 目录结构 | | |
| 3.4 | scripts 覆盖文件 | | |
| 3.5 | bin shim 入口 | | |
| 3.6 | postinstall | | |
| 3.7 | saicmotor install | | |
| 3.8 | 配置中心化 | | |
| 3.9 | 配置读取 (env > config) | | |
| 4.1 | 全量测试 (66 tests) | | |
| 4.2 | 文档完整性 | | |
| 4.3 | 配置文件完整性 | | |

结论：
- [ ] 全部通过
- [ ] 有失败项（见上表）
```

不要跳过任何验证项。每步有失败就停下来分析原因。
```

---

## 操作说明

1. 打开新的 Claude Code 会话
2. 将上面代码块中的提示词粘贴进去
3. 等待执行完毕，对照本文件里的预期结果逐项检查
4. 在下面的验收记录中填写结果

---

## 验收记录

| 阶段 | 内容 | 结果 | 备注 |
|------|------|:---:|------|
| 0 | 环境检查 + 全量测试基线 | | |
| 1.1 | CLI 命令注册 | | |
| 1.2 | 版本号 | | |
| 1.3 | 三种输出格式 | | |
| 1.4 | 配置优先级 | | |
| 1.5 | 认证命令 | | |
| 1.6 | 写操作安全确认 | | |
| 1.7 | 引擎模块测试 (11 files) | | |
| 2.1 | 集成测试 (leave+attendance) | | |
| 2.2 | 401 重登代码审查 | | |
| 3.1 | catalog 加载 | | |
| 3.2 | script 覆盖机制 | | |
| 3.3 | skills 目录结构 | | |
| 3.4 | scripts 覆盖文件 | | |
| 3.5 | bin shim 入口 (run.js) | | |
| 3.6 | postinstall 注册 | | |
| 3.7 | saicmotor install 命令 | | |
| 3.8 | 配置中心化 (config.json) | | |
| 3.9 | 配置读取 (env > config) | | |
| 4.1 | 全量测试 66 个 | | |
| 4.2 | 文档完整性 | | |
| 4.3 | 配置文件完整性 | | |

## 发现的问题

| 编号 | 严重程度 | 描述 |
|:----:|----------|------|
| | | |

---

## 结论

- [ ] 全部通过，可以发布 v0.1.0
- [ ] 有问题但不阻塞发布
- [ ] 阻塞性问题，需修复后重新验证