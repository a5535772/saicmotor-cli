# Sprint 8: Skill 插件化生态 —— 业务开发者的开发、集成与版本部署

> 状态：⏳ 需求说明（已评审） | 创建于 2026-09-22，修订于 2026-09-23
>
> 本 sprint 需求已随 [端到端架构设计](2026-09-23-scoped-distribution-plugin-architecture.md) 完成技术决议（经交叉评审）。
> 本文件只陈述需求、拍板结论与验收标准，实现细节以架构文档 §2~§4「S8」为准。

## 1. 背景

### 1.1 判断：未来的绝大多数开发者是业务开发者

S1~S7 的使用者隐含为"框架开发者"——动 `src/`、改核心包、维护 `skills/` `catalog/` `scripts/`。项目走向推广期后：

- **绝大多数开发人员不碰核心框架代码**（`src/` 不可见、无权发版）
- 他们**大量编写 skill**：每接入一个业务系统就产生一组 skill + catalog + script
- 他们关心"我的业务能力怎么开发、挂上去、发版给同事用"，不关心引擎如何工作

### 1.2 现状：所有能力耦合在核心包里

| 现状 | 导致的问题 |
|------|-----------|
| skill / catalog / script 全在核心仓库 | 加一个业务系统要改核心仓库，业务团队必须接触框架代码 |
| 能力随核心包整包发布 | 一个业务 skill 的小改动要重发整个 CLI，全员被迫升级 |
| CLI 启动只扫描包内 `catalog/services/` | 无外部能力加载入口 |
| postinstall 从核心 repo 一次性 `skills add --all` | 只认核心仓库 skills，业务 skill 无法安装注册 |
| 无插件版本概念 | 核心与能力之间无兼容契约，引擎升级可能静默打断业务能力 |

### 1.3 硬前置与范围

- **S7（内部 registry + scoped 分发）是硬前置**：插件以独立 npm 包经内部 registry 分发，S7 不完成则无分发通道。
- **S6（开发者手册）并入本 sprint**，作为开发者体验交付物。
- **统一机制**：核心自带能力（leave / attendance）同样改造为插件，与外部业务插件走同一套声明、加载、版本机制，长期只维护一套逻辑。

## 2. 目标

1. 业务开发者**不 clone 核心仓库、不碰 `src/`**，在独立工程里完成 skill 全部开发。
2. 业务能力以**独立插件**解耦：独立安装、独立升级、独立版本号。
3. 核心 CLI 运行时**发现并加载外部插件**（catalog 声明、script 覆盖、SKILL.md 注册三类贡献物都支持）。
4. 核心内置能力与外部插件**机制完全统一**（连默认"用户信息查询"都是插件）。
5. 有明确的**插件 ↔ 核心版本兼容契约**，不兼容组合在安装/启动时被拦下并给清晰提示。
6. 脚手架、本地调试、校验、打包发布的**标准工作流**与开发者手册齐备。

非目标（业务开发者能力边界）：

- 不要求理解引擎流水线（catalog → session → request → http）
- 不要求会写 TS 引擎代码；声明式 catalog 能解决就不写 script

## 3. 已拍板决策（原 Q1~Q4 + 评审补强）

| 决策项 | 结论 |
|--------|------|
| Q1 打包粒度 | **一系统一包**：`@saicmotor/plugin-<system>`，内含 catalog + SKILL.md + scripts |
| Q2 发现方式 | **前缀扫描 + state 文件**：loader 双根扫描 `plugins/node_modules/@saicmotor/plugin-*`（已装）与 `plugins/linked/@saicmotor/plugin-*`（dev link），state.json 记启用/版本/来源 |
| Q3 兼容契约载体 | **manifest `engine` 字段 + 启动强校验**：不匹配整体禁用；**不写 peerDependencies**（npm ≥7 会自动安装 peer，导致 CLI 嵌套进插件目录） |
| Q4 marketplace/审批 | S8 只做"能发能装"，官方目录与上架审批留后续 |
| 版本里程碑 | 插件机制上线即**核心 1.0.0**（避开 `^0.x` 反复"不兼容"） |
| skills 注册 | **收回核心"注册器"**：install/uninstall 是唯一写入口，loader 只读；插件不再依赖外部 `skills` CLI / GitHub repo，也不自带 postinstall |
| suite 路由 | `saicmotor-suite` 从静态表改为**注册器按插件 `routes` 聚合生成** |
| 机读输出 | 所有 `plugin` 命令 + `saicmotor --list` 支持 `--json`，稳定 schema |
| 仓库 | 框架 **npm workspaces monorepo**（cli/sdk/plugin-user/plugin-leave/plugin-attendance）；业务插件一律外仓 |

## 4. 需求拆解

### 4.1 插件模型与集成

- [ ] 插件标准结构：`saicmotor.plugin.json`（manifest，含 `engine`/`catalog`/`skills`/`scripts`/可选 `routes`）+ catalog + skills + scripts
- [ ] loader：双根扫描、manifest 校验、engine 强校验、catalog 合并、动态命令注册、script 多源查找
- [ ] 冲突规则：服务名/资源重复报错拒绝；skill 撞车按 `(skill 名, 插件名)` 归属判断
- [ ] 注册器：install 时把各 SKILL.md 落到各 AI 客户端目录（Windows 优先 junction、降级复制）
- [ ] suite 路由聚合：install/uninstall 时按 `routes` 重生成意图路由表
- [ ] 插件生命周期命令：`plugin install/uninstall/list/enable/disable/upgrade`（均支持 `--json`）
- [ ] 启动兼容检查：不兼容插件禁用 + 清晰提示，不拖垮启动、不影响其他插件

### 4.2 版本与部署

- [ ] 内部 registry 分发（复用 S7）；插件发版流程文档化
- [ ] 安装期行为：不依赖插件 postinstall（allow-scripts 被拦不影响）
- [ ] 卸载残留物全清单：skills 条目、suite 路由、node_modules、linked junction、state、凭证

### 4.3 开发者工作流（工具链 + 开发者手册，含原 S6）

- [ ] `create plugin <name>`：生成标准插件工程（无 peerDeps、含 engine 与可选 routes）
- [ ] `validate .`：catalog/manifest zod 校验 + skill frontmatter 检查，不依赖核心源码
- [ ] `dev`：在 `linked/` 下建 junction 指向本地工程，即时加载；`dev --stop` 解除
- [ ] SDK 首版：ScriptContext 类型、共享 zod schema、`definePlugin`、测试 helper（不含引擎本体）
- [ ] 开发者手册：目录职责、"零代码 vs 落脚本"判定、SKILL.md 规范、全流程 checklist、排障

### 4.4 内置能力插件化

- [ ] leave / attendance 迁为 monorepo 内插件包（走同一套机制）
- [ ] S1~S4 回归集全过，证明统一机制无功能回退

## 5. 验收标准

1. 业务开发者在**不获取核心源码**的机器上，能完成新插件从 `create` 到 `publish` 的全过程。
2. 第三方插件安装后：对应 CLI 命令可执行、`plugin list` 可见、AI Agent 能读到其 SKILL.md 并正确编排（验证方法：装插件后开新会话，让 AI 仅凭 skill 描述复述/调用，不额外喂文档）。
3. 插件与核心版本不兼容时，安装或启动环节明确报错，且不影响其他插件与核心命令。
4. 升级单个插件不影响其他插件；核心升级在兼容范围内不强制插件同步发版。
5. 内置 leave / attendance 以插件形态运行，S1~S4 回归集全部通过。
6. `plugin list --json` 输出稳定机读，字段名与枚举值固定，AI 无需文档即可发现已装能力。
7. 卸载（含整体卸载）后无残留：skills 条目、suite 路由行、node_modules、linked junction、state 条目全部清理；凭证（整体卸载）有明确提示。

## 6. 关联文档

- [端到端架构设计（S7/S8/S9）](2026-09-23-scoped-distribution-plugin-architecture.md)
- [Sprint 7: npm Registry 发布 + Scoped 改名](sprint-7-npm-registry-publish.md)
- [Sprint 9: 默认能力收敛](sprint-9-default-capability-convergence.md)
- [Sprint 3: 三层架构落地](sprint-3-catalog-script-skill.md)
- [Sprint 4: AI 发现机制](sprint-4-ai-discovery.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- 经验依赖（memory）：npm-registry-publish-strategy、npm-v11-global-install-quirks、feishu-cli-npx-detection

## 7. 不做的

- ❌ 不改引擎业务无关性——插件化只增加"加载外部贡献物"能力，引擎流水线不吸收业务知识
- ❌ 不引入第二语言/第二运行时——插件仍是 TS/JS + 声明式 JSON
- ❌ 不做插件市场 UI、不做服务端托管平台（聚焦机制与 npm 分发）
- ❌ 不允许插件绕过写操作确认、凭证 0600 等安全约定——复用同一套安全模型