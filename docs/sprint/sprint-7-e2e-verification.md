# Sprint 7 人工验证手册 — Scoped 分发 & npx 主推 & 全链路功能

> **验证目标**：确认 `@saicmotor/cli@0.4.0` 可通过内部 npm registry (Verdaccio) 安装，npx 零副作用，AI skills 注册正常，请假/考勤全链路走通，卸载无残留。
>
> **前置条件**：Node.js ≥ 16、Docker Desktop（运行 Verdaccio 和 mock-server）、Java 17 + Maven（运行 mock-server 需要）。
>
> **预计耗时**：20 分钟。

---

## 验证概览

| 阶段 | 内容 | 预计耗时 |
|------|------|----------|
| 0 | 环境准备 — 启动 Verdaccio + mock-server、全量清理 | 5 min |
| 1 | npx 零副作用验证 | 2 min |
| 2 | 全局安装 & CLI 基础验证 | 3 min |
| 3 | 配置网关 → 登录 → 查询 → 写操作 | 5 min |
| 4 | AI skills 注册 & 可发现性验证 | 3 min |
| 5 | 卸载 & 清理 | 2 min |

---

## 阶段 0 — 环境准备

### 0.1 清理本地全部 saicmotor 残留

打开 **PowerShell**：

```powershell
# ── 卸载所有旧包名（S7 前 github: 安装的 saicmotor-cli, S7 的 @saicmotor/cli）──
npm uninstall -g @saicmotor/cli 2>$null
npm uninstall -g saicmotor-cli 2>$null

# ── 清除旧 skills 注册残留（来自旧 postinstall 的 npx skills add --all）──
npx -y skills remove saicmotor-attendance -g 2>$null
npx -y skills remove saicmotor-leave -g 2>$null
npx -y skills remove saicmotor-shared -g 2>$null
npx -y skills remove saicmotor-suite -g 2>$null

# ── 清除 AI 客户端目录下的 skills 残留 ──
rm -r -Force $env:USERPROFILE\.claude\skills\saicmotor-* 2>$null
rm -r -Force $env:USERPROFILE\.agents\skills\saicmotor-* 2>$null
rm -r -Force $env:USERPROFILE\.codebuddy\skills\saicmotor-* 2>$null

# ── 清除本地数据目录 ──
rm -r -Force $env:USERPROFILE\.saicmotor 2>$null

# ── 清除 npx 缓存（防止 npx 拿到旧缓存版本）──
npm cache clean --force

# ── 确认已不可用 ──
saicmotor --version
```

> **预期**：最后一行显示 `saicmotor : 无法将"saicmotor"项识别为...`

---

### 0.2 启动 Verdaccio（npm 私服）

```powershell
# 确认 Verdaccio 是否已在运行
docker ps --filter name=verdaccio
```

如果没在运行：

```powershell
docker run -d --rm --name verdaccio -p 4873:4873 verdaccio/verdaccio
```

验证：

```powershell
curl -s -o /dev/null -w "%{http_code}" http://localhost:4873
```

> **预期**：`200`

```powershell
npm view @saicmotor/cli version --registry=http://localhost:4873
```

> **预期**：`0.4.0`

---

### 0.3 启动 mock 后端

需要开 **2 个终端**，分别启动业务服务和网关。

和 Sprint 4 一样。

**终端 A — 业务服务（端口 8080）**

```powershell
cd D:\work\things\saicmotor-cli-all\saicmotor-cli-mock-services
mvnw spring-boot:run
```

> 看到 `Started LeaveMockApplication` 说明成功。

**终端 B — 网关（端口 8081）**

```powershell
cd D:\work\things\saicmotor-cli-all\saicmotor-cli-mock-gateway
mvnw spring-boot:run
```

> 看到 `Started GatewayApplication` 说明成功。

测试账号：

| 用户名 | 密码 |
|--------|------|
| zhangsan | 123456 |
| lisi | 123456 |

**截图位：➊ 环境就绪（Verdaccio 200 + mock 两个 Started）**

---

## 阶段 1 — npx 零副作用验证

> S7 核心变更：主推 `npx @saicmotor/cli@latest`，postinstall 检测到 npx 场景自动跳过重量操作。

打开第三个 **PowerShell** 终端，执行：

### 1.1 npx 版本号

```powershell
npx --registry http://localhost:4873 @saicmotor/cli@latest --version
```

> **预期**：只输出 `0.4.0`。**不应出现** `skills`、`安装完成`、`注册`、`已安装` 等字样（npx 跳过 postinstall）。

### 1.2 npx 帮助

```powershell
npx --registry http://localhost:4873 @saicmotor/cli@latest --help
```

> **预期**：
> ```
> Usage: saicmotor [options] [command]
>
> 面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行
>
> Commands:
>   attendance         考勤
>   leave              请假
>   install [options]  安装/重装 AI skills 到所有已安装的 AI 工具
>   auth               登录认证
> ```

### 1.3 确认 npx 无文件副作用

```powershell
Test-Path "$env:USERPROFILE\.claude\skills\saicmotor-suite"
Test-Path "$env:USERPROFILE\.codebuddy\skills\saicmotor-suite"
Test-Path "$env:USERPROFILE\.saicmotor"
```

> **预期**：全部 `False`。npx 临时调用不产生任何持久文件。

**截图位：➋ npx 三连（version + help + 无残留）**

---

## 阶段 2 — 全局安装 & CLI 基础验证

### 2.1 全局安装

```powershell
npm install -g @saicmotor/cli --registry=http://localhost:4873
```

> **预期**：`added 3 packages`。可能会看到 npm v11 的 `allow-scripts` 警告（已知，不影响——postinstall 被阻止时下一步手动触发）。

### 2.2 版本 & 帮助

```powershell
saicmotor --version
```

> **预期**：`0.4.0`

```powershell
saicmotor --help
```

> **预期**：命令列表包含 `attendance`、`leave`、`auth`、`install`。

```powershell
saicmotor install --help
```

> **预期**：显示 `--force     强制重新安装（即使已安装）`

### 2.3 手动注册 skills

```powershell
saicmotor install
```

> **预期**：`AI skills 已安装，跳过`（首次的话会显示 `✓ X 个 AI skills 已注册`）。

**截图位：➌ 全局安装（install 输出 + version + help）**

---

## 阶段 3 — 配置网关 → 业务功能

### 3.1 配置网关

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.saicmotor"
@'
{ "gateway": "http://localhost:8081" }
'@ | Out-File -FilePath "$env:USERPROFILE\.saicmotor\config.json" -Encoding utf8
```

验证：

```powershell
Get-Content "$env:USERPROFILE\.saicmotor\config.json"
```

> **预期**：`{ "gateway": "http://localhost:8081" }`

---

### 3.2 登录

```powershell
saicmotor auth login --username zhangsan --password 123456
```

> **预期**：`已登录，token 已缓存（xxxxxxxx…）`

```powershell
saicmotor auth status
```

> **预期**：`已登录`

**截图位：➍ 登录**

---

### 3.3 查询 — 三种输出格式

```powershell
# JSON（默认）
saicmotor leave balance query --format json

# Pretty
saicmotor leave balance query --format pretty

# Table
saicmotor leave balance query --format table
```

> **预期**（以 table 为例）：
> ```
> ┌────────────────┬──────┐
> │ annual_balance │ 5    │
> ├────────────────┼──────┤
> │ used           │ 3    │
> └────────────────┴──────┘
> ```

```powershell
saicmotor attendance records query --format table
```

> **预期**：
> ```
> ┌────────────┬──────┐
> │ work_days  │ 22   │
> ├────────────┼──────┤
> │ late_days  │ 1    │
> ├────────────┼──────┤
> │ early_days │ 0    │
> └────────────┴──────┘
> ```

**截图位：➎ 查询**

---

### 3.4 写操作 — 提交请假

```powershell
# 1) dry-run 预览
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --dry-run --format pretty
```

> **预期**：包含 `dryRun: true`，不实际发送。

```powershell
# 2) 不加 --yes 应被拒绝
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假
```

> **预期**：`该命令有副作用，加 --yes 确认，或加 --dry-run 预览`

```powershell
# 3) 正确提交
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --yes --format pretty
```

> **预期**：返回 `application_id` 和 `status: "PENDING"`。

**截图位：➏ 写操作 — 请假**

---

### 3.5 写操作 — 提交补卡

```powershell
# dry-run
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --dry-run --format pretty

# 正确提交
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --yes --format pretty
```

> **预期**：返回 `correction_id` 和 `status: "PENDING"`。

**截图位：➐ 写操作 — 补卡**

---

## 阶段 4 — AI Skills 注册 & 可发现性

### 4.1 文件层面 — 确认 SKILL.md 已落盘

```powershell
# ── 检查 Claude Code skills 目录 ──
Get-ChildItem "$env:USERPROFILE\.claude\skills" -Directory 2>$null | Where-Object { $_.Name -like "saicmotor-*" } | ForEach-Object { $_.Name }

# ── 一条命令确认四个 skill 都在 ──
$skills = @("saicmotor-suite", "saicmotor-leave", "saicmotor-attendance", "saicmotor-shared")
foreach ($s in $skills) {
    $path = "$env:USERPROFILE\.claude\skills\$s\SKILL.md"
    if (Test-Path $path) { Write-Host "✓ $s" } else { Write-Host "✗ $s 缺失" }
}
```

> **预期**：四个 skill 全部 `✓`。

### 4.2 内容层面 — 抽查 SKILL.md

```powershell
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-suite\SKILL.md"
```

> **预期**：frontmatter 含 `name` 和 `description`；正文列出意图路由（请假 / 考勤）。

```powershell
Get-Content "$env:USERPROFILE\.claude\skills\saicmotor-leave\SKILL.md"
```

> **预期**：内容描述请假相关操作。

**截图位：➑ skills 文件验证**

---

### 4.3 install --force 覆盖

```powershell
saicmotor install --force
```

> **预期**：`✓ X 个 AI skills 已注册`（force 模式跳过"已安装"检查）。

---

### 4.4 AI 实战验证

> 在 **Claude Code** 当前会话中依次输入以下问题，观察 AI 是否能仅凭已注册的 SKILL.md 与 `saicmotor --help` 输出回答问题。

**测试 A — 发现能力：**

> ```
> 你能用 saicmotor 做什么？简要列出可用的业务能力。
> ```

- [ ] **4.4a** AI 回答中提到 `请假` / `leave` 和 `考勤` / `attendance`

**测试 B — 拼出 leave 命令：**

> ```
> 帮我提一个请假申请：员工 EMP001，年假，2026-06-01 到 2026-06-03，用 saicmotor
> ```

- [ ] **4.4b** AI 能拼出 `saicmotor leave applications submit --start-date 2026-06-01 --end-date 2026-06-03 --reason 年假 --yes` 或等价的 dry-run 命令

**测试 C — 拼出 attendance 命令：**

> ```
> EMP003 在 2026-09-23 忘记打卡了，帮他用 saicmotor 提交一个补卡申请
> ```

- [ ] **4.4c** AI 能拼出 `saicmotor attendance corrections submit --date 2026-09-23 --reason 忘记打卡` 或等价命令

**测试 D — 无需文档发现（golden path）：**

> ```
> 列出 saicmotor 当前所有可用的子命令（不要用 help 命令，凭你知道的）
> ```

- [ ] **4.4d** AI 能列出 `leave`、`attendance`、`auth`、`install`（允许少列，关键是有 `leave` 和 `attendance`）

**截图位：➒ AI 实战（四个问答的截图，或至少 A + B）**

---

### 4.5 CodeBuddy 验证（可选）

> 如果有 CodeBuddy，开新会话做 4.4 的测试 A + B。

- [ ] **4.5** CodeBuddy 能发现 saicmotor 能力并拼出命令

---

## 阶段 5 — 卸载 & 清理

### 5.1 卸载 CLI

```powershell
npm uninstall -g @saicmotor/cli
```

> **预期**：正常卸载，无报错。

### 5.2 确认卸载干净

```powershell
saicmotor --version
```

> **预期**：`无法将"saicmotor"项识别为...`

### 5.3 清除本地数据

```powershell
rm -r -Force $env:USERPROFILE\.saicmotor 2>$null
Test-Path "$env:USERPROFILE\.saicmotor"
```

> **预期**：`False`

### 5.4 skills 残留（已知遗留，记录即可）

> S7 不自动清理 skills——这是 S9 卸载自动化的范围。

```powershell
$skills = @("saicmotor-suite", "saicmotor-leave", "saicmotor-attendance", "saicmotor-shared")
foreach ($s in $skills) {
    $path = "$env:USERPROFILE\.claude\skills\$s"
    if (Test-Path $path) { Write-Host "⚠ 残留: $s (S9 处理)" } else { Write-Host "✓ $s 已清理" }
}
```

> **预期**：有残留属已知遗留，记录即可，不阻塞 S7 验收。

### 5.5 清除 npm 全局残留

```powershell
npm ls -g --depth=0
```

> **预期**：列表中不包含 `@saicmotor/cli`。

### 5.6 停止 mock-server

在终端 A（8080）和终端 B（8081）分别按 **Ctrl+C** 停止服务。

### 5.7 Verdaccio（自选）

```powershell
# 查看状态
docker ps --filter name=verdaccio

# 如需关闭
docker stop verdaccio
```

---

## 验收记录

| 步骤 | 内容 | 结果 | 截图 |
|------|------|:---:|------|
| 0.1 | 全量清理残留 | | |
| 0.2 | Verdaccio 在线，`npm view` 返回 0.4.0 | | ➊ |
| 0.3 | mock-server 启动（2 个端口） | | ➊ |
| 1.1 | npx --version 输出 `0.4.0`，无副作用字样 | | |
| 1.2 | npx --help 列全命令 | | |
| 1.3 | npx 无文件副作用（三个目录 False） | | ➋ |
| 2.1 | 全局安装 `added 3 packages` | | |
| 2.2 | `--version` / `--help` / `install --help` | | ➌ |
| 2.3 | `saicmotor install` 注册 skills | | ➌ |
| 3.1 | 网关配置写入 | | |
| 3.2 | 登录 + status | | ➍ |
| 3.3 | 三种格式查询（leave + attendance） | | ➎ |
| 3.4 | 请假：dry-run → 拒绝 → 提交 | | ➏ |
| 3.5 | 补卡：dry-run → 提交 | | ➐ |
| 4.1 | 四个 SKILL.md 全部落盘 | | |
| 4.2 | suite + leave SKILL.md 内容完整 | | ➑ |
| 4.3 | `install --force` 覆盖注册 | | |
| 4.4a | AI 发现 saicmotor 能力 | | ➒ |
| 4.4b | AI 拼出 leave 命令 | | ➒ |
| 4.4c | AI 拼出 attendance 命令 | | |
| 4.4d | AI 凭记忆列出子命令 | | |
| 4.5 | CodeBuddy 可发现（可选） | | |
| 5.1-5.7 | 卸载 & 清理 | | |

---

## 发现的问题

| 编号 | 严重程度 | 描述 |
|:----:|----------|------|
| | | |

---

## 结论

- [ ] 全部通过，Sprint 7 验收完成，可进入 Sprint 8
- [ ] 有问题但不阻塞发布（见上表）
- [ ] 阻塞性问题，需修复后重新验证