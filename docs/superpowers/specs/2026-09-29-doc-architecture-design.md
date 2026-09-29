# 文档体系重构设计

> 状态：已评审通过
> 关联：todo #12「文档体系重构」
> 现有参考：`docs/history/DEVELOPER.md`（插件开发手册）、`docs/history/ARCHITECTURE.2.0.md`（架构白皮书）、`docs/history/howto/INSTALL.md`（安装指南）

## 背景

当前文档散落三处（`docs/history/`、`docs/sprint/`、`howto/`），除刚完成的 `MANUAL-TESTING.md` 外几乎全是历史快照。不同读者找不到自己要的信息，也不知道"我是谁该读哪篇"。

## 目标

按 **5 类用户** 重新组织文档体系，每类一份文档/文件夹，读者按身份直接定位。

## 输出总览

| # | 用户 | 文档 | 篇幅 | 说明 |
|---|------|------|------|------|
| 1 | **使用者** | `howto/USER-GUIDE.md` | 短（一页纸） | 安装→登录→常用命令→排错 |
| 2 | **业务开发者** | `howto/PLUGIN-DEVELOPER.md` | 中（约 400 行） | 插件开发全流程 |
| 3 | **测试人员** | `howto/MANUAL-TESTING.md` | 长（742 行） | ✅ 已就绪，不在本次重构范围 |
| 4 | **框架开发人员** | `docs/framework/` 文件夹（6 章） | 长（每章约 100-200 行） | 核心技术机制分章深入 |
| 5 | **AI Agent** | `howto/FOR-AI-INSTALL.md` | 极短（约 50 行） | AI 一行 WebFetch 即可安装 |

---

## 1. 使用者：`howto/USER-GUIDE.md`

**定位**：装了就用的普通用户，不想知道内部原理。

**内容纲要**：

```
# saicmotor CLI 使用指南

## 环境要求
- Node.js ≥ 20

## 安装
- 一条命令（带 --registry flag）
- 注册 skills：saicmotor install
- 验证：saicmotor --version / saicmotor --help

## 登录
- exchange 模式（弹浏览器飞书授权）
- auth status 验证

## 常用命令
- 查年假余额
- 查考勤记录
- 提交请假（--yes / --dry-run）
- 补卡
- 三种输出格式（json / table / pretty）

## 写操作安全
- --dry-run 预览
- --yes 确认（不带 --yes 被拒绝）

## 卸载
- saicmotor uninstall（一键清干净）

## 常见错误速查
- 未登录 → saicmotor auth login
- 找不到命令 → 重启终端 / 检查 PATH
- 401 → token 过期，重新登录
- 安装慢 → 检查 --registry
```

---

## 2. 业务开发者：`howto/PLUGIN-DEVELOPER.md`

**定位**：写请假/考勤/报销插件的开发者，不 clone 核心仓库、不碰 `src/`。

**复用基础**：`docs/history/DEVELOPER.md` 已有 10 节完整内容，需基于 **当前系统实际情况**（v0.8.0、exchange 默认、`--registry` flag、`files` 字段经验、`routes` 字段等）更新。

**内容纲要**：

```
# saicmotor 插件开发手册

## 前置条件
- Node.js ≥ 20、已装 CLI、内部 registry

## 脚手架
- saicmotor create plugin <name> → 生成骨架
- 文件结构说明（每个文件做什么）

## manifest 字段参考（saicmotor.plugin.json）
- name / engine / catalog / skills / scripts / routes
- engine semver 含义

## 声明式开发（catalog JSON）
- service / resource / method 三层结构
- httpMethod / path / requestBody 字段
- 命令如何从 catalog 自动生成

## SKILL.md 编写规范
- frontmatter（name / description — 意图命中关键）
- 正文结构（命令列表 + 示例）
- description 怎么写 AI 才能稳定匹配

## 脚本覆盖（scripts/）
- 目录树对应 catalog 结构
- 何时写脚本、何时靠声明式就够
- 导出函数签名

## 本地联调（dev）
- saicmotor dev → link 到 linked/
- plugin list 可见
- dev --stop 解除

## 校验（validate）
- manifest zod 校验
- 常见错误

## 发布
- npm publish --registry=...
- 版本管理
```

---

## 3. 测试人员：`howto/MANUAL-TESTING.md`

✅ **已完成，不纳入本次重构。**

---

## 4. 框架开发人员：`docs/framework/` 文件夹

**定位**：接手维护 CLI 核心的开发者，需要理解全部核心技术机制。拆 6 章，每章独立可读。

**复用基础**：`docs/history/ARCHITECTURE.2.0.md`（80KB 白皮书）内容详尽但为单体文件，需拆分重组。

### 4.1 `01-architecture.md` — 架构总览

```
- 一句话架构（三层：编排/声明/执行 + 插件层）
- monorepo 包拓扑（sdk → cli → plugins）
- 仓库目录结构
- 技术栈选型理由
- 数据流序列图（用户 → CLI → 网关 → 业务系统）
```

### 4.2 `02-plugin-system.md` — 插件系统

```
- 插件加载器：双根扫描（linked/ → installed/）
- engine 版本校验（semver）
- 插件生命周期：install / uninstall / enable / disable / upgrade
- 状态持久化（state.json）
- enable/disable 对 skills 与 suite 的连锁影响
- 插件安装路径与 node_modules 结构
```

### 4.3 `03-skills-registration.md` — Skills 注册与 Suite 路由

```
- AI_CLIENT_SKILL_DIRS（.claude / .codebuddy / .agents）
- junction（Windows）/ symlink（Unix）+ 降级 copy
- registerSkill / unregisterSkill / registerPluginSkills / unregisterPluginSkills / unregisterAllSkills
- suite 路由生成：buildSuiteRoutes → generateSuiteSkill → writeSuiteRoutes
- 路由表格式（意图 → skill 映射）
- 与 scripts/uninstall.js 的同步要求
```

### 4.4 `04-auth.md` — 认证体系

```
- exchange 模式（飞书 OAuth）：
  - 启动 loopback 服务器 → 获取 auth URL → 弹浏览器 → 回调 → 交换 token
- token 缓存（~/.saicmotor/token.json）
- ensureToken() 自动续登 + 401 自动重试
- 凭证存储（credentials.json, mode 0600）
- 环境变量覆盖（SAICMOTOR_AUTH_TYPE / SAICMOTOR_USERNAME / SAICMOTOR_PASSWORD）
- auth transport（Bearer header 注入）
```

### 4.5 `05-engine.md` — 执行引擎

```
- catalog 加载与 zod 校验
- Commander 动态命令注册（从 catalog JSON 到 CLI 命令树）
- 命令结构：<service> <resource> <method> [--params] [--format] [--dry-run] [--yes]
- 执行管道：coerceFields → ensureToken → buildUrl → send → 401 重试 → checkEnvelope → 输出
- 脚本覆盖机制（scripts/ 优先于 HTTP 回放）
- 输出格式（json envelope / table / pretty）
```

### 4.6 `06-build-publish.md` — 构建与发布

```
- monorepo 构建流程（tsc，sdk 必须先于 cli）
- npm workspaces 配置
- files 字段策略（显式列出文件，不依赖目录通配）
- prepublishOnly / preuninstall / postinstall lifecycle hooks
- Verdaccio 本地测试发布
- --registry flag vs .npmrc scoped config
- npx 检测（npm_command === "exec"）
```

---

## 5. AI Agent：`howto/FOR-AI-INSTALL.md`

**定位**：AI Agent 通过 `WebFetch` 抓取此页面，按指引完成安装。对标飞书 CLI 风格——无导航、无目录、无废话。格式需确保 WebFetch 渲染后清晰可执行。

**内容纲要**：

```
# saicmotor CLI 安装指引（面向 AI）

## 安装（一条命令）
npm install -g @saicmotor/cli --registry=<内部 registry>

## 代理环境（如果需要）
（Windows/Mac/Linux 设环境变量的命令）

## 注册 AI skills
saicmotor install

## 验证安装成功
saicmotor --version
# 检查 skills 落盘

## 如果安装失败
- 检查 registry 可达性
- 检查 Node.js 版本 ≥ 20
- npm v11 需手动 saicmotor install

## 安装完成后的下一步
- 配置网关地址
- 登录：saicmotor auth login
- 用户说"帮我查年假" → 读 saicmotor-suite skill → 路由 → 执行业务
```

**关键约束**：
- 全文不超过 55 行（原定 40 行经实测不可行——纲要 6 个内容块 + 独立标注语言的代码块下限约 45 行，2026-09-29 修正）
- 无目录、无导航链接
- 不引用其他文档的路径
- 每条命令独立成段，WebFetch 提取后可直接执行；不同 shell 语法不得混入同一代码块

---

## 格式约定（全局）

- 纯 Markdown
- 代码块标注语言（bash / powershell / json）
- 预期输出用 `> **预期**：` 或 `# 输出：` 风格
- 不挂外部 md link（内部文档互引用除外）

## 前置条件

- 现有代码库 0.8.0（所有机制已稳定）
- `docs/history/DEVELOPER.md` 和 `docs/history/ARCHITECTURE.2.0.md` 为可复用的原材料
- `howto/MANUAL-TESTING.md` 已完成，不重复碰