# Sprint 8 人工验证手册 — 插件化生态端到端

> **验证目标**：确认 Sprint 8 插件模型、生命周期命令、开发者工具链、skills 注册器、suite 路由聚合全部正常工作。覆盖从 CLI 安装到 AI 发现的完整链路。
>
> **前置条件**：
> - Node.js ≥ 16
> - Docker Desktop（Verdaccio）
> - Java 17 + Maven（mock-server）
> - Sprint 7 已验证通过（Verdaccio 上有 `@saicmotor/cli@0.8.0` 及三个插件包）
>
> **预计耗时**：30 分钟。

---

## S8 新增能力速览

| 能力 | 命令 | 说明 |
|------|------|------|
| 插件加载 | 启动自动 | 双根扫描 linked/ 与 installed/，engine 强校验 |
| 插件安装 | `plugin install <pkg>` | 短名自动展开 `@saicmotor/plugin-<name>` |
| 插件列表 | `plugin list [--json]` | 状态、版本、来源 |
| 启用/禁用 | `plugin enable/disable <name>` | 禁用不卸载 |
| 卸载 | `plugin uninstall <name>` | 同时清理 skills + suite + state |
| 升级 | `plugin upgrade <name>` | 升级到 latest |
| 脚手架 | `create plugin <name>` | 生成标准插件工程 |
| 校验 | `validate <dir>` | manifest zod 校验 |
| 联调 | `dev [--stop]` | junction link 到 linked/ |
| skills 注册 | `install [--force]` | 按各插件 skills 注册到 AI 客户端 |
| suite 聚合 | 随 install/uninstall | 按 routes 字段动态生成路由表 |

---

## 验证概览

| 阶段 | 内容 | 预计耗时 |
|------|------|----------|
| 0 | 环境准备 — Verdaccio + 发布插件包 + mock-server | 5 min |
| 1 | 安装 CLI + 启动加载 — 插件发现 & engine 校验 | 3 min |
| 2 | 插件生命周期 — install / list / disable / enable / upgrade / uninstall | 5 min |
| 3 | 业务功能（以插件形态）— 配置网关 → 登录 → leave/attendance 全链路 | 6 min |
| 4 | Skills 注册 & AI 发现 — 注册器落盘 + suite 聚合 + AI 实战 | 5 min |
| 5 | 开发者工具链 — create / validate / dev | 4 min |
| 6 | 卸载 & 残留清理 | 2 min |

---

## 阶段 0 — 环境准备

### 0.1 全量清理

打开 **PowerShell**：

```powershell
# 卸载 CLI 和全部插件
npm uninstall -g @saicmotor/cli 2>$null

# 卸载本地已安装的 skills（标准方式）
npx skills rm saicmotor-suite -g 2>$null
npx skills rm saicmotor-leave -g 2>$null
npx skills rm saicmotor-attendance -g 2>$null
npx skills rm saicmotor-user -g 2>$null
npx skills rm saicmotor-shared -g 2>$null

# 兜底：暴力清理所有 saicmotor skills 残留（junction/文件/目录）
rm -r -Force $env:USERPROFILE\.claude\skills\saicmotor-* 2>$null
rm -r -Force $env:USERPROFILE\.codebuddy\skills\saicmotor-* 2>$null
rm -r -Force $env:USERPROFILE\.agents\skills\saicmotor-* 2>$null

# 清理插件目录和 state
rm -r -Force $env:USERPROFILE\.saicmotor 2>$null
rm -r -Force $env:USERPROFILE\saicmotor-plugins 2>$null

# 清理 npx 缓存
npm cache clean --force
```

### 0.2 启动 Verdaccio

```powershell
docker ps --filter name=verdaccio
# 没在运行则：
docker run -d --rm --name verdaccio -p 4873:4873 verdaccio/verdaccio
```

验证：
```powershell
curl -s -o /dev/null -w "%{http_code}" http://localhost:4873
```
> **预期**：`200`

### 0.3 本地编译 + 清理旧包 + 发布

S8 是 npm workspaces monorepo（5 个包在 `packages/` 下），需先编译 TypeScript，再从 registry 删除旧版，最后逐个发布。

```powershell
cd D:\work\things\saicmotor-cli-all\saicmotor-cli

# ── 1. 清空旧 dist + 重新编译 ──
npm run clean
npm run build
```
> **预期**：`clean` 清空 5 个包的 `dist/`，`build` 每个包的 `tsc` 都成功。

```powershell
# ── 2. 登录 registry（首次）──
npm login --registry=http://localhost:4873
#admin  123456

# ── 3. 删除 Verdaccio 上所有旧包（确保从干净的 registry 开始）──
npm unpublish @saicmotor/cli --registry=http://localhost:4873 --force 2>$null
npm unpublish @saicmotor/sdk --registry=http://localhost:4873 --force 2>$null
npm unpublish @saicmotor/plugin-user --registry=http://localhost:4873 --force 2>$null
npm unpublish @saicmotor/plugin-leave --registry=http://localhost:4873 --force 2>$null
npm unpublish @saicmotor/plugin-attendance --registry=http://localhost:4873 --force 2>$null
```
> 如果是全新 Verdaccio 容器（`--rm` 启动），可跳过此步。

```powershell
# ── 4. 逐个发布（sdk 必须在 cli 之前，因为 cli 依赖 sdk）──
npm publish --registry=http://localhost:4873 --workspace=packages/sdk
npm publish --registry=http://localhost:4873 --workspace=packages/plugin-user
npm publish --registry=http://localhost:4873 --workspace=packages/plugin-leave
npm publish --registry=http://localhost:4873 --workspace=packages/plugin-attendance
npm publish --registry=http://localhost:4873 --workspace=packages/cli
```
> 唯一依赖关系：`@saicmotor/cli` → `@saicmotor/sdk`（runtime dep），必须 **sdk 先于 cli**。三个插件之间顺序任意。

验证包可见：
```powershell
npm view @saicmotor/cli version --registry=http://localhost:4873
npm view @saicmotor/plugin-leave version --registry=http://localhost:4873
npm view @saicmotor/plugin-attendance version --registry=http://localhost:4873
npm view @saicmotor/plugin-user version --registry=http://localhost:4873
```
> **预期**：分别返回版本号（cli 为 `0.8.0`）。

### 0.4 启动 mock 后端

两个终端：
- **终端 A**：`cd D:\work\things\saicmotor-cli-all\saicmotor-cli-mock-services && mvnw spring-boot:run`
- **终端 B**：`cd D:\work\things\saicmotor-cli-all\saicmotor-cli-mock-gateway && mvnw spring-boot:run`

测试账号：`zhangsan` / `123456`

**截图位：➊ 环境就绪（Verdaccio 200 + 三个插件包可见 + mock 两个 Started）**

---

## 阶段 1 — 安装 CLI + 启动加载

### 1.1 全局安装核心 CLI

```powershell
npm install -g @saicmotor/cli --registry=http://localhost:4873
```
> **预期**：`added` N packages，无致命错误。
>
> **说明**：npm v11 默认拦截全局 postinstall，skills 不会自动注册——这是预期行为，下一步手动注册。

### 1.2 注册内核 skills

```powershell
saicmotor install
```
> **预期**：`✓ 2 个 AI skills 已注册`（`saicmotor-suite` + `saicmotor-shared`）。

```powershell
# 验证内核 skill 已落盘
$core = @("saicmotor-suite", "saicmotor-shared")
foreach ($s in $core) {
    $path = "$env:USERPROFILE\.claude\skills\$s\SKILL.md"
    if (Test-Path $path) { Write-Host "✓ $s" } else { Write-Host "✗ $s 缺失" }
}
```
> **预期**：全部 `✓`。

### 1.3 版本号

```powershell
saicmotor --version
```
> **预期**：`0.8.0`

### 1.4 帮助输出——确认只显示核心框架命令

```powershell
saicmotor --help
```
> **预期**：
> ```
> Commands:
>   install       安装/重装 AI skills 到所有已安装的 AI 工具
>   plugin        插件管理（install / uninstall / list / enable / disable / upgrade）
>   create
>   validate      校验插件 manifest 与 catalog
>   dev           将当前目录 link 为开发插件
>   auth          登录认证
> ```
>
> **关键验证**：此时 **不应出现** `leave` 和 `attendance` 命令——因插件尚未安装，核心引擎不内建任何业务命令。

### 1.5 plugin list——当前为空

```powershell
saicmotor plugin list
```
> **预期**：无插件或显示空。

```powershell
saicmotor plugin list --json
```
> **预期**：合法 JSON，数组为空或插件数为 0。

**截图位：➋ CLI 安装（version + help 无 leave/attendance + plugin list 为空）**

---

## 阶段 2 — 插件生命周期命令

### 2.1 安装 leave 插件

```powershell
saicmotor plugin install leave --registry=http://localhost:4873
```
> 短名 `leave` 自动展开为 `@saicmotor/plugin-leave`。
>
> **预期**：安装成功。

```powershell
saicmotor plugin install leave --json --registry=http://localhost:4873
```
> **预期**：JSON 输出含 `name`、`version`、`status` 字段。

### 2.2 安装 attendance 和 user 插件

```powershell
saicmotor plugin install attendance --registry=http://localhost:4873
saicmotor plugin install user --registry=http://localhost:4873
```

### 2.3 plugin list

```powershell
saicmotor plugin list
```
> **预期**：显示三个插件（plugin-user、plugin-leave、plugin-attendance），状态 `enabled`，来源 `registry`。

```powershell
saicmotor plugin list --json
```
> **预期**：JSON 包含每个插件的 `name`、`version`、`enabled`、`source` 字段，结构稳定。

### 2.4 验证 leave/attendance 命令已加载

```powershell
saicmotor --help
```
> **预期**：命令列表现在包含 `leave` 和 `attendance`（由插件贡献）。

### 2.5 disable 插件

```powershell
saicmotor plugin disable leave
```
> **预期**：`已禁用 @saicmotor/plugin-leave`

```powershell
saicmotor --help
```
> **预期**：`leave` 命令消失。

### 2.6 enable 插件

```powershell
saicmotor plugin enable leave
```
> **预期**：`已启用 @saicmotor/plugin-leave`

```powershell
saicmotor --help
```
> **预期**：`leave` 命令重新出现。

### 2.7 upgrade

```powershell
saicmotor plugin upgrade leave --registry=http://localhost:4873 --json
```
> **预期**：JSON 输出含升级结果。（`--registry` 必带，否则走公共 npm 404）

### 2.8 uninstall 单个插件

```powershell
saicmotor plugin uninstall user --json
```
> **预期**：`user` 插件卸载，`plugin list` 不再包含它。

**截图位：➌ 插件生命周期（install → list → disable → enable → uninstall）**

---

## 阶段 3 — 业务功能（插件形态端到端）

> 安装完整 leave + attendance 后，执行 S1~S4 回归路径——但插件功能应**完全一致**。

### 3.1 配置网关

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.saicmotor"
@'
{ "gateway": "http://localhost:8081" }
'@ | Out-File -FilePath "$env:USERPROFILE\.saicmotor\config.json" -Encoding utf8
```

### 3.2 登录

```powershell
saicmotor auth login --username zhangsan --password 123456
saicmotor auth status
```
> **预期**：登录成功，status 显示 `已登录`。

### 3.3 查询——三种格式

```powershell
# Leave 查询
saicmotor leave balance query --format json
saicmotor leave balance query --format pretty
saicmotor leave balance query --format table
```
> **预期**：都能正常返回数据。

```powershell
# Attendance 查询
saicmotor attendance records query --format table
```
> **预期**：显示 work_days / late_days / early_days。

### 3.4 写操作——请假

```powershell
# dry-run
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --dry-run --format pretty

# 不加 --yes 应被拒绝
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假

# 正确提交
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --yes --format pretty
```
> **预期**：dry-run 显示 `dryRun: true`；无 `--yes` 被拒绝提示副作用确认；正确提交返回 `application_id` 和 `status: "PENDING"`。

### 3.5 写操作——补卡

```powershell
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --dry-run --format pretty
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --yes --format pretty
```
> **预期**：返回 `correction_id` 和 `status: "PENDING"`。

**截图位：➍ 业务功能（查询 + 请假提交 + 补卡提交）**

---

## 阶段 4 — Skills 注册 & AI 发现

### 4.1 注册全部 skills

```powershell
saicmotor install --force
```
> `saicmotor install` 首次在阶段 1 已调用，此处 `--force` 强制刷新，确保内核 + 插件 skill 全量注册。
>
> **预期**：`✓ 5 个 AI skills 已注册`（suite + shared + leave + attendance + user）。

### 4.2 确认 SKILL.md 落盘

```powershell
# 一次验证五个 skill
$skills = @("saicmotor-suite", "saicmotor-shared", "saicmotor-leave", "saicmotor-attendance", "saicmotor-user")
foreach ($s in $skills) {
    $path = "$env:USERPROFILE\.claude\skills\$s\SKILL.md"
    if (Test-Path $path) { Write-Host "✓ $s" } else { Write-Host "✗ $s 缺失" }
}
```
> **预期**：全部 `✓`。

### 4.3 验证 suite 路由聚合

```powershell
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md"
```
> **预期**：frontmatter 含 `name: saicmotor-suite` 和 `description`；正文列出意图 → skill 路由表。包含条目如：
> - `请假 → saicmotor-leave`
> - `考勤 → saicmotor-attendance`
> - `打卡 → saicmotor-attendance`

### 4.4 卸载后 suite 自动收缩

```powershell
# 先卸载 leave
saicmotor plugin uninstall leave --json

# 重新注册 skills
saicmotor install --force

# 再查看 suite
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md"
```
> **预期**：suite 中不再包含 leave 相关路由行。仅剩 attendance 路由。

### 4.5 重装 leave 恢复完整 suite

```powershell
saicmotor plugin install leave --registry=http://localhost:4873
saicmotor install --force
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md"
```
> **预期**：leave 路由恢复。

### 4.6 AI 实战验证

> 在 **Claude Code** 当前会话中依次测试。

**测试 A — 能力发现：**
> `你能用 saicmotor 做什么？简要列出可用的业务能力。`

- [ ] **4.6a** AI 提到 `请假` / `leave` 和 `考勤` / `attendance`

**测试 B — 拼出 leave 命令：**
> `帮我提一个请假申请：员工 EMP001，年假，2026-09-25 到 2026-09-27，用 saicmotor`

- [ ] **4.6b** AI 能拼出 `saicmotor leave applications submit --start-date 2026-09-25 --end-date 2026-09-27 --reason 年假 --yes`

**测试 C — 拼出 attendance 命令：**
> `EMP003 在 2026-09-26 忘记打卡了，帮他用 saicmotor 提交补卡`

- [ ] **4.6c** AI 能拼出 `saicmotor attendance corrections submit --date 2026-09-26 --reason 忘记打卡`

**测试 D — plugin list --json 机读：**
> `读取 saicmotor plugin list --json 的输出，告诉我当前装了哪些插件及其版本`

- [ ] **4.6d** AI 能正确解析 JSON 并列出插件名和版本

**截图位：➎ Skills 注册 & AI 发现（SKILL.md 落盘 + suite 内容 + AI 问答）**

---

## 阶段 5 — 开发者工具链

### 5.1 create plugin——脚手架生成

```powershell
mkdir C:\temp\saicmotor-test -Force
cd C:\temp\saicmotor-test
saicmotor create plugin reimbursement
```
> **预期**：`✓ 插件工程已生成: C:\temp\saicmotor-test\plugin-reimbursement`

```powershell
# 查看生成的文件
Get-ChildItem plugin-reimbursement -Recurse -Name
```
> **预期**：包含 `package.json`、`tsconfig.json`、`saicmotor.plugin.json`、`catalog/services/reimbursement.json`、`skills/saicmotor-reimbursement/SKILL.md`、`scripts/README.md`。

**关键验证**：`package.json` 中：
- 无 `peerDependencies`（npm ≥7 不会自动安装 peer）
- `@saicmotor/sdk` 在 `devDependencies` 中
- `saicmotor.plugin.json` 的 `engine` 字段为 `"^0.8.0"`

### 5.2 validate——校验

```powershell
saicmotor validate .\plugin-reimbursement
```
> **预期**：`✓ manifest 校验通过` / `✓ 插件校验通过`

### 5.3 validate——错误场景

```powershell
# 建一个坏 manifest
mkdir C:\temp\saicmotor-test\bad-plugin -Force
@'{ "name": "bad" }' | Out-File -FilePath C:\temp\saicmotor-test\bad-plugin\saicmotor.plugin.json -Encoding utf8
saicmotor validate C:\temp\saicmotor-test\bad-plugin
```
> **预期**：`✗ manifest 校验失败` + 具体错误原因。

### 5.4 dev link——联调

```powershell
cd C:\temp\saicmotor-test\plugin-reimbursement
# 先装依赖（sdk 需要 link 到本地 workspace 或从 registry 装）
npm install --registry=http://localhost:4873

saicmotor dev
```
> **预期**：`✓ dev link 已建立`，路径指向 `~/.saicmotor/plugins/linked/plugin-reimbursement`。

验证 dev plugin 已加载：
```powershell
saicmotor plugin list --json
```
> **预期**：`plugin-reimbursement` 出现，`source` 为 `"linked"`。

### 5.5 dev --stop——解除

```powershell
saicmotor dev --stop
```
> **预期**：`✓ dev link 已解除`

```powershell
saicmotor plugin list --json
```
> **预期**：`plugin-reimbursement` 消失。

### 5.6 清理脚手架

```powershell
rm -r -Force C:\temp\saicmotor-test
```

**截图位：➏ 开发者工具链（create + validate + dev + dev --stop）**

---

## 阶段 6 — 卸载 & 清理

### 6.1 卸载全部插件

```powershell
saicmotor plugin uninstall leave --json
saicmotor plugin uninstall attendance --json
```

### 6.2 确认插件目录清空

```powershell
saicmotor plugin list --json
```
> **预期**：空数组。

### 6.3 卸载 CLI

```powershell
npm uninstall -g @saicmotor/cli
```

### 6.4 验证 CLI 不可用

```powershell
saicmotor --version
```
> **预期**：命令不可识别。

### 6.5 验证残留

```powershell
# 插件的 node_modules（内部 registry 安装路径）
Test-Path "$env:USERPROFILE\.saicmotor\plugins\node_modules\@saicmotor"
```
> **预期**：False 或目录为空。

### 6.6 清理

```powershell
rm -r -Force $env:USERPROFILE\.saicmotor 2>$null
# 停止 mock-server（Terminal A + B 各自 Ctrl+C）
# 停止 Verdaccio（可选）
# docker stop verdaccio
```

---

## 验收记录

| 步骤 | 内容 | 结果 | 截图 |
|------|------|:---:|------|
| 0.3 | 四个包全部 publish 成功 | | |
| 0.4 | mock-server 启动（2 个端口） | | ➊ |
| 1.2 | `saicmotor install` 注册内核 skills | | |
| 1.3 | `--version` 输出 `0.8.0` | | |
| 1.4 | `--help` 无 leave/attendance（插件未装） | | ➋ |
| 1.5 | `plugin list` 初始为空 | | ➋ |
| 2.1 | `plugin install leave` 成功 | | |
| 2.3 | `plugin list` 显示三个插件 | | ➌ |
| 2.4 | `--help` 出现 leave/attendance | | |
| 2.5 | `disable` → leave 消失 | | ➌ |
| 2.6 | `enable` → leave 恢复 | | |
| 2.8 | `uninstall user` → list 确认 | | |
| 3.2 | 登录成功 | | |
| 3.3 | 三种格式查询正常 | | ➍ |
| 3.4 | 请假：dry-run → 拒 → 提交 | | ➍ |
| 3.5 | 补卡：dry-run → 提交 | | |
| 4.1 | `saicmotor install` 注册 skills | | |
| 4.2 | 三个 SKILL.md 落盘 | | ➎ |
| 4.3 | suite 路由聚合正确 | | ➎ |
| 4.4 | 卸载 leave → suite 路由收缩 | | |
| 4.5 | 重装 leave → suite 路由恢复 | | |
| 4.6a | AI 发现 saicmotor 能力 | | ➎ |
| 4.6b | AI 拼出 leave 命令 | | |
| 4.6c | AI 拼出 attendance 命令 | | |
| 4.6d | AI 解析 plugin list --json | | |
| 5.1 | `create plugin` 生成正确骨架 | | ➏ |
| 5.2 | `validate` 通过 | | ➏ |
| 5.3 | 坏 manifest 被拒绝 | | |
| 5.4 | `dev` link 建立 → list 可见 | | ➏ |
| 5.5 | `dev --stop` 解除 → list 消失 | | |
| 6.2 | 全部卸载后 plugin list 为空 | | |
| 6.3-6.4 | CLI 卸载干净 | | |

---

## 发现的问题

| 编号 | 严重程度 | 描述 |
|:----:|----------|------|
| | | |

---

## 结论

- [ ] 全部通过，Sprint 8 验收完成，可进入 Sprint 9
- [ ] 有问题但不阻塞发布（见上表）
- [ ] 阻塞性问题，需修复后重新验证