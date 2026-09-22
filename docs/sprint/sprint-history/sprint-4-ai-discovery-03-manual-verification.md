# Sprint 4 人工验证手册 — 安装 & AI 发现 & 功能

> **验证目标**：确认 saicmotor-cli v0.4.0 可通过 GitHub tarball 一键安装，AI skills 自动注册，请假/考勤全链路走通。
>
> **前置条件**：Node.js ≥ 16、Java 17 + Maven（运行 mock-server 需要）。
>
> **预计耗时**：15 分钟。

---

## 验证概览

| 阶段 | 内容 | 预计耗时 |
|------|------|----------|
| 0 | 环境准备 — 清理残留、启动 mock-server | 3 min |
| 1 | 安装 & CLI 验证 | 3 min |
| 2 | 配置网关 → 登录 → 查询 → 写操作 | 5 min |
| 3 | AI skills 注册 & 升级模拟 | 2 min |
| 4 | 卸载 & 清理 | 2 min |

---

## 阶段 0 — 环境准备

### 0.1 清理本地残留

打开 **PowerShell**：

```powershell
# 卸载旧版本（如果装过）
npm uninstall -g saicmotor-cli

# 清除本地数据
rm -r -Force $env:USERPROFILE\.saicmotor 2>$null

# 确认已不可用
saicmotor --version
```

> **预期**：最后一行显示 `saicmotor : 无法将"saicmotor"项识别为...`

---

### 0.2 启动 mock 后端

需要开 **2 个终端**，分别启动业务服务和网关。

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

---

## 阶段 1 — 安装 & CLI 验证

### 1.1 安装

打开第三个 **PowerShell** 终端，执行：

```powershell
npm install -g --dangerously-allow-all-scripts https://github.com/a5535772/saicmotor-cli/tarball/master


--leo 备注

--代理模式
npm install -g --dangerously-allow-all-scripts --proxy http://127.0.0.1:7897 --https-proxy http://127.0.0.1:7897 https://github.com/a5535772/saicmotor-cli/tarball/master

--用完删掉：
npm config delete proxy --location=user
npm config delete https-proxy --location=user

--● 可以验证。先把 skills 删干净，再装一次看看是不是真的能自动注册回来：

  # 删掉 saicmotor skills
  npx skills rm saicmotor-suite -g
  npx skills rm saicmotor-leave -g
  npx skills rm saicmotor-attendance -g
  npx skills rm saicmotor-shared -g

  # 确认技能是否安装了
  npx skills ls -g

  # 重新注册
  saicmotor install --force

  如果 install --force 之后 skills 回来了，说明安装链路是通的，跟之前装不装过没关系。
```

> **预期**：正常结束，无 error。输出中应看到：
> ```
> saicmotor CLI 安装完成。
> ✓ AI skills 已注册             ← 或 "AI skills 已安装，跳过"
>   首次使用前请运行: saicmotor auth login
>   探索命令: saicmotor --help
> ```

`--dangerously-allow-all-scripts` 名字吓人但只影响本次安装这一个包，确保 postinstall 能跑起来注册 skills。

**截图位：➊ 安装输出**

---

### 1.2 隔离包验证（registry 形态，必做）

> GitHub tarball 是整仓库快照，会掩盖"registry tarball 缺 src/"类缺陷。必须用 `npm pack` 产物验证一次。

```powershell
cd D:\work\things\saicmotor-cli-all\saicmotor-cli

# 1) 用 registry 形态包替换全局安装
npm pack
npm uninstall -g saicmotor-cli
npm install -g --dangerously-allow-all-scripts (Resolve-Path .\saicmotor-cli-0.4.0.tgz).Path

# 2) 脱离源码树执行（在用户主目录，不要在项目目录！）
cd $env:USERPROFILE
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --dry-run --format pretty
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --dry-run --format pretty

# 3) 已安装时应跳过，不重复注册
saicmotor install
```

> **预期**：
> - 两个 submit 均输出 `dryRun: true`，且有 `[script] ...前校验通过` 日志（说明加载的是编译脚本而非 .ts 源码）。
> - 最后一条输出 `AI skills 已安装，跳过`。

**截图位：➊-b 隔离包验证**

---

### 1.3 CLI 基础验证

```powershell
saicmotor --help
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

```powershell
saicmotor --version
```

> **预期**：`0.4.0`

```powershell
saicmotor install --help
```

> **预期**：显示 `--force     强制重新安装（即使已安装）`

**截图位：➋ CLI 基础验证**

---

## 阶段 2 — 配置网关 → 业务功能

### 2.1 配置网关

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

### 2.2 登录

```powershell
saicmotor auth login --username zhangsan --password 123456
```

> **预期**：`已登录，token 已缓存（xxxxxxxx…）`

```powershell
saicmotor auth status
```

> **预期**：`已登录`

**截图位：➌ 登录**

---

### 2.3 查询 — 三种输出格式

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

**截图位：➍ 查询**

---

### 2.4 写操作 — 提交请假

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

**截图位：➎ 写操作**

---

### 2.5 写操作 — 提交补卡

```powershell
# dry-run
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --dry-run --format pretty

# 正确提交
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --yes --format pretty
```

> **预期**：返回 `correction_id` 和 `status: "PENDING"`。

**截图位：➏ 补卡**

---

## 阶段 3 — AI Skills & 升级

### 3.1 skills 注册状态

```powershell
saicmotor install --force
```

> **预期**：`✓ AI skills 已注册`

检查 skills 列表：

```powershell
npx skills ls -g
```

> **预期**：列表中包含 `saicmotor-suite`、`saicmotor-leave`、`saicmotor-attendance`、`saicmotor-shared`。
>
> 如果没有装 AI 工具，这条可能报错或返回空——不影响验收。

**截图位：➐ skills 注册**

---

### 3.2 升级模拟（POC）

> 通过 `--version` 来确认升级链路——记录当前版本号，下次发新版重复 1.1 步骤即可覆盖安装。

```powershell
# 当前版本
saicmotor --version
```

**如果实际升级测试**（发布了新版后）：

```powershell
npm install -g --dangerously-allow-all-scripts https://github.com/a5535772/saicmotor-cli/tarball/master
saicmotor --version
```

> **预期**：版本号变化。

**截图位：➑ 版本号**

---

## 阶段 4 — 卸载 & 清理

### 4.1 卸载 CLI

```powershell
npm uninstall -g saicmotor-cli
```

### 4.2 确认卸载干净

```powershell
saicmotor --version
```

> **预期**：`无法将"saicmotor"项识别为...`

### 4.3 清除本地数据

```powershell
rm -r -Force $env:USERPROFILE\.saicmotor 2>$null
Test-Path "$env:USERPROFILE\.saicmotor"
```

> **预期**：`False`

### 4.4 清除 npm 全局残留

```powershell
npm ls -g --depth=0
```

> **预期**：列表中不包含 `saicmotor-cli`。

### 4.5 清除 AI skills（可选）

```powershell
npx skills rm saicmotor-suite -g
npx skills rm saicmotor-leave -g
npx skills rm saicmotor-attendance -g
npx skills rm saicmotor-shared -g
```

### 4.6 停止 mock-server

在终端 A（8080）和终端 B（8081）分别按 **Ctrl+C** 停止服务。

---

## 验收记录

| 步骤 | 内容 | 结果 | 截图 |
|------|------|:---:|------|
| 0.1 | 清理本地残留 | | |
| 0.2 | mock-server 启动（2 个端口） | | |
| 1.1 | 安装成功 + postinstall 输出 | | ➊ |
| 1.2 | npm pack 隔离安装 + 两个 submit dry-run + install 跳过 | | ➊-b |
| 1.3 | --help / --version / install --help | | ➋ |
| 2.1 | 网关配置写入 | | |
| 2.2 | 登录 + status | | ➌ |
| 2.3 | 三种格式查询（leave + attendance） | | ➍ |
| 2.4 | 请假：dry-run → 拒绝 → 提交 | | ➎ |
| 2.5 | 补卡：dry-run → 提交 | | ➏ |
| 3.1 | install --force + skills ls -g | | ➐ |
| 3.2 | 版本号确认 | | ➑ |
| 4.1-4.6 | 卸载 & 清理干净 | | |

---

## 发现的问题

| 编号 | 严重程度 | 描述 |
|:----:|----------|------|
| | | |

---

## 结论

- [ ] 全部通过，可以发布 v0.4.0
- [ ] 有问题但不阻塞发布（见上表）
- [ ] 阻塞性问题，需修复后重新验证