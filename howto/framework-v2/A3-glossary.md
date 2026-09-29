# A3 — 术语表

> 统一术语定义。以下术语在 V2 文档全体系中使用，避免同一个概念多个说法。

---

## 系统角色

| 术语 | 英文 | 定义 |
|------|------|------|
| **AI Agent** | AI Agent | 大语言模型驱动的编程助手（Claude Code / Cursor / CodeBuddy）。通过读取 SKILL.md 发现和调用 saicmotor 的能力。 |
| **CLI 引擎** | CLI Engine | `@saicmotor/cli` 的核心执行器——负责命令注册、参数校验、HTTP 管线、认证、输出格式化。 |
| **网关** | Gateway | 企业 API 网关，CLI 引擎通过它访问后台业务系统。 |
| **业务系统** | Business System | 实际提供服务数据的后台系统（如请假系统、考勤系统）。 |

## 核心概念

| 术语 | 英文 | 定义 |
|------|------|------|
| **Skill** | Skill | 一个 SKILL.md 文件，描述一项能力及其调用方式。AI Agent 读取它来决定"能不能做、怎么做"。 |
| **Catalog** | Catalog | 声明式 JSON 文件（`catalog/services/*.json`），描述 API 接口结构（URL、方法、参数）。引擎读取它来动态注册命令。 |
| **Suite** | Suite | `saicmotor-suite` 的简称——AI Agent 的统一入口 skill，包含意图路由表（"请假 → saicmotor-leave"）。 |
| **路由表** | Route Table | Suite SKILL.md 中的意图→Skill 映射表，由 `buildSuiteRoutes()` 全量重建。 |
| **Manifest** | Manifest | `saicmotor.plugin.json`，插件的身份和功能声明文件——告诉引擎"我是谁、我能做什么"。 |
| **脚本覆盖** | Script Override | 用自定义 TypeScript/JavaScript 脚本替代引擎默认的 HTTP 直连管线。用于复杂业务逻辑。 |

## 架构术语

| 术语 | 英文 | 定义 |
|------|------|------|
| **编排层** | Orchestration Layer | 四层架构最上层——Skills。告诉 AI Agent "我能做什么"。 |
| **声明层** | Declaration Layer | 四层架构第二层——Catalog JSON。声明 API 接口结构。 |
| **执行层** | Execution Layer | 四层架构第三层——Engine。执行 HTTP 请求 + 格式化输出。 |
| **插件层** | Plugin Layer | 四层架构最下层——Plugin System。插件加载、生命周期、Skills 注册。 |
| **Monorepo** | Monorepo | 单仓库多包管理——saicmotor-cli 使用 npm workspaces 管理 5 个 npm 包。 |
| **SDK** | SDK | `@saicmotor/sdk`——纯类型 + zod schema 包，零运行时逻辑。 |

## 插件系统

| 术语 | 英文 | 定义 |
|------|------|------|
| **插件** | Plugin | 独立 npm 包（`@saicmotor/plugin-*`），包含业务 catalog、skills、可选脚本。 |
| **插件加载器** | Loader | `loadPlugins()`——双根扫描并加载所有兼容插件。 |
| **注册器** | Registrar | `registrar.ts`——管理 skills 的 junction/copy 注册与注销。 |
| **双根扫描** | Dual-Root Scan | linked/ 和 node_modules/ 两个根目录分别扫描插件，linked 优先。 |
| **linked 优先** | Linked Priority | dev link 的插件（linked/）覆盖 npm 安装的同名插件（node_modules/）。 |
| **全量重建** | Full Rebuild | Suite 路由表每次都从所有已启用插件的 manifest.routes 重新生成——卸载后路由自动消失。 |
| **状态持久化** | State Persistence | `~/.saicmotor/plugins/state.json` 记录每个插件的启用/禁用状态。 |
| **Junction** | Junction | Windows 上的目录符号链接——`saicmotor dev` 用它建立 linked/ → 本地工程目录的映射。 |

## 认证

| 术语 | 英文 | 定义 |
|------|------|------|
| **Exchange 模式** | Exchange Mode | 默认认证方式——飞书 OAuth，浏览器授权后交换 token。 |
| **Password 模式** | Password Mode | 用户名+密码直接登录——仅用于本地开发/测试/CI，需环境变量 `SAICMOTOR_AUTH_TYPE=password` 启用。 |
| **Loopback** | Loopback | OAuth 回调服务器——绑定 `127.0.0.1:3000`，等待网关的授权回调。 |
| **ensureToken** | ensureToken | 从磁盘读取 token 或触发重新登录的函数。 |
| **401 重试** | 401 Retry | HTTP 401 时清除 token → 强制重新登录 → 重试一次（只一次）。 |

## 引擎管道

| 术语 | 英文 | 定义 |
|------|------|------|
| **管道** | Pipeline | 命令 → Commander 解析 → coerceFields → findScript → ensureToken → send → checkEnvelope → 输出的执行链路。 |
| **coerceFields** | coerceFields | 参数类型转换（string→int/float/boolean）+ 必填校验。 |
| **findScript** | findScript | 四层查找脚本覆盖——环境变量 → 插件 scripts → 编译产物 → 源码树。 |
| **checkEnvelope** | checkEnvelope | 响应校验——status < 400 且 body.code === 0 才算成功。 |
| **ScriptContext** | ScriptContext | 引擎注入给脚本的运行时上下文——config、service、method、values、dryRun、ensureToken。 |

## 配置

| 术语 | 英文 | 定义 |
|------|------|------|
| **包级默认** | Package Default | `saicmotor.config.json`——随 npm 发布的团队默认配置。 |
| **用户配置** | User Config | `~/.saicmotor/config.json`——用户的本地覆盖配置。 |
| **硬编码默认** | Hardcoded Default | `src/config.ts` 的 `DEFAULT_CONFIG`——最终兜底值。 |
| **配置瀑布** | Config Cascade | 环境变量 > 用户配置 > 包级默认 > 硬编码的优先级链。 |

## 构建与发布

| 术语 | 英文 | 定义 |
|------|------|------|
| **npm Workspaces** | npm Workspaces | npm 的 monorepo 管理方案——一个根 package.json 管理多个子包。 |
| **files 字段** | files Field | `package.json` 中显式列出发布文件的字段——saicmotor 逐文件声明而非用 `.npmignore` 排斥。 |
| **prepublishOnly** | prepublishOnly | npm lifecycle hook——`npm publish` 前运行 build + test。 |
| **preuninstall** | preuninstall | npm lifecycle hook——`npm uninstall -g` 前清理 skills + 数据。 |
| **Verdaccio** | Verdaccio | 轻量级私有 npm registry——用于本地测试发布。 |

## 数据目录

| 路径 | 内容 |
|------|------|
| `~/.saicmotor/config.json` | 用户配置 |
| `~/.saicmotor/token.json` | 认证 token（600 权限） |
| `~/.saicmotor/credentials.json` | 用户名/密码（600 权限，password 模式） |
| `~/.saicmotor/plugins/node_modules/` | npm 安装的插件 |
| `~/.saicmotor/plugins/linked/` | dev link 的插件 junction |
| `~/.saicmotor/plugins/state.json` | 插件状态清单 |
| `~/.claude/skills/saicmotor-*/` | 注册到 Claude Code 的 skills（junction） |
| `~/.agents/skills/saicmotor-*/` | 注册到 Cursor/Agent 的 skills |
| `~/.codebuddy/skills/saicmotor-*/` | 注册到 CodeBuddy 的 skills |