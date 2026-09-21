# saicmotor-cli 安装指南

> 面向终端用户（人类 & AI Agent）——安装、卸载、更新。

---

## 这是什么？

`saicmotor` 是一个命令行工具，让你在终端里操作上汽内部业务系统（请假、考勤等）。装好之后，人和 AI Agent 都能用同一套命令。

装完你就能：

```bash
saicmotor auth login --username <工号> --password <密码>
saicmotor leave balance query          # 查年假余额
saicmotor attendance records query     # 查打卡记录
```

---

## 环境要求

- Node.js（`npm` 可用）——版本 ≥ 16
- 网络能访问 GitHub（安装过程中会自动下载 AI skills）

---

## 安装

以下两种方式**任选其一**：

### 方式一 — 从 GitHub 安装（推荐）

```bash
npm install -g github:a5535772/saicmotor-cli
```

一行搞定。装完后 `saicmotor` 命令全局可用，AI skills 也会自动注册到你电脑上已安装的 AI 工具里。

### 方式二 — 从源码安装

```bash
git clone https://github.com/a5535772/saicmotor-cli.git
cd saicmotor-cli
npm install
npm link            # 全局注册 saicmotor 命令
npm run build       # TypeScript → JavaScript

# 手动注册 AI skills（如未自动注册）
npx skills add a5535772/saicmotor-cli --all -g
```

> **给 AI Agent：** 如果你在帮用户安装，用方式一。方式二只有需要改源码的开发场景才用。

---

## 安装后——配置 & 登录

安装完成后，**配置网关地址**：

```bash
# 在 ~/.saicmotor/config.json 里写入网关地址
# 格式：{ "gateway": "http://你的网关地址" }

# 也可用环境变量（优先级最高）
set SAICMOTOR_GATEWAY=http://你的网关地址    # Windows PowerShell
export SAICMOTOR_GATEWAY=http://你的网关地址  # Mac / Linux
```

然后**登录**：

```bash
saicmotor auth login --username <你的工号> --password <你的密码>
```

验证是否成功：

```bash
saicmotor auth status     # 显示"已登录"
saicmotor --help          # 列出所有可用命令
```

### AI Agent 安装流程

> 以下步骤面向 AI Agent——你在帮用户安装时按这个顺序执行。

**第 1 步 — 安装**

```bash
npm install -g github:a5535772/saicmotor-cli
```

> 安装过程中会自动运行 `npx skills add a5535772/saicmotor-cli --all -g`，把 AI skills 注册到用户电脑上的 Claude Code、Trae 等 AI 工具。如果当前机器还没装 AI 工具，skills 注册会静默跳过（不影响 CLI 正常使用），用户可以之后手动运行 `saicmotor install` 重新注册。

**第 2 步 — 验证安装**

```bash
saicmotor --help
```

看到输出说明装好了。如果提示"找不到命令"，关掉终端重新打开再试。

**第 3 步 — 配置网关**

询问用户网关地址。写入 `~/.saicmotor/config.json`：

```json
{ "gateway": "http://用户提供的网关地址" }
```

或设环境变量 `SAICMOTOR_GATEWAY`。

**第 4 步 — 登录**

```bash
saicmotor auth login --username <工号> --password <密码>
```

**第 5 步 — 验证可用**

```bash
saicmotor auth status
saicmotor leave balance query --format table
```

---

## 卸载

### 卸载 CLI

```bash
npm uninstall -g saicmotor-cli
```

### 清除本地数据（可选）

```
删除目录：~/.saicmotor/
（包含登录 token、凭证、配置）
```

### 卸载 AI skills（可选）

```bash
npx skills rm saicmotor-suite -g
npx skills rm saicmotor-leave -g
npx skills rm saicmotor-attendance -g
npx skills rm saicmotor-shared -g
```

---

## 更新

### 更新到最新版

```bash
npm update -g saicmotor-cli
```

AI skills 通常在安装/更新后自动刷新。如果没刷新，手动跑：

```bash
saicmotor install --force
```

### 查看当前版本

```bash
saicmotor --version
```

---

## 常见问题

### Q: 装完了敲 `saicmotor` 提示"找不到命令"？

关掉终端窗口重新打开。如果还不行，检查 Node.js 的全局 bin 目录是否在 `PATH` 里：

```bash
npm bin -g     # 看全局 bin 在哪
```

### Q: AI skills 没注册上？

手动运行：

```bash
saicmotor install --force
```

等价于：

```bash
npx skills add a5535772/saicmotor-cli --all -g
```

### Q: 登录失败？

检查网关地址配对了没有：

```bash
type ~/.saicmotor/config.json     # Windows
cat ~/.saicmotor/config.json      # Mac / Linux
```

确认 `gateway` 字段是正确的地址。也检查下账号密码。

### Q: `npm install -g` 很慢或失败？

换个镜像源试试：

```bash
npm install -g github:a5535772/saicmotor-cli --registry=https://registry.npmmirror.com
```

### Q: 401 错误（未授权）？

token 过期了，重新登录：

```bash
saicmotor auth login --username <工号> --password <密码>
```

---

## 相关链接

- [架构设计](../docs/ARCHITECTURE.md)
- [GitHub 仓库](https://github.com/a5535772/saicmotor-cli)
- [Sprint 进度](../docs/sprint/总览.md)