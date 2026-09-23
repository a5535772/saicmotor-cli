# @saicmotor/cli 安装指南

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

> **登录方式**：生产环境默认走飞书 SSO（敲 `saicmotor auth login` 自动打开浏览器授权）。本地开发可用 `SAICMOTOR_AUTH_TYPE=password` 切回账号密码，详见[开发者指南](DEVELOPER.md#切回-password-模式本地开发)。

---

## 环境要求

- Node.js（`npm` 可用）——版本 ≥ 16
- 网络能访问内部 npm registry（安装过程中会自动下载 AI skills）

---

## Registry 说明

> **推荐使用 `--registry` flag 指定内部 registry**，而非全局配置 `.npmrc`。`--registry` 是显式的、一次性的，不会影响本机其他 npm 包的安装行为。

---

## 安装

以下两种方式**任选其一**：

### 方式一 — 从内部 Registry 安装（推荐）

```bash
npm install -g @saicmotor/cli --registry=http://localhost:4873
```

一行搞定。装完后 `saicmotor` 命令全局可用，AI skills 也会自动注册到你电脑上已安装的 AI 工具里。

> **npm 新版用户注意**：npm ≥ 11 的 `allow-scripts` 白名单对 `-g` 全局安装无效，postinstall 可能被阻止。如果 skills 未自动注册，手动执行 `saicmotor install` 即可。

### 方式二 — 从源码安装

```bash
git clone https://github.com/a5535772/saicmotor-cli.git
cd saicmotor-cli
npm install
npm link            # 全局注册 saicmotor 命令
npm run build       # TypeScript → JavaScript

# 手动注册 AI skills（如未自动注册）
npx skills add @saicmotor/cli --all -g
```

> **给 AI Agent：** 如果你在帮用户安装，用方式一。方式二只有需要改源码的开发场景才用。

---

## 安装后——配置 & 登录

安装完成后，通常不需要额外配置即可登录。

### 生产环境（飞书 SSO，默认）

直接敲命令，会自动打开浏览器跳转飞书授权：

```bash
saicmotor auth login
```

浏览器授权完成后 token 自动缓存，后续命令无需再次登录。

### 本地开发 / 无浏览器环境

通过环境变量切回账号密码模式：

```bash
# Windows PowerShell
$env:SAICMOTOR_AUTH_TYPE="password"
saicmotor auth login --username <工号> --password <密码>

# Mac / Linux / Git Bash
SAICMOTOR_AUTH_TYPE=password saicmotor auth login --username <工号> --password <密码>
```

### 配置网关地址（可选）

如果网关不在默认的 `localhost:8081`，写入配置文件：

```bash
# 在 ~/.saicmotor/config.json 里写入网关地址
# 格式：{ "gateway": "http://你的网关地址" }

# 也可用环境变量（优先级最高）
set SAICMOTOR_GATEWAY=http://你的网关地址    # Windows PowerShell
export SAICMOTOR_GATEWAY=http://你的网关地址  # Mac / Linux
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
npm install -g @saicmotor/cli --registry=http://localhost:4873
```

> 安装过程中会自动运行 `npx skills add @saicmotor/cli --all -g`，把 AI skills 注册到用户电脑上的 Claude Code、Trae 等 AI 工具。如果当前机器还没装 AI 工具，skills 注册会静默跳过（不影响 CLI 正常使用）。npm v11 的 allow-scripts 白名单对 `-g` 无效，若 postinstall 被阻止，手动执行 `saicmotor install`。

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
saicmotor auth login
```

> 生产环境默认走飞书 SSO，浏览器自动打开授权。本地开发用 `SAICMOTOR_AUTH_TYPE=password saicmotor auth login --username <工号> --password <密码>`。

**第 5 步 — 验证可用**

```bash
saicmotor auth status
saicmotor leave balance query --format table
```

---

## 卸载

> `npm uninstall` **只删 CLI 本身**，不会清除本地数据和 AI skills。要完全卸载干净，按下面三步执行。

### 1. 卸载 CLI

```bash
saicmotor uninstall   # 清理 skills 与本地数据（S9）
npm uninstall -g @saicmotor/cli
```

### 2. 清除本地数据

```bash
# 删除目录（包含登录 token、凭证、配置）
rm -rf ~/.saicmotor
# Windows PowerShell:  Remove-Item -Recurse -Force $env:USERPROFILE\.saicmotor
```

### 3. 清除 AI skills

skills 注册分两层：中央仓 `~/.agents/skills/saicmotor-*`（实体）+ 各 AI 客户端目录里的符号链接（如 `~/.claude/skills/`、`~/.codebuddy/skills/`）。

```bash
npx -y skills rm saicmotor-suite -g
npx -y skills rm saicmotor-leave -g
npx -y skills rm saicmotor-attendance -g
npx -y skills rm saicmotor-shared -g
```

若客户端目录里留下指向中央仓的死链接，手动删除：

```bash
rm -f ~/.claude/skills/saicmotor-*
rm -f ~/.codebuddy/skills/saicmotor-*
```

### 验证已卸载干净

```bash
saicmotor --version                          # 应 command not found
npx -y skills ls -g                          # 应无 saicmotor 条目
ls ~/.agents/skills | grep -i saicmotor      # 应无输出
ls ~/.claude/skills | grep -i saicmotor      # 应无输出
ls ~/.codebuddy/skills | grep -i saicmotor   # 应无输出
```

---

## 更新

### 更新到最新版

```bash
npm update -g @saicmotor/cli
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

## 配置

安装地址和 skills 仓库信息集中在 `saicmotor.config.json` 中管理。公司内部部署时只需修改这一个文件：

```json
{
  "repo": "@saicmotor/cli",
  "installUrl": "npm install -g @saicmotor/cli --registry=http://localhost:4873",
  "repository": "内部仓库地址"
}
```

用户侧无需任何改动，安装命令自动读取配置文件。

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

### Q: 登录失败？

检查网关地址配对了没有：

```bash
type ~/.saicmotor/config.json     # Windows
cat ~/.saicmotor/config.json      # Mac / Linux
```

确认 `gateway` 字段是正确的地址。也检查下账号密码。

### Q: `npm install -g` 很慢或失败？

确认使用了正确的 registry：

```bash
npm install -g @saicmotor/cli --registry=http://localhost:4873
```

### Q: 401 错误（未授权）？

token 过期了，重新登录：

```bash
saicmotor auth login --username <工号> --password <密码>
```

---

## 相关链接

- [架构设计](../docs/ARCHITECTURE.md)
- [安装分发机制](../docs/ARCHITECTURE.md#11-安装与分发)
- [配置化说明](../docs/ARCHITECTURE.md#12-配置化)
- [GitHub 仓库](https://github.com/a5535772/saicmotor-cli)
- [Sprint 进度](../docs/sprint/总览.md)