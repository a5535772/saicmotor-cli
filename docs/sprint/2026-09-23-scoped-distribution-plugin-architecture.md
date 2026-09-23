# 端到端架构设计：Scoped 分发 + 插件生态（S7 / S8 / S9 统一架构）

> 状态：⏳ 待评审 | 创建于 2026-09-23
>
> 本文是 Sprint 7、Sprint 8 与新建 Sprint 9 的**统一架构设计**，回答三个问题：
> 分发机制怎么改、业务插件怎么长出来、核心的终态边界是什么。
> 经 brainstorming 流程逐节确认后形成。评审通过后，S7/S8 文档据此修订，S9 文档据此新建。

## 0. 核心判断：分发与插件为什么必须一起设计

"改 npm 分发"与"插件开发模式"共享同一个包边界决策，设计上不可割裂；但实施上可以分期。耦合点：

1. **命名空间是同一件事**：改名 `@saicmotor/cli` 确立的是 `@saicmotor/*` 整个 scope，插件自然是 `@saicmotor/plugin-*`。外部用户为零时改名成本最低。
2. **主推 npx 直接决定插件住所**：npx 执行时 CLI 本体位于 npm 缓存的临时只读副本，插件不能装在 CLI 包内部，必须住在稳定目录（`~/.saicmotor/plugins/`），CLI 每次启动去发现。"分发方式"与"插件加载位置"是同一个决策。
3. **postinstall 职责需重新定义**：从"核心包从 GitHub 拉全套 skills"变为"插件安装时注册自己的 skills"，生命周期设计同时服务 S7 和 S8。
4. **版本契约依赖 scope + registry 就位**：`latest`/`beta` dist-tag、插件 engine 兼容范围都建立在内部 registry 之上。

执行拆为三期：**S7** 分发地基（内部结构不动，但不堵死插件的路）→ **S8** 插件机制全套 → **S9** 默认业务能力收敛。

## 1. 架构全景

```
使用者： AI Agent ──调用──► saicmotor <系统> <命令>
安装方式： npx @saicmotor/cli@latest  ｜  npm i -g @saicmotor/cli   （bin 名不变：saicmotor）
                                  │
                                  ▼
┌─ @saicmotor/cli —— 核心（零业务知识）──────────────────────┐
│ ① CLI 层      commander + 启动向导                         │
│ ② Loader      插件发现 / manifest 解析 / engine 版本强校验 │
│ ③ Engine      catalog 合并 → 动态命令 → session → http     │
│               → script 兜底（流水线业务无关，不变）        │
│ ④ Auth        password / 飞书 SSO、token 0600、写操作确认  │
│ ⑤ Tooling     create plugin / validate / dev / plugin *    │
└───────┬──────────────────────────────────┬─────────────────┘
      读取/校验                              调用 npm 安装
        ▼                                    ▼
~/.saicmotor/                         Registry（POC：本地 Docker Verdaccio，端点可替换）
├─ config.json                        ├─ @saicmotor/cli
├─ credentials/（0600）               ├─ @saicmotor/sdk        类型/schema/测试helper
└─ plugins/                           ├─ @saicmotor/plugin-user   ← S9 后唯一默认
   ├─ state.json   （启用/版本状态）  ├─ @saicmotor/plugin-leave   （S8 参考插件，S9 外迁）
   └─ node_modules/@saicmotor/        ├─ @saicmotor/plugin-attendance（同上）
        plugin-x/                     └─ @saicmotor/plugin-*  ← 业务团队各自发布
          ├─ saicmotor.plugin.json（含 engine 版本范围）
          ├─ catalog/*.json   ──合并──► 核心命令
          ├─ skills/<name>/SKILL.md ──注册──► ~/.agents/skills、~/.claude/skills…
          └─ scripts/*.js      ──兜底执行──► Engine
```

### 三个关键不变量

1. **CLI 本体可丢弃**：npx 缓存随时失效，一切有状态内容（配置、凭证、插件）都在 `~/.saicmotor/`（飞书 CLI"稳定位置 + 运行时自愈"模式的落地；飞书的重东西是 Go 二进制，我们的重东西是插件与用户数据）。
2. **只有一套插件机制**：连"查询用户基本信息"都是插件，核心不认识任何具体业务。
3. **插件独立于核心发版**：一个业务系统一个包、独立版本号，靠 manifest 的 engine 范围做兼容契约。

### Registry：POC 与终态

- POC 阶段：本地 Docker 运行 **Verdaccio**。
- 架构要求：registry 地址是**可替换端点**，只出现在 `.npmrc`（`@saicmotor:registry=<端点>`），代码与脚手架不硬编码任何地址。POC 验证完换正式内网服务器时零代码改动。
- 安装指引必须覆盖 scoped registry 配置；未配置时 npx 走公共 npm 会 404。

### 仓库组织：框架 monorepo + 业务插件一律外仓

框架维护者使用 npm workspaces monorepo：

```
workspace/
  packages/cli/                 ← 现仓库内容（剥除业务后）
  packages/sdk/
  packages/plugin-user/
  packages/plugin-leave/        ← S8 在此，S9 迁出
  packages/plugin-attendance/   ← S8 在此，S9 迁出
```

理由：S8 期间插件契约（loader / manifest / ScriptContext）会高频变更，同仓原子改动避免多仓连环发版；两个参考插件保证引擎改动被真实插件即时回归；workspaces 不强制统一版本号，各包独立 publish。业务插件从第一天就在业务团队自己的仓库，由脚手架生成，**永不进 monorepo**。未来参考插件可按目录平滑外迁，包名不变、用户无感。

## 2. 插件模型

### 2.1 标准结构

```
@saicmotor/plugin-reimbursement/
├─ package.json
├─ saicmotor.plugin.json          ← 插件 manifest（必需）
├─ catalog/
│  └─ services/reimbursement.json ← 复用现有 zod ServiceSchema；一个包可含多个 service
├─ skills/
│  └─ saicmotor-reimbursement/SKILL.md
└─ scripts/
   └─ reimbursement/report/create.js   ← 可选；纯声明能覆盖的就不写
```

### 2.2 `saicmotor.plugin.json` 契约

```json
{
  "name": "@saicmotor/plugin-reimbursement",
  "engine": "^1.0.0",
  "catalog": ["catalog/services/*.json"],
  "skills": ["skills/saicmotor-reimbursement"],
  "scripts": "scripts"
}
```

- **`engine`：兼容契约的唯一载体**，semver 范围。启动时强校验：不匹配 → 该插件**整体禁用**（命令 / skill / script 一律不加载），提示"需要核心 ≥x <y，当前 z"。其他插件与核心命令不受影响。升级提示按安装形态区分：全局安装提示 `saicmotor plugin upgrade`；npx 临时调用提示 `npx @saicmotor/cli@latest`（不写死具体版本号，依 `latest` 语义）。
- **不写 `peerDependencies`**：npm ≥7 会自动安装 peer 依赖，`plugin install` 内部 `npm install <pkg>` 时会把整个 `@saicmotor/cli` 作为嵌套依赖装进插件目录（体积膨胀、版本漂移、引擎逻辑双份都是坑）。兼容契约只由 manifest 的 `engine` 字段承担，脚手架的 package.json 也不生成 peerDeps。
- 其余字段为贡献物清单，缺省按约定路径自动探测。
- **版本里程碑**：插件机制上线时核心直接发 **1.0.0**（当前 0.4.0 的 `^0.x` 语义会把业务开发者反复卡在"不兼容"），此后 core minor/patch 升级在 `engine` 允许范围内不强制插件同步发版。

### 2.3 启动加载流程

```
CLI 启动
  → 扫描插件双根：
     · ~/.saicmotor/plugins/node_modules/@saicmotor/plugin-*（已安装）
     · ~/.saicmotor/plugins/linked/@saicmotor/plugin-*（dev link，junction/符号链接指向业务团队工程）
     （任何阶段核心包内都没有插件根；S8 的参考插件同样经 install / dev link 进入上述目录）
  → 读每个包 saicmotor.plugin.json → zod 校验 manifest
  → engine 范围检查 → 不兼容者剔除并记录警告
  → 合并 catalog：所有插件的 services 汇总
  → 冲突检测 → 按 services 动态注册 commander 命令
  → script 解析：<service,resource,method> → 命中插件的 scripts/ 目录
  → 执行现有引擎流水线
```

### 2.4 冲突规则

| 冲突类型 | 规则 |
|---|---|
| 两个插件提供同名 `service.name` | 启动报错并拒绝后加载者，提示用 `plugin disable` 处理；不允许静默覆盖 |
| 同一 service 资源/方法重复 | catalog zod 校验阶段报错，指明两个来源文件 |
| 已安装插件与 dev link 插件同名 | dev link 优先，`plugin list` 标 `linked` 并给出工程路径；解除 link 后恢复已安装版本 |
| skill 名撞车 | 按 (skill 名, 插件名) 归属判断：归属本插件则覆盖（升级重装），归属他插件则拒绝并提示（见 §2.6） |

加载优先级：外部插件按名称字母序（可预测、可复现），不采用"谁后装谁赢"。

### 2.5 `state.json` 与 `plugin` 命令

`~/.saicmotor/plugins/state.json` 记录每个插件的 `enabled`、安装版本、来源 tag。

| 命令 | 行为 |
|---|---|
| `plugin install <pkg>` | 内部执行 `npm install <pkg>@<tag>` 到插件目录（registry 走 `.npmrc`，带 `--legacy-peer-deps` 防嵌套）；完成后**立即注册其 skills 并重生成 suite 路由**；写 state。`<pkg>` 支持短名（`reimbursement` → `@saicmotor/plugin-reimbursement`） |
| `plugin uninstall` | 注销本插件 skills → 删除其 suite 路由条目 → npm 卸载 → 清 state → 清理残留（见 §5 残留清单） |
| `plugin list` | 名称、版本、来源（registry / dev link）、兼容状态（ok/incompatible）、enabled |
| `plugin enable / disable / upgrade` | 仅改 state / 重新安装，不触碰其他插件 |

**机读输出约定**：所有 `plugin` 子命令与 `saicmotor --list` 支持 `--json`，输出稳定 schema（字段名、枚举值固定），作为 AI"零文档化发现"的机读接口；实时知识以 `--json` 为准，不以着色文本解析。

**注册的写入口唯一**：`plugin install` / `uninstall` 是唯一写入口，loader 启动时只读发现。因此插件**不需要**自己的 postinstall（更小 allow-scripts 面），同时移除当前对外部 `skills` CLI 与 GitHub repo 的运行时依赖。

### 2.6 SKILL.md 注册机制（AI 可发现性的核心）

这是"插件装好后，Claude Code 等 AI 客户端如何发现能力"的完整链路，是本次架构的关键闭环（对应评审 🔴#1）。

- **权威注册权收回核心**：核心 CLI 内置"注册器"，**不再在运行时依赖外部 `skills` CLI**——当前 postinstall 的 `npx skills add <GitHub repo> --all -g` 接收 GitHub 仓库，对新架构下的本地插件不适用。
- **链路**：`plugin install` 时，注册器读取插件包的每个 `skills/<name>/SKILL.md`，将其落到各 AI 客户端目录的标准位置（`~/.agents/skills/<name>/SKILL.md`、`~/.claude/skills/<name>/SKILL.md`、`~/.codebuddy/skills/<name>/SKILL.md` 等）。客户端目录全集集中在注册器的一处常量，新增客户端只改一处。
- **Windows 落盘方式**：优先目录 junction（无需管理员）；junction 不可用时降级为**复制 SKILL.md**，并在 `plugin list` / 日志中标识实际落盘方式。
- **覆盖规则**：按 `(skill 名, 插件名)` 归属判断——state.json 记到该 skill 属于本插件，则升级重装可覆盖；属于其他插件则拒绝并提示。
- **注销规则**：`plugin uninstall` 删除本插件建立的 skill 条目与联结，不触碰其他插件/客户端的 skill。
- **写入口唯一**：只有 `install` / `uninstall` 有写副作用，loader 与每次启动只读发现——因此 `npx @saicmotor/cli@latest` 临时调用天然零副作用（不碰任何 AI 客户端目录）。

### 2.7 suite 路由聚合

`sprint-8 §4.2` 的"saicmotor-suite 聚合路由"在插件化后不再是核心静态文件，改为**注册器生成**。

- 现状：`saicmotor-suite/SKILL.md` 是一张写死的路由表（意图 → `saicmotor-leave` / `saicmotor-attendance` / `saicmotor-shared`）。
- 插件化后：插件 manifest 增加可选 `routes` 字段（意图关键词 → 本插件入口 skill）。`plugin install / uninstall` 时注册器聚合所有已启用插件的 `routes`，**重新生成 suite 的意图路由表**。
- 未声明 `routes` 的插件不进 suite 聚合路由，但仍可被 `plugin list` 与直接加载发现（不影响其 CLI 命令与自身 SKILL.md 生效）。
- suite 仍是"聚合入口"角色，只是表内容由核心静态改为运行时派生；三处来源（核心命令、已装插件、dev link 插件）用同一套生成逻辑。

## 3. 开发者工作流

```
① npx @saicmotor/cli@latest create plugin reimbursement
     → 生成独立工程（业务团队自己的 git 仓）：
       package.json（无 peerDependencies）、saicmotor.plugin.json（含 engine 范围与可选 routes）、
       catalog/services/reimbursement.json、skills/saicmotor-reimbursement/SKILL.md、
       scripts/（空，附"何时才需要脚本"说明）、vitest 配置 + mock-gateway 联调说明
② 填 catalog / 写 SKILL.md；必要时在 scripts 模板里补 JS
③ npx @saicmotor/cli@latest validate .
     → 不依赖核心源码：catalog zod 校验 + manifest 校验 +
       skill frontmatter 检查（requires.bins、写操作确认声明）
④ npm test                 ← SDK 测试 helper（本地 mock + 命令结果断言）
⑤ npx @saicmotor/cli@latest dev
     → 在 ~/.saicmotor/plugins/linked/ 下建 junction 指向当前工程（写 state，不改 node_modules）
     → 本地改动即时被全局 / npx CLI 加载（loader 双根含 linked/）；对接 mock-gateway 真实联调
     → saicmotor dev --stop 解除 junction
⑥ npm publish              ← prepublishOnly 自动跑 validate + test
⑦ 同事：npx @saicmotor/cli@latest plugin install reimbursement
```

### `@saicmotor/sdk` 边界

插件工程的 **devDependency**，刻意做小：

| 导出 | 用途 |
|---|---|
| `ScriptContext` 等类型 | 写 scripts 时有完整类型 |
| catalog / manifest 的 zod schema | 与核心共用同一份判定，杜绝"本地 validate 过、核心加载拒" |
| `definePlugin()` | manifest 类型助手（可选） |
| 测试 helper | 启动内存 mock 服务、经 loader 加载本插件、断言命令结果 |

SDK **不含引擎本体**：插件不依赖也不复制核心代码，运行时由 CLI 构造并注入 ScriptContext。SDK 自身声明适用的 engine 范围，装错版本时 validate 即可发现。

## 4. Sprint 分期

### S7 —— 分发地基（不改内部结构）

- 本地 Docker Verdaccio；`.npmrc` 配置 `@saicmotor:registry=<端点>`，端点可替换
- 改名 `@saicmotor/cli`（bin 名 `saicmotor` 不变）；建立 `latest` / `beta` dist-tag 规范
- 主推 `npx @saicmotor/cli@latest`，全局安装并存
- files 字段显式化、postinstall npx 跳过、run.js 缺失降级指引（沿用 sprint-7 既定任务）
- 去掉 `prepare` 钩子（发布前由 prepublishOnly 保证 dist/ 已构建），评估是否保留开发期用法
- HTTP 安装指引（todo#3 之"装"）在此期落地：承载地址与 registry 形态一致（内部可访问），内容为一条 npm 命令 + scoped registry 配置 + 验证，AI WebFetch 即可执行
- 旧包名处置策略二选一并记录；`npx @saicmotor/cli@latest --version` 与 `npm i -g @saicmotor/cli` 两条路径干净环境端到端验证

### S8 —— 插件机制（结构大改，机制统一）

- 建 npm workspaces monorepo：`packages/{cli,sdk,plugin-user,plugin-leave,plugin-attendance}`
- 核心剥离全部业务：loader（双根扫描 / 强校验 / 冲突）、catalog 合并、动态命令注册、script 多源查找
- SDK 首版；`create plugin` / `validate` / `dev` / `plugin *` 命令
- leave / attendance 迁为 monorepo 内插件包，S1~S4 回归集全过，证明统一机制无功能回退
- skills 注册收回核心"注册器"：install / uninstall 是唯一写入口，移除 `saicmotor.config.json` 中 GitHub repo 与 `--all` 硬编码、去掉对外部 `skills` CLI 的运行时依赖
- suite 路由表改为注册器按插件 `routes` 字段聚合生成；核心发 **1.0.0** 作为插件机制发行版，落地 engine 强校验与 `--json` 机读输出
- 交付开发者手册（原 S6 范围）：目录职责、"简单接口零代码"判定、SKILL.md 规范、全流程 checklist、排障
- 不做 marketplace / 上架审批，只做"能发能装"

### S9 —— 默认能力收敛（新建）

- leave / attendance 迁出 monorepo 为独立仓（可交业务团队维护），验证纯外部分发路径
- 核心首跑向导：引导安装 `@saicmotor/plugin-user`（默认勾选）；它同样是插件，数据源差异封装在插件内
- 终态验收：裸核心零业务命令；装 user 插件即可查询个人信息；leave / attendance 作为纯外部插件可装可卸
- TODO 事项 2（卸载自动化）与事项 3 的"卸载能力 / uninstall skill"并入 S9：卸载设计依赖插件住所定型；事项 3 的"HTTP 安装指引"已随 S7 落地

## 5. 安全与错误处理原则

- 插件复用同一安全模型：写操作确认、凭证 0600，无任何绕过口子。
- 任何单插件加载失败（坏 manifest、schema 校验失败、engine 不兼容）→ 该插件隔离禁用，错误信息带包名与修复路径，绝不拖垮 CLI 启动，不影响其他插件。
- npx 临时调用场景不做任何注册/清理副作用（沿用 npx 检测经验）；loader 永远只读。

### 卸载残留物完整清单（install / uninstall 必须一起覆盖）

`plugin uninstall` 与"整体卸载"（TODO 事项 2）要处理的全部残留，不得遗漏：

1. 各 AI 客户端目录里的 skill 条目/联结（按 §2.6 归属判断，只删本插件的）
2. suite 路由表中本插件的意图行（重生成）
3. `~/.saicmotor/plugins/node_modules/<pkg>`——npm 卸载可能留空目录/半损坏目录
4. `~/.saicmotor/plugins/linked/<pkg>`——dev link junction 残留
5. `state.json` 中该插件条目
6. `~/.saicmotor/credentials/`——**整体卸载**时默认清除并提示（含访问令牌，属安全项），`plugin uninstall`（单个）则保留

纠偏：loader 启动时对 state 与磁盘目录做一次**对账**（照飞书 CLI"运行时自愈"思想），发现孤儿目录/残留条目给出 `saicmotor plugin cleanup` 或自动清理提示，不静默带病运行。

## 6. 验收标准（端到端）

1. 未配置任何全局安装的机器上，仅凭 scoped registry 配置即可 `npx @saicmotor/cli@latest` 完成登录与一次业务调用。
2. 业务开发者在**不获取核心源码**的机器上，能完成新插件从 `create` 到 `publish` 的全过程。
3. 第三方插件安装后：对应 CLI 命令可执行、`plugin list` 可见、AI Agent 能读到其 SKILL.md 并正确编排（验证方法：装插件后开新会话，让 AI 仅凭 skill 描述复述/调用该能力，不额外喂文档）。
4. 插件与核心版本不兼容时，安装或启动环节有明确报错，且不影响其他插件与核心命令。
5. 升级单个插件不影响其他插件；核心升级在兼容范围内不强制插件同步发版。
6. S9 终态：核心无业务命令，默认 user 插件提供个人信息查询；leave / attendance 纯外部化，S1~S4 回归集全部通过。
7. `plugin list --json` 输出稳定机读、字段名与枚举值固定，AI 无需文档即可据此发现已装能力与可执行命令。
8. 卸载（含整体卸载）后无残留：skills 条目、suite 路由行、node_modules 目录、linked junction、state.json 条目全部清理；凭证清除（整体卸载）有明确提示。

## 7. 关联文档

- [Sprint 7: npm Registry 发布](sprint-7-npm-registry-publish.md)
- [Sprint 8: Skill 插件化生态](sprint-8-skill-plugin-ecosystem.md)
- [TODO 清单](todo.md)
- 经验依赖（memory）：npm-registry-publish-strategy、npm-v11-global-install-quirks、feishu-cli-npx-detection、feishu-cli-runjs-graceful-degradation、feishu-cli-explicit-files
