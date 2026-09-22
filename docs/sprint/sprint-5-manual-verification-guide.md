# Sprint 5 — 手工端到端验证指导

> 面向**人类验证者**的完整操作清单——从 GitHub 安装开始，到 SSO 登录、业务调用、password 回退，模拟一个全新用户的完整体验。
>
> 预计耗时：15 分钟。

---

## 概览

本指南分五个阶段：

| 阶段 | 内容 | 时间 |
|:---:|------|:---:|
| 零 | 清理旧版本 | 1 分钟 |
| 一 | 从 GitHub tarball 安装 | 2 分钟 |
| 二 | 启动后端服务（gateway + mock-services） | 2 分钟 |
| 三 | exchange SSO 全链路验证（7 项） | 5 分钟 |
| 四 | password 回退 + 优先级验证（5 项） | 3 分钟 |
| 五 | 收尾清理 | 1 分钟 |

---

## 前置条件

| 条件 | 说明 |
|------|------|
| Java 17 | mock-gateway 和 mock-services 是 Spring Boot 项目 |
| Node.js ≥ 16 | CLI 运行环境，npm 可用 |
| Git | `git clone` 后端项目 |
| 飞书账号 | 已在 open.feishu.cn 创建企业自建应用，拿到 App ID / Secret |
| 飞书应用已发布 | 重定向 URL 登记 `http://localhost:3000/callback`，版本已发布，当前用户在可用范围 |
| 浏览器 | exchange SSO 需要弹出飞书授权页 |

如果还没申请飞书应用，先按 [飞书 OIDC 申请手册](../../howto/FEISHU-OIDC-SETUP.md) 操作（全程约 30 分钟）。

> **注意**：本指南安装的是 `sprint-5-sso` 分支（SSO 功能在此分支）。master 分支尚未合并 SSO，用 master 安装会缺少 exchange 能力。

---

## 阶段零：清理旧版本

如果你的机器上已经装过 saicmotor-cli，先全部卸干净。

```bash
# 1. 卸载全局 CLI
npm uninstall -g saicmotor-cli 2>/dev/null || true

# 2. 清除本地数据（token、凭证、配置）
rm -rf ~/.saicmotor

# 3. 确认 saicmotor 命令已不可用
saicmotor --version
# 预期：command not found
```

> Windows PowerShell 用户：`rm -rf ~/.saicmotor` 改为 `Remove-Item -Recurse -Force $env:USERPROFILE\.saicmotor`。

---

## 阶段一：从 GitHub tarball 安装

模拟一个全新用户从零开始的安装过程。

### 1.1 执行安装

```bash
npm install -g --dangerously-allow-all-scripts \
  https://github.com/a5535772/saicmotor-cli/tarball/sprint-5-sso
```

> **npm 新版用户注意**：npm ≥ 10 默认阻止安装脚本，`--dangerously-allow-all-scripts` 是必需的——名字吓人，但只影响本次安装这一个包。

安装过程中你会看到：

```
✓ AI skills 已注册
```

这说明 postinstall 脚本已自动把 `saicmotor-suite`、`saicmotor-leave`、`saicmotor-attendance`、`saicmotor-shared` 四个 skill 注册到本机的 AI 工具（Claude Code、CodeBuddy 等）。

### 1.2 安装验证

```bash
saicmotor --version      # 输出版本号
saicmotor --help         # 列出所有可用命令
```

预期 `--help` 输出包含 `auth login`、`leave`、`attendance` 等命令。

| 检查项 | 预期 | 实际 |
|--------|------|------|
| `saicmotor --version` 输出版本号 | `0.4.0` 或更高 | |
| `saicmotor --help` 列出命令 | 含 auth / leave / attendance | |
| AI skills 已注册 | `npx skills ls -g` 含 4 个 saicmotor-* | |

**安装通过？** ⬜

### 1.3 安装后的目录

确认以下目录存在：

```bash
# CLI 本体
ls "$(npm root -g)/saicmotor-cli/dist/src/cli/index.js"

# 用户数据目录（此时尚未登录，token 文件不存在）
ls ~/.saicmotor/
# 预期：config.json 不存在或为空目录
```

---

## 阶段二：启动后端服务

saicmotor-cli 需要网关 + 业务后端两个 Java 服务。从 GitHub clone 并启动。

### 2.1 clone 后端项目

```bash
# 在一个工作目录下（不要放在 saicmotor-cli 里面）
cd /d/work/things/saicmotor-cli-all   # 或你的工作目录
git clone https://github.com/a5535772/saicmotor-cli.git temp-backend
# 两个 Java 项目分别在 temp-backend/saicmotor-cli-mock-gateway 和
# temp-backend/saicmotor-cli-mock-services
```

### 2.2 确认测试用户

打开 `temp-backend/saicmotor-cli-mock-gateway/src/main/resources/application.yml`，确认 users 列表里有你的飞书 name：

```yaml
gateway:
  users:
    - { username: zhangsan, password: "123456", user-id: zhangsan, email: "zhangsan@saicmotor.com" }
    - { username: 章立,     password: "123456", user-id: zhangli, email: "zhangsan@saicmotor.com" }
    - { username: lisi,     password: "123456", user-id: lisi,     email: "lisi@saicmotor.com" }
```

> **关键**：你的飞书 name 必须出现在 `username` 列中。如果你的飞书 name 不在表里，加一条：
> ```yaml
>     - { username: 你的飞书name, password: "123456", user-id: 你的ASCII名, email: "你的邮箱" }
> ```

同样检查 `temp-backend/saicmotor-cli-mock-services/src/main/resources/application.yml`：

```yaml
leave:
  mock:
    users:
      - { username: zhangsan, emp-name: 张三, annual-balance: 5 }
      - { username: zhangli,  emp-name: 章立, annual-balance: 5 }
      - { username: lisi,     emp-name: 李四, annual-balance: 0 }
```

> 如果上面在 gateway 加了新用户，这里也要加对应的 `username`（用 gateway 里配的 `user-id`，ASCII）。

### 2.3 启动 mock-services（终端 1）

```bash
cd temp-backend/saicmotor-cli-mock-services
JAVA_HOME="C:/Program Files/Java/jdk-17" ./mvnw spring-boot:run
```

预期日志末尾：`Started MockServicesApplication in X seconds`

| 检查项 | 预期 | 实际 |
|--------|------|------|
| mock-services 启动成功（8080） | `Started MockServicesApplication` | |

**通过？** ⬜

### 2.4 启动 gateway（终端 2）

```bash
cd temp-backend/saicmotor-cli-mock-gateway
JAVA_HOME="C:/Program Files/Java/jdk-17" \
  FEISHU_APP_ID=cli_你的AppID \
  FEISHU_APP_SECRET=你的Secret \
  ./mvnw spring-boot:run
```

> 把 `cli_你的AppID` 和 `你的Secret` 替换为真实值。这两个值在任何时候都**不要**写进文件或贴到聊天里。

预期日志末尾：`Started GatewayApplication in X seconds`

验证网关健康：

```bash
curl http://localhost:8081/actuator/health
# 预期：{"status":"UP"}
```

| 检查项 | 预期 | 实际 |
|--------|------|------|
| gateway 启动成功（8081） | `Started GatewayApplication` | |
| `/actuator/health` 返回 UP | `{"status":"UP"}` | |

**通过？** ⬜

---

## 阶段三：exchange SSO 全链路验证

现在 CLI 已经通过 GitHub tarball 全局安装，后端两个服务都在运行。开始验证飞书 SSO 全链路。

> 以下每条**逐一执行**。每条命令在**终端 3**（CLI 终端）运行。

---

### ✅ 3.1 exchange SSO 登录

```bash
saicmotor auth login
```

| 预期 | 实际 |
|------|------|
| 终端打印 `正在打开浏览器进行飞书授权...` | |
| 浏览器自动打开飞书授权页 | |
| 在飞书页面点击授权（如已登录则一键授权） | |
| 浏览器显示"登录成功，可以关闭本页。" | |
| 终端打印 `已登录，token 已缓存` | |

**通过？** ⬜

> 如果浏览器没有自动打开，终端会打印授权 URL——手动复制到浏览器打开。

---

### ✅ 3.2 登录状态查询

```bash
saicmotor auth status
```

| 预期 | 实际 |
|------|------|
| 输出 `已登录` | |

**通过？** ⬜

---

### ✅ 3.3 SSO token 执行考勤查询

```bash
saicmotor attendance records query
```

| 预期 | 实际 |
|------|------|
| 返回 JSON，`data.work_days` 有值 | |

**通过？** ⬜

---

### ✅ 3.4 SSO token 执行请假余额查询

```bash
saicmotor leave balance query
```

| 预期 | 实际 |
|------|------|
| 返回 JSON，`data.annual_balance` 有值 | |

**通过？** ⬜

---

### ✅ 3.5 登出

```bash
saicmotor auth logout
```

| 预期 | 实际 |
|------|------|
| 输出 `已登出` | |

**通过？** ⬜

---

### ✅ 3.6 登出后状态确认

```bash
saicmotor auth status
```

| 预期 | 实际 |
|------|------|
| 输出 `未登录` | |

**通过？** ⬜

---

### ✅ 3.7 登出后业务请求被拒

```bash
saicmotor leave balance query
```

| 预期 | 实际 |
|------|------|
| 返回错误（401 或 auth required），不是正常数据 | |

**通过？** ⬜

---

## 阶段四：password 回退 + 优先级验证

验证 `password` 模式仍可用，以及配置优先级规则。

---

### ✅ 4.1 password 模式登录（环境变量）

```bash
SAICMOTOR_AUTH_TYPE=password saicmotor auth login --username zhangsan --password 123456
```

| 预期 | 实际 |
|------|------|
| 输出 `已登录，token 已缓存` | |

**通过？** ⬜

---

### ✅ 4.2 password 模式执行业务命令

```bash
SAICMOTOR_AUTH_TYPE=password saicmotor leave balance query
```

| 预期 | 实际 |
|------|------|
| 返回 `{"ok":true,"data":{"annual_balance":5,...}}` | |

**通过？** ⬜

---

### ✅ 4.3 用户 config.json 切 password

```bash
mkdir -p ~/.saicmotor
echo '{"auth":{"type":"password"}}' > ~/.saicmotor/config.json
saicmotor auth login --username zhangsan --password 123456
saicmotor auth status
```

| 预期 | 实际 |
|------|------|
| 登录成功 → `saicmotor auth status` 显示 `已登录` | |

> 注意：因为 config.json 里指定了 password，所以不需要 `SAICMOTOR_AUTH_TYPE` 环境变量。

**通过？** ⬜

清理 config.json 恢复默认：

```bash
rm ~/.saicmotor/config.json
```

---

### ✅ 4.4 环境变量最高优先级验证

```bash
# 第一步：写 config.json 设 password
mkdir -p ~/.saicmotor
echo '{"auth":{"type":"password"}}' > ~/.saicmotor/config.json

# 第二步：环境变量强制覆盖为 exchange
SAICMOTOR_AUTH_TYPE=exchange saicmotor auth login
```

| 预期 | 实际 |
|------|------|
| 浏览器打开飞书授权页（环境变量覆盖 config.json 的 password） | |

**通过？** ⬜

> 这验证了优先级规则：**环境变量 > config.json > 默认 exchange**。

清理：

```bash
rm ~/.saicmotor/config.json
saicmotor auth logout
```

---

### ✅ 4.5 不带任何配置时默认走 exchange

```bash
# 确认没有任何 password 配置
rm ~/.saicmotor/config.json 2>/dev/null || true
unset SAICMOTOR_AUTH_TYPE

saicmotor auth login
```

| 预期 | 实际 |
|------|------|
| 浏览器打开飞书授权页（默认 exchange） | |

**通过？** ⬜

---

## 阶段五：收尾清理

```bash
# 登出
saicmotor auth logout

# 清除本地数据
rm -rf ~/.saicmotor

# 卸载 CLI（如果不再需要）
npm uninstall -g saicmotor-cli

# 停止两个 Java 服务（在各自的终端按 Ctrl+C）

# 删除临时 clone 的后端项目
rm -rf /d/work/things/saicmotor-cli-all/temp-backend
```

> 如果你还要保留 CLI 继续使用，跳过卸载步骤。

---

## 验证记录

| # | 验证项 | 阶段 | 通过？ |
|---|--------|:---:|:---:|
| 1 | 从 GitHub tarball 安装成功 | 一 | ⬜ |
| 2 | `saicmotor --help` 可用 | 一 | ⬜ |
| 3 | AI skills 自动注册 | 一 | ⬜ |
| 4 | mock-services 启动 | 二 | ⬜ |
| 5 | gateway 启动 | 二 | ⬜ |
| 6 | exchange SSO 登录 | 三 | ⬜ |
| 7 | auth status（已登录） | 三 | ⬜ |
| 8 | 考勤查询（SSO token） | 三 | ⬜ |
| 9 | 请假余额查询（SSO token） | 三 | ⬜ |
| 10 | 登出 | 三 | ⬜ |
| 11 | 登出后状态确认 | 三 | ⬜ |
| 12 | 登出后业务请求被拒 | 三 | ⬜ |
| 13 | password 环境变量登录 | 四 | ⬜ |
| 14 | password 执行业务命令 | 四 | ⬜ |
| 15 | config.json 切 password | 四 | ⬜ |
| 16 | env > config.json 优先级 | 四 | ⬜ |
| 17 | 默认 exchange（无配置） | 四 | ⬜ |

| 日期 | 验证人 | 结果 | 耗时 | 备注 |
|------|--------|------|------|------|
|           |         | /17 |      |      |

---

## 常见故障排查

| 现象 | 排查点 |
|------|--------|
| `npm install -g` 报 network error | 检查网络能访问 GitHub；换镜像 `--registry=https://registry.npmmirror.com` |
| 安装后 `saicmotor` 提示 command not found | 关掉终端重新打开；检查 `npm bin -g` 在 PATH 里 |
| AI skills 没注册上 | 手动 `npx skills add a5535772/saicmotor-cli --all -g` |
| `saicmotor auth login` 直接报错不弹浏览器 | 检查 `~/.saicmotor/config.json`——删掉或确认 gateway 指向 `http://localhost:8081` |
| 浏览器打开飞书提示"应用不可用" | 飞书后台 → 应用版本管理 → 确认已发布 + 当前用户在可用范围 |
| 授权后页面显示错误而不是"登录成功" | 看 gateway 终端日志：`FEISHU_APP_ID` / `FEISHU_APP_SECRET` 是否正确 |
| exchange 报"未找到对应员工" | 你的飞书 name 不在 gateway 用户表 `username` 列——在 `application.yml` 加一条 |
| `X-User-Id` 头乱码（日志看到 ????） | gateway 用户表里 `user-id` 用了中文——改成 ASCII |
| password 模式登录失败 | 确认 username/password 在 gateway `application.yml` 的 users 列表里 |
| `SAICMOTOR_AUTH_TYPE` 不生效 | Windows CMD 用 `set SAICMOTOR_AUTH_TYPE=password`（无空格），PowerShell 用 `$env:SAICMOTOR_AUTH_TYPE="password"` |