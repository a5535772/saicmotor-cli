# Sprint 4 人工验证手册 — GitHub 安装 & AI 发现

> **验证目标**：确认 saicmotor-cli 可以通过 GitHub 安装、AI skills 自动注册、升级链路完整。
>
> **前置条件**：本地已安装 Node.js（≥16）、Java 17 + Maven（运行 mock-server 需要）。

---

## 验证概览

| 阶段 | 内容 | 预计耗时 |
|------|------|----------|
| 0 | 环境准备 — 启动 mock-server，清理本地残留 | 5 min |
| 1 | 人工安装 — `npm install -g github:...`，端到端使用 | 10 min |
| 2 | AI 安装 — 模拟 AI Agent 安装路径 | 5 min |
| 3 | 升级验证 — 改一行文案，`npm update` 生效 | 5 min |
| 4 | 环境清理 — 确认卸载后本地干净 | 3 min |

---

## 阶段 0 — 环境准备

### 0.1 清理本地残留

打开 **PowerShell**，先确保没有任何旧安装：

```powershell
# 卸载旧版本（如果装过）
npm uninstall -g saicmotor-cli

# 清除本地数据
rm -r -Force $env:USERPROFILE\.saicmotor 2>$null

# 确认 saicmotor 已不可用
saicmotor --version
```

> **预期**：最后一行显示 `saicmotor : 无法将"saicmotor"项识别为...`

---

### 0.2 启动 mock 后端

打开 **2 个终端**，分别启动网关和服务：

**终端 A — 业务服务（端口 8080）**

```powershell
cd D:\work\things\saicmotor-cli-all\saicmotor-cli-mock-services
mvn spring-boot:run
```

看到 `Started LeaveMockApplication` 说明启动成功。

**终端 B — 网关（端口 8081）**

```powershell
cd D:\work\things\saicmotor-cli-all\saicmotor-cli-mock-gateway
mvn spring-boot:run
```

看到 `Started GatewayApplication` 说明启动成功。

测试账号：

| 用户名 | 密码 |
|--------|------|
| zhangsan | 123456 |
| lisi | 123456 |

---

### 0.3 检查当前版本

打开 GitHub，看一眼现在的 `package.json` 版本号：https://github.com/a5535772/saicmotor-cli/blob/master/package.json

记录当前版本号：`0.1.0`

---

## 阶段 1 — 人工安装（GitHub 直装）

> 模拟"不懂技术的终端用户"的完整安装体验。

### 1.1 安装

```powershell
npm install -g github:a5535772/saicmotor-cli
```

> **预期**：正常结束，没有 error。输出中应该看到：
> - `prepare` 阶段静默通过（不再有 tsc 编译输出——dist/ 已在仓库中）
> - postinstall 输出类似：
>   ```
>   saicmotor CLI 安装完成。
>   ✓ AI skills 已注册
>     首次使用前请运行: saicmotor auth login
>     探索命令: saicmotor --help
>   ```

**截图位：➊ 安装输出**

---

### 1.2 验证 CLI 可用

```powershell
saicmotor --help
```

> **预期**：显示命令列表，包含 `leave`、`attendance`、`auth`、`install`。
>
> 描述行应显示：
> ```
> Usage: saicmotor [options] [command]
>
> 面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行
> ```

**截图位：➋ saicmotor --help 输出**

```powershell
saicmotor --version
```

> **预期**：显示当前版本号。

---

### 1.3 配置网关

```powershell
# 创建配置目录
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.saicmotor"

# 写入网关配置
@' 
{ "gateway": "http://localhost:8081" }
'@ | Out-File -FilePath "$env:USERPROFILE\.saicmotor\config.json" -Encoding utf8
```

验证配置写入成功：

```powershell
Get-Content "$env:USERPROFILE\.saicmotor\config.json"
```

> **预期**：`{ "gateway": "http://localhost:8081" }`

---

### 1.4 登录

```powershell
saicmotor auth login --username zhangsan --password 123456
```

> **预期**：`已登录，token 已缓存（xxxxxxxx…）`

```powershell
saicmotor auth status
```

> **预期**：`已登录`

**截图位：➌ 登录成功输出**

---

### 1.5 功能验证 — 查询

```powershell
# 查年假余额
saicmotor leave balance query --format table

# 查打卡记录
saicmotor attendance records query --format table
```

> **预期**：
>
> 年假余额输出类似：
> ```
> ┌────────────────┬──────┐
> │ annual_balance │ 5    │
> │ used           │ 3    │
> └────────────────┴──────┘
> ```
>
> 打卡记录输出类似：
> ```
> ┌───────────┬──────┐
> │ work_days │ 22   │
> │ late_days │ 1    │
> │ early_days│ 0    │
> └───────────┴──────┘
> ```

**截图位：➍ 查询结果**

---

### 1.6 功能验证 — 写操作（提交请假）

```powershell
# 预览模式（不实际发送）
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --dry-run
```

> **预期**：输出 `dryRun: true` 和请求详情，不实际发送。

```powershell
# 不加 --yes 应该被拒绝
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假
```

> **预期**：`该命令有副作用，加 --yes 确认，或加 --dry-run 预览`

```powershell
# 正确提交
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --yes --format pretty
```

> **预期**：返回 `application_id` 和 `status: "PENDING"`。

**截图位：➎ 写操作三个步骤的输出**

---

### 1.7 验证 output 格式

```powershell
saicmotor leave balance query --format json
saicmotor leave balance query --format pretty
saicmotor leave balance query --format table
```

> **预期**：
> - `json`（默认）：`{"ok":true,"data":{...}}`
> - `pretty`：美化 JSON
> - `table`：表格

**截图位：➏ 三种格式对比**

---

### 1.8 验证 AI skills 已注册

> 如果你本地装了 Claude Code 或其他 AI 工具，检查 skills 是否已注册：

```powershell
# 查看全局已注册的 skills
npx skills ls -g
```

> **预期**：列表中包含 `saicmotor-suite`、`saicmotor-leave`、`saicmotor-attendance`、`saicmotor-shared` 中的至少一个（取决于当前环境）。

如果没有装 AI 工具，这条会报错或返回空——这不影响验收，因为 `postinstall.js` 的降级逻辑已经处理了这种情况（静默跳过）。

**截图位：➐ skills ls -g 输出**

---

### 1.9 验证 `saicmotor install --force`

```powershell
saicmotor install --force
```

> **预期**：尝试重新注册 skills，输出 `✓ AI skills 已注册` 或降级警告。

```powershell
saicmotor install --help
```

> **预期**：显示 `--force  强制重新安装（即使已安装）`

**截图位：➑ saicmotor install 输出**

---

## 阶段 2 — AI 安装路径

> 模拟 "AI Agent 帮用户安装" 的流程。AI 不会用 `npm install -g`，而是指导用户操作。

### 2.1 先卸载

```powershell
npm uninstall -g saicmotor-cli
rm -r -Force $env:USERPROFILE\.saicmotor 2>$null
```

确认干净：

```powershell
saicmotor --version
# 预期：无法识别 saicmotor
```

### 2.2 AI 路径安装

```powershell
# 用户跑 AI 给的这条命令
npm install -g github:a5535772/saicmotor-cli
```

安装成功后，AI Agent 会依次执行：

```powershell
# Step 1 — AI 验证 CLI 可用
saicmotor --help

# Step 2 — AI 配置网关
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.saicmotor"
@' 
{ "gateway": "http://localhost:8081" }
'@ | Out-File -FilePath "$env:USERPROFILE\.saicmotor\config.json" -Encoding utf8

# Step 3 — AI 引导用户登录
saicmotor auth login --username zhangsan --password 123456

# Step 4 — AI 验证功能
saicmotor auth status
saicmotor leave balance query --format table
```

> **预期**：每一步都成功，和阶段 1 结果一致。

**截图位：➒ AI 路径安装验证结果**

---

## 阶段 3 — 升级验证（POC）

> 通过改一行文案来模拟真实升级场景。改动：把 `--help` 描述里的一个句号改成感叹号，制造肉眼可辨的差异。

### 3.1 制造一个"新版"

在 `saicmotor-cli` 项目目录里：

```powershell
cd D:\work\things\saicmotor-cli-all\saicmotor-cli
```

打开 `src/cli/index.ts`，第 11 行找到了吗？它在描述结尾有个句号：

```typescript
program.name("saicmotor")
  .description("面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行")
  .version("0.3.0");
```

**把这个描述末尾的 `引擎执行` 改成 `引擎执行！`（把 `"` 前面的内容加个感叹号英文的`!`）：**

```typescript
  .description("面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行!")
```

改完后提交：

```powershell
git add src/cli/index.ts
git commit -m "test(upgrade): change description punctuation for upgrade POC"
git push
```

### 3.2 执行升级

```powershell
npm update -g saicmotor-cli
```

> 如果 `npm update` 不生效（因为 GitHub 地址不被 npm 视为可更新），用覆盖安装：
>
> ```powershell
> npm install -g github:a5535772/saicmotor-cli
> ```

### 3.3 验证升级

```powershell
saicmotor --help
```

> **预期**：描述末尾变成了 `引擎执行！`（感叹号代替句号）。
>
> ```
> Usage: saicmotor [options] [command]
>
> 面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行！
> ```

**截图位：➓ 升级前后 --help 对比**

### 3.4 复原改动

验证完毕后把代码改回去：

```powershell
cd D:\work\things\saicmotor-cli-all\saicmotor-cli
```

把 `!` 改回正常说明，提交：

```powershell
git add src/cli/index.ts
git commit -m "revert: restore description"
git push
```

---

## 阶段 4 — 环境清理

### 4.1 卸载 CLI

```powershell
npm uninstall -g saicmotor-cli
```

确认已卸载：

```powershell
saicmotor --version
# 预期：无法识别
```

### 4.2 清除本地数据

```powershell
rm -r -Force $env:USERPROFILE\.saicmotor
```

### 4.3 清除 npm 全局残留检查

```powershell
# 确认全局 node_modules 里没有残留
npm ls -g --depth=0
# 预期：找不到 saicmotor-cli
```

### 4.4 停止 mock-server

在终端 A 和终端 B 分别按 `Ctrl+C` 停止 `mock-services` 和 `mock-gateway`。

### 4.5 最终确认

```powershell
# 1. CLI 已卸载
saicmotor --version         # 预期：找不到命令

# 2. 本地数据已清除
Test-Path "$env:USERPROFILE\.saicmotor"   # 预期：False

# 3. npm 全局列表干净
npm ls -g --depth=0         # 预期：不包含 saicmotor-cli
```

---

## 验收记录

| 步骤 | 内容 | 结果（✅/❌） | 截图 |
|------|------|:---:|------|
| 0.1 | 清理本地残留 | | |
| 0.2 | mock-server 启动 | | |
| 1.1 | `npm install -g` 成功 | | ➊ |
| 1.2 | `saicmotor --help` 输出正确 | | ➋ |
| 1.3 | 网关配置写入 | | |
| 1.4 | 登录成功 | | ➌ |
| 1.5 | 查询命令正常 | | ➍ |
| 1.6 | 写操作确认 + 提交 | | ➎ |
| 1.7 | 三种输出格式 | | ➏ |
| 1.8 | skills 已注册 | | ➐ |
| 1.9 | `saicmotor install --force` | | ➑ |
| 2.2 | AI 安装路径 | | ➒ |
| 3.3 | 升级后文案变化 | | ➓ |
| 4.1-4.5 | 环境清理干净 | | |

---

## 发现的问题

| 编号 | 严重程度 | 描述 | 截图 |
|:----:|----------|------|------|
| | | | |

---

## 结论

- [ ] 全部通过，可以发布
- [ ] 有问题但不阻塞发布（见上表）
- [ ] 阻塞性问题，需要修复后重新验证