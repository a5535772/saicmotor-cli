# saicmotor-cli 人工测试指南

> **目的**：从零搭建环境，逐命令验证 saicmotor-cli 全部功能（安装 → 插件管理 → 业务功能 → AI 发现 → 开发者工具 → 卸载清理）。
> **适用版本**：@saicmotor/cli ≥ 0.8.0
> **预计耗时**：35–40 分钟
> **测试账号**：zhangsan / 123456（mock 后端预置）

---

## 前置条件

- Node.js ≥ 20
- Docker Desktop（启动 Verdaccio 本地 npm registry）
- Java 17 + Maven（启动 mock-server）
- 从公司内部代码库获取以下仓库（本指南不包含它们的链接，请从内部 Git 平台自行检出）：
  - **saicmotor-cli** — CLI 主仓库（本指南所在仓库）
  - **saicmotor-cli-mock-gateway** — 模拟网关（Spring Boot，端口 8081）
  - **saicmotor-cli-mock-services** — 模拟业务系统（Spring Boot，端口 8080）

> **注意**：本指南全部命令在 **PowerShell** 中执行，路径风格为 `$env:USERPROFILE`。

---

## 系统能力速览

| 能力 | 命令 | 说明 |
|------|------|------|
| AI skills 安装 | `saicmotor install` | 注册内核 skills（suite + shared）到各 AI 客户端 |
| 一键卸载 | `saicmotor uninstall` | 清空全部 skills + 本地数据 + 自删 npm 包 |
| 插件安装 | `saicmotor plugin install <pkg>` | 短名自动展开 `@saicmotor/plugin-<name>` |
| 插件列表 | `saicmotor plugin list [--json]` | 状态、版本、来源 |
| 启用/禁用 | `saicmotor plugin enable/disable <name>` | 同步控制 skills 可见性与 suite 路由 |
| 卸载插件 | `saicmotor plugin uninstall <name>` | 同时清理 skills + suite + state |
| 升级 | `saicmotor plugin upgrade <name>` | 升级到 latest |
| 脚手架 | `saicmotor create plugin <name>` | 生成标准插件工程 |
| 校验 | `saicmotor validate <dir>` | manifest zod 校验 |
| 联调 | `saicmotor dev [--stop]` | junction link 到 linked/ |
| 登录 | `saicmotor auth login` | 飞书 OAuth（exchange 模式） |
| 业务命令 | 动态注册 | leave / attendance / user（来自插件） |

---

## 验证概览

| 阶段 | 内容 | 预计耗时 |
|------|------|----------|
| 0 | 环境准备 — Verdaccio + 编译发布 + mock 后端 | 8 min |
| 1 | 安装 CLI + 启动验证 — install / --help / --version / plugin list | 3 min |
| 2 | 插件生命周期 — install / list / disable / enable / upgrade / uninstall | 6 min |
| 3 | 业务功能端到端 — 配置网关 → 飞书 OAuth 登录 → leave + attendance 全链路 | 6 min |
| 4 | Skills 注册 & AI 发现 — 落盘验证 + suite 路由聚合 + AI 实战 | 5 min |
| 5 | 开发者工具链 — create / validate / dev / dev --stop | 5 min |
| 6 | 卸载 & 残留清理 — saicmotor uninstall 一键清空 | 3 min |

---

## 阶段 0 — 环境准备

### 0.1 全量清理

如果之前安装过旧版 saicmotor-cli，先一键卸载；否则直接清缓存即可。

```powershell
saicmotor uninstall 2>$null
npm cache clean --force
```

> **预期**：无报错（即使没有旧版安装，`saicmotor` 命令不存在时 `2>$null` 会静默跳过）。

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

saicmotor-cli 是 npm workspaces monorepo（5 个包在 `packages/` 下），需先编译 TypeScript，再从 registry 删除旧版，最后逐个发布。

```powershell
cd <saicmotor-cli 仓库根目录>

# ── 1. 清空旧 dist + 重新编译 ──
npm run clean
npm run build
```

> **预期**：`clean` 清空 5 个包的 `dist/`，`build` 每个包的 `tsc` 都成功。

```powershell
# ── 2. 登录 registry（首次）──
npm login --registry=http://localhost:4873
# 用户名/密码：admin / 123456
```

```powershell
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
npm view @saicmotor/sdk version --registry=http://localhost:4873
npm view @saicmotor/plugin-leave version --registry=http://localhost:4873
npm view @saicmotor/plugin-attendance version --registry=http://localhost:4873
npm view @saicmotor/plugin-user version --registry=http://localhost:4873
```

> **预期**：全部返回版本号，cli 为 `0.8.0`。

### 0.4 启动 mock 后端

mock 后端代码在**独立仓库** `saicmotor-cli-mock-gateway` 和 `saicmotor-cli-mock-services` 中，请先从公司内部 Git 平台检出。

打开 **两个终端**（都需要先 `cd` 到对应的仓库根目录）：

- **终端 A**（mock-services，端口 8080）：
  ```powershell
  cd <saicmotor-cli-mock-services 仓库根目录>
  mvnw spring-boot:run
  ```
- **终端 B**（mock-gateway，端口 8081）：
  ```powershell
  cd <saicmotor-cli-mock-gateway 仓库根目录>
  mvnw spring-boot:run
  ```

> **预期**：两个终端分别出现 `Started` 日志行，mock-services 在 8080、mock-gateway 在 8081。
>
> **说明**：Windows 环境下使用仓库自带的 `mvnw`（Maven Wrapper），无需全局安装 `mvn`。

**截图位：➊ 环境就绪（Verdaccio 200 + 5 个包可见 + mock 两个端口 Started）**

---

## 阶段 1 — 安装 CLI + 启动验证

### 1.1 全局安装核心 CLI

```powershell
npm install -g @saicmotor/cli --registry=http://localhost:4873
```

> **预期**：`added` N packages，无致命错误。

### 1.2 注册内核 skills

```powershell
saicmotor install
```

> **预期**：`✓ 2 个 AI skills 已注册`（`saicmotor-suite` + `saicmotor-shared`）。

验证内核 skill 已落盘：
```powershell
$core = @("saicmotor-suite", "saicmotor-shared")
foreach ($s in $core) {
    $p = "$env:USERPROFILE\.claude\skills\$s\SKILL.md"
    if (Test-Path $p) { Write-Host "✓ $s" } else { Write-Host "✗ $s 缺失" }
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

> **预期**：命令列表包含 `install`、`uninstall`、`plugin`、`create`、`validate`、`dev`、`auth`。
>
> **关键验证**：此时 **不应出现** `leave` 和 `attendance` 命令——因插件尚未安装，核心引擎不内建任何业务命令。

### 1.5 确认 uninstall 命令可见

在 `--help` 输出中找到 `uninstall` 行。

> **预期**：存在 `uninstall` 命令及其描述"卸载 saicmotor：清除全部 skills 与本地数据，并自删 npm 全局包"。

### 1.6 plugin list——当前为空

```powershell
saicmotor plugin list
```

> **预期**：无插件或显示空。

```powershell
saicmotor plugin list --json
```

> **预期**：合法 JSON，`plugins` 数组为空。

**截图位：➋ CLI 安装完成（version 0.8.0 + help 无 leave/attendance + plugin list 为空 + uninstall 可见）**

---

## 阶段 2 — 插件生命周期

### 2.1 安装 leave 插件

```powershell
saicmotor plugin install leave --registry=http://localhost:4873
```

> 短名 `leave` 自动展开为 `@saicmotor/plugin-leave`。
>
> **预期**：`✓ @saicmotor/plugin-leave 安装完成，1 个 skills 已注册`

```powershell
saicmotor plugin install leave --json --registry=http://localhost:4873
```

> **预期**：JSON 输出含 `installed`、`version`、`skills` 字段。

### 2.2 安装 attendance 和 user 插件

```powershell
saicmotor plugin install attendance --registry=http://localhost:4873
saicmotor plugin install user --registry=http://localhost:4873
```

> **预期**：各自安装成功。

### 2.3 plugin list

```powershell
saicmotor plugin list
```

> **预期**：显示三个插件（plugin-user、plugin-leave、plugin-attendance），状态 `✓`，来源 `registry`。

```powershell
saicmotor plugin list --json
```

> **预期**：JSON 包含每个插件的 `name`、`version`、`enabled`、`source` 字段。

### 2.4 验证 leave/attendance 命令已加载

```powershell
saicmotor --help
```

> **预期**：命令列表现在包含 `leave` 和 `attendance`（由插件贡献），以及这些命令的子命令和参数。

### 2.5 disable 插件

```powershell
saicmotor plugin disable leave
```

> **预期**：`✓ @saicmotor/plugin-leave 已禁用`

```powershell
saicmotor --help
```

> **预期**：`leave` 命令消失。

### 2.6 enable 插件

```powershell
saicmotor plugin enable leave
```

> **预期**：`✓ @saicmotor/plugin-leave 已启用`

```powershell
saicmotor --help
```

> **预期**：`leave` 命令重新出现。

### 2.7 upgrade

```powershell
saicmotor plugin upgrade leave --registry=http://localhost:4873 --json
```

> **预期**：JSON 输出含升级结果。

### 2.8 uninstall 单个插件

```powershell
saicmotor plugin uninstall user --json
```

> **预期**：`user` 插件卸载。`plugin list` 不再包含它。

**截图位：➌ 插件生命周期（install → list → disable → enable → uninstall）**

---

## 阶段 3 — 业务功能端到端

> 安装完整 leave + attendance 后，执行业务全链路——命令行为应与内置插件完全一致。

### 3.1 配置网关

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.saicmotor"
@'
{ "gateway": "http://localhost:8081" }
'@ | Out-File -FilePath "$env:USERPROFILE\.saicmotor\config.json" -Encoding utf8
```

> **预期**：无报错，文件写入成功。

### 3.2 登录（飞书 OAuth）

```powershell
saicmotor auth login
```

> **说明**：默认 exchange 模式，CLI 会启动本地回调服务器（端口 3000），弹出浏览器访问飞书授权页。首次可能需要手动启动浏览器或根据终端提示操作。
>
> **预期**：浏览器弹出 → 完成授权 → 终端显示 `已登录，token 已缓存（…）`。

验证登录状态：

```powershell
saicmotor auth status
```

> **预期**：`已登录`

### 3.3 查询——三种格式

```powershell
# Leave 查询
saicmotor leave balance query --format json
saicmotor leave balance query --format pretty
saicmotor leave balance query --format table
```

> **预期**：三种格式都正常返回数据。

```powershell
# Attendance 查询
saicmotor attendance records query --format table
```

> **预期**：显示 work_days / late_days / early_days。

### 3.4 写操作——请假

```powershell
# dry-run（预览，不发送）
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --dry-run --format pretty

# 不加 --yes 应被拒绝
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假

# 正确提交
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --yes --format pretty
```

> **预期**：
> - dry-run 显示 `dryRun: true`
> - 无 `--yes` 被拒绝：`该命令有副作用，加 --yes 确认，或加 --dry-run 预览`
> - 正确提交返回 `application_id` 和 `status: "PENDING"`

### 3.5 写操作——补卡

```powershell
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --dry-run --format pretty
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --yes --format pretty
```

> **预期**：返回 `correction_id` 和 `status: "PENDING"`。

**截图位：➍ 业务功能（查询三种格式 + 请假提交 + 补卡提交）**

---

## 阶段 4 — Skills 注册 & AI 发现

### 4.1 确认 plugin install 已自动注册插件 skills

`plugin install` 会在安装时自动注册插件 skills，无需手动调用 `saicmotor install`。

```powershell
$skills = @("saicmotor-suite", "saicmotor-shared", "saicmotor-leave", "saicmotor-attendance", "saicmotor-user")
foreach ($s in $skills) {
    $p = "$env:USERPROFILE\.claude\skills\$s\SKILL.md"
    if (Test-Path $p) { Write-Host "✓ $s" } else { Write-Host "✗ $s 缺失" }
}
```

> **预期**：全部 5 个 `✓`。

### 4.2 验证 suite 路由聚合

```powershell
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md" -Encoding UTF8
```

> **预期**：frontmatter 含 `name: saicmotor-suite` 和 `description`；正文列出意图 → skill 路由表，包含：
> - `请假 → saicmotor-leave`
> - `考勤 → saicmotor-attendance`
> - `打卡 → saicmotor-attendance`
> - `用户信息 → saicmotor-user`

### 4.3 disable/enable 对 skills 可见性的影响

```powershell
# 先禁用 leave
saicmotor plugin disable leave

# 验证 leave skill junction 已被删除
Test-Path "$env:USERPROFILE\.claude\skills\saicmotor-leave"
```

> **预期**：`False`（disable 时应移除 skill junction）

```powershell
# 验证 suite 路由已收缩
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md" -Encoding UTF8
```

> **预期**：suite 路由表中不再包含 leave 相关行。

```powershell
# 重新启用 leave
saicmotor plugin enable leave

# 验证 leave skill 恢复
Test-Path "$env:USERPROFILE\.claude\skills\saicmotor-leave\SKILL.md"
```

> **预期**：`True`（enable 时应重新注册 skill junction）

### 4.4 卸载后 suite 自动收缩

```powershell
# 先卸载 leave
saicmotor plugin uninstall leave --json

# 再查看 suite
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md" -Encoding UTF8
```

> **预期**：suite 中不再包含 leave 相关路由行。仅剩 attendance 和 user 路由。

```powershell
# 重装 leave
saicmotor plugin install leave --registry=http://localhost:4873

# suite 路由恢复
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md" -Encoding UTF8
```

> **预期**：leave 路由恢复。
>
> **说明**：`plugin install` 内部调 `refreshSuite()`，无需再手动 `saicmotor install --force`。

### 4.5 AI 实战验证

> 在 Claude Code / CodeBuddy 等 AI 客户端中依次测试。以下为自然语言提示词。

**测试 A — 能力发现：**
> `你能用 saicmotor 做什么？简要列出可用的业务能力。`

- [ ] **4.5a** AI 提到 `请假` / `leave` 和 `考勤` / `attendance`

**测试 B — 拼出 leave 命令：**
> `帮我提一个请假申请：员工 EMP001，年假，2026-09-25 到 2026-09-27，用 saicmotor`

- [ ] **4.5b** AI 能拼出 `saicmotor leave applications submit --start-date 2026-09-25 --end-date 2026-09-27 --reason 年假 --yes`

**测试 C — 拼出 attendance 命令：**
> `EMP003 在 2026-09-26 忘记打卡了，帮他用 saicmotor 提交补卡`

- [ ] **4.5c** AI 能拼出 `saicmotor attendance corrections submit --date 2026-09-26 --reason 忘记打卡`

**测试 D — plugin list --json 机读：**
> `读取 saicmotor plugin list --json 的输出，告诉我当前装了哪些插件及其版本`

- [ ] **4.5d** AI 能正确解析 JSON 并列出插件名和版本

**截图位：➎ Skills 注册 & AI 发现（全部 SKILL.md 落盘 + suite 路由表内容 + AI 问答）**

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

**关键验证**：`saicmotor.plugin.json` 中：
- `routes` 字段应包含默认路由条目
- `engine` 字段为 `"^0.8.0"`

### 5.2 validate——校验通过

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
# 先装依赖
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

**截图位：➏ 开发者工具链（create + validate 通过 + 坏 manifest 被拒 + dev link + dev --stop）**

---

## 阶段 6 — 卸载 & 残留清理

### 6.1 卸载全部插件

```powershell
saicmotor plugin uninstall leave --json
saicmotor plugin uninstall attendance --json
```

> **预期**：各自返回卸载成功的 JSON。

### 6.2 确认插件目录清空

```powershell
saicmotor plugin list --json
```

> **预期**：`plugins` 数组为空。

### 6.3 一键卸载 CLI

```powershell
saicmotor uninstall
```

> **预期**：
> - `✓ 已清除 N 个 saicmotor skills`（N ≥ 1，清除 suite + shared skill）
> - `✓ 已删除本地数据 <home>\.saicmotor`
> - npm 输出卸载日志
> - `卸载完成。验证：saicmotor --version 应不可用；各 AI 客户端 skills 目录应无 saicmotor-* 条目`

### 6.4 验证 CLI 不可用

```powershell
saicmotor --version
```

> **预期**：命令不可识别（`saicmotor : 无法将"saicmotor"项识别为 cmdlet...`）。

### 6.5 验证 skills 残留

```powershell
$clients = @(".claude", ".codebuddy", ".agents")
foreach ($c in $clients) {
    $dir = "$env:USERPROFILE\$c\skills"
    if (Test-Path $dir) {
        $left = Get-ChildItem $dir -Name -Filter "saicmotor-*" 2>$null
        if ($left) { Write-Host "✗ $c 残留: $left" } else { Write-Host "✓ $c 干净" }
    } else {
        Write-Host "✓ $c 无 skills 目录"
    }
}
```

> **预期**：全部 `✓ 干净` 或 `✓ 无 skills 目录`。

### 6.6 验证本地数据已删除

```powershell
Test-Path "$env:USERPROFILE\.saicmotor"
```

> **预期**：`False`

### 6.7 停 mock 后端 + Verdaccio

- mock-services（终端 A）：`Ctrl+C`
- mock-gateway（终端 B）：`Ctrl+C`
- Verdaccio（可选）：
  ```powershell
  docker stop verdaccio
  ```

---

## 验收记录

| 步骤 | 内容 | 结果 | 截图 |
|------|------|:---:|------|
| 0.3 | 5 个包全部 publish 成功 | | |
| 0.4 | mock-server 启动（2 个端口） | | ➊ |
| 1.2 | `saicmotor install` 注册内核 skills | | |
| 1.3 | `--version` 输出 `0.8.0` | | |
| 1.4 | `--help` 无 leave/attendance（插件未装） | | ➋ |
| 1.5 | `uninstall` 命令可见 | | ➋ |
| 1.6 | `plugin list` 初始为空 | | ➋ |
| 2.1 | `plugin install leave` 成功（短名展开） | | |
| 2.3 | `plugin list` 显示三个插件 | | ➌ |
| 2.4 | `--help` 出现 leave/attendance | | |
| 2.5 | `disable` → leave 命令消失 | | ➌ |
| 2.6 | `enable` → leave 命令恢复 | | |
| 2.8 | `uninstall user` → list 确认 | | |
| 3.2 | 飞书 OAuth 登录成功 | | |
| 3.3 | 三种格式查询正常 | | ➍ |
| 3.4 | 请假：dry-run → 拒 → 提交 | | ➍ |
| 3.5 | 补卡：dry-run → 提交 | | |
| 4.1 | 5 个 SKILL.md 落盘 | | ➎ |
| 4.2 | suite 路由聚合正确 | | ➎ |
| 4.3 | disable → skill 消失 / 路由收缩；enable → 恢复 | | |
| 4.4 | 卸载 leave → suite 路由收缩；重装 → 恢复 | | |
| 4.5a | AI 发现 saicmotor 能力 | | ➎ |
| 4.5b | AI 拼出 leave 命令 | | |
| 4.5c | AI 拼出 attendance 命令 | | |
| 4.5d | AI 解析 plugin list --json | | |
| 5.1 | `create plugin` 生成正确骨架（含 routes） | | ➏ |
| 5.2 | `validate` 通过 | | ➏ |
| 5.3 | 坏 manifest 被拒绝 | | |
| 5.4 | `dev` link 建立 → list 可见 | | ➏ |
| 5.5 | `dev --stop` 解除 → list 消失 | | |
| 6.2 | 全部卸载后 plugin list 为空 | | |
| 6.3 | `saicmotor uninstall` 一键清干净 | | |
| 6.4-6.6 | CLI 不可用 + skills 干净 + 数据删除 | | |

---

## 发现的问题

| 编号 | 严重程度 | 描述 |
|:----:|----------|------|
| | | |

---

## 结论

- [ ] 全部通过，验收完成
- [ ] 有问题但不阻塞发布（见上表）
- [ ] 阻塞性问题，需修复后重新验证