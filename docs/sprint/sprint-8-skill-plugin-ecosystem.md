# Sprint 8: Skill 插件化生态 —— 业务开发者的开发、集成与版本部署

> 状态：⬜ 需求梳理（待评审） | 创建于 2026-09-22
>
> 本文只做**需求整理与问题界定**，不含技术设计。设计文档在评审通过后另起。

## 1. 背景

### 1.1 判断：未来的绝大多数开发者是业务开发者

S1~S7 的使用者隐含为"框架开发者"——动 `src/engine/`、改核心包、维护 `skills/` `catalog/` `scripts/` 三个核心目录。但项目走向推广期后：

- **绝大多数开发人员不碰核心框架代码**（`src/` 对他们不可见、也无权发版）
- 他们会**大量编写 skill**：每接入一个业务系统（报销、差旅、餐补……）就产生一组 skill + catalog + script
- 他们关心的是"我的业务能力怎么开发、怎么挂上去、怎么发版给同事用"，而不是引擎怎么工作

### 1.2 现状：所有能力都耦合在核心包里

当前 `package.json`：

```json
"files": ["dist/", "skills/", "catalog/", "scripts/", "saicmotor.config.json"]
```

| 现状 | 导致的问题 |
|------|-----------|
| skill / catalog / script 全部在核心仓库内 | 加一个业务系统要改核心仓库，业务团队必须接触框架代码 |
| 能力随核心包整包发布 | 一个业务 skill 的小改动，要重发整个 saicmotor-cli，全员被迫升级 |
| CLI 启动只扫描包内 `catalog/services/` | 没有外部能力的加载入口，第三方扩展无处安放 |
| postinstall 从核心 repo 一次性 `skills add --all` | 只认核心仓库的 skills，业务团队的 skill 无法随安装自动注册 |
| 无插件版本概念 | 核心与能力之间没有兼容契约，引擎升级可能静默打断业务能力 |

### 1.3 前置依赖与范围调整

- **S7（内部 npm registry 发布）是 S8 的硬前置**：插件最终要以独立 npm 包为载体经内部 registry 分发，S7 不完成，插件没有分发通道。
- **S6（开发者指导手册）并入 S8**：S6 规划的"赋能业务团队自主开发 skill"就是 S8 的开发者体验部分，不再单独立 sprint，开发者手册作为 S8 的交付物之一。
- **统一机制原则（已确认）**：核心自带能力（leave / attendance）同样改造为"内置插件"，与外部业务插件走**同一套声明、加载、版本机制**，长期只维护一套逻辑。

## 2. 目标

1. **业务开发者不 clone 核心仓库、不碰 `src/`**，在独立工程里完成 skill 全部开发。
2. 业务能力以**独立插件**形式与核心框架解耦：独立安装、独立升级、独立版本号。
3. 核心 CLI 能在运行时**发现并加载外部插件**（catalog 声明、script 覆盖、SKILL.md 注册三类贡献物都要支持）。
4. 核心内置能力与外部插件**机制完全统一**。
5. 有明确的**插件 ↔ 核心版本兼容契约**，不兼容组合在安装/启动时被拦下并给出清晰提示。
6. 提供脚手架、本地调试、校验、打包发布的**标准工作流**与开发者手册，让业务开发者"照着做就行"。

非目标（对业务开发者的能力边界）：

- 不要求理解引擎流水线（catalog → session → request → http）
- 不要求能写 TS 引擎代码；能用声明式 catalog 解决的就不写 script，必须写 script 时模板兜底

## 3. 用户画像与典型旅程

### 画像 A：业务开发者（主要用户）

> "报销系统要上线，我要做一个报销 skill 并让全公司用起来。"

期望旅程：

1. `saicmotor create plugin reimbursement`（或等效脚手架）→ 得到标准插件工程
2. 填 catalog JSON / 写 SKILL.md / 必要时在模板里补 script
3. 本地校验 + 对接 mock-gateway 自测（复用 S1~S4 的测试基础设施）
4. `saicmotor dev`（本地 link 到自己机器上的全局 CLI）真实联调
5. 发版本到内部 registry
6. 同事 `saicmotor plugin install reimbursement` 即可用，AI Agent 自动获得对应 skill

### 画像 B：框架维护者

> "我要发 saicmotor-cli 新版本，不能让线上 20 个插件集体挂掉。"

关注点：插件 API 契约稳定性、兼容范围检查、弃用策略、插件生态可观测（装了哪些、哪些版本）。

### 画像 C：最终用户 / AI Agent

> 无感知。插件装好后命令照旧 `saicmotor <系统> <命令>`，Agent 照旧读 SKILL.md，不需要知道能力来自内置还是外部插件。

## 4. 需求拆解

### 4.1 插件模型（核心需求，决定一切）

- [ ] 定义**插件的组成**：一个插件至少包含哪些贡献物（候选：catalog JSON + SKILL.md，scripts 可选；外加统一的 plugin manifest）
- [ ] 定义**插件打包粒度**（待决策，见 §6-Q1）：一个业务系统一个包？还是 skill / catalog 分开打包？
- [ ] 定义**命名与发现约定**（待决策 §6-Q2）：npm 包名前缀（如 `saicmotor-plugin-*` / `@saicmotor/plugin-*`）自动发现，还是配置文件显式登记
- [ ] 定义插件的安装位置与加载路径：全局 npm 包、`~/.saicmotor/plugins/`、或项目级目录
- [ ] **内置插件改造（已确认要做）**：leave / attendance 从核心目录迁出为内置插件，验证"只有一套机制"——外部插件能做到的，内置插件也必须用同一路径做到

### 4.2 框架的插件集成能力

- [ ] **catalog 加载扩展**：CLI 启动时合并各插件（内置 + 外部）贡献的 catalog
- [ ] **命令动态注册**：插件 catalog 里的 resource/method 自动生成 CLI 命令，与核心命令无差别
- [ ] **script 解析扩展**：`engine/script.ts` 的查找路径要能定位到插件包内的 scripts
- [ ] **SKILL.md 注册扩展**：插件安装后其 SKILL.md 自动注册到 AI skills 目录（对标当前 postinstall 的 `npx skills add`，但来源从"核心 repo"变为"每个插件自己"）
- [ ] **suite 路由聚合**：`saicmotor-suite` 如何把插件 skill 纳入聚合路由（自动收录 or 插件声明挂载点）
- [ ] **冲突处理**：两个插件提供同名 service/命令时的优先级与报错规则
- [ ] **插件生命周期命令**（候选）：
  - `saicmotor plugin install <name>` / `uninstall`
  - `saicmotor plugin list`（名称、版本、兼容状态、内置/外部）
  - `saicmotor plugin upgrade [name]` / 启用禁用
- [ ] **启动兼容检查**：核心启动时校验每个插件声明的引擎版本范围，不兼容则禁用该插件并提示升级路径，不允许静默带病运行

### 4.3 版本与部署

- [ ] **版本兼容契约**（待决策 §6-Q3）：插件以 peerDependencies 还是自定义 manifest 字段声明兼容的核心版本范围；语义化版本规则（核心 patch/minor/major 对插件的影响承诺）
- [ ] **发布通道**：复用 S7 落实的内部 registry；插件发版流程文档化（`prepublishOnly` 校验、`npm publish`）
- [ ] **安装期行为**：插件自己的 postinstall 如何完成 skill 注册；npx 场景同样要跳过（沿用已有经验）
- [ ] **升级策略**：核心升级后插件超范围如何提示；插件独立升级不影响其他插件
- [ ] **分发审批（可选）**：公司环境是否需要插件上架审核 / 官方目录（marketplace），还是 registry 上谁都能发、靠命名约定信任（倾向 S8 只做机制，见 §6-Q4）
- [ ] 内网离线/代理环境下的安装验证（沿用 npm v11 三坑经验）

### 4.4 业务开发者工作流、工具链与开发者手册（含原 S6 范围）

- [ ] **脚手架命令**：一键生成插件工程骨架（catalog 模板、SKILL.md 模板、script 模板、package.json、manifest）
- [ ] **声明校验**：catalog JSON 的 zod 校验可在插件工程内独立运行（`saicmotor validate`），不依赖核心源码
- [ ] **本地调试**：link 机制——插件工程本地改动即时被全局 CLI 加载；可对接 mock-gateway 联调
- [ ] **测试约定**：插件如何在自带 mock/测试用户侧写集成测试；核心提供测试 helper（作为 dev 依赖包或文档范式）
- [ ] **开发者手册**（原 S6 交付物，S8 内完成）：
  - 插件目录结构与各文件职责
  - "简单接口零代码，复杂逻辑落脚本"的判定标准
  - SKILL.md 写作规范（frontmatter、requires.bins、编排规则、写操作确认）
  - 从开发、自测、联调到发版的全流程 checklist
  - 常见报错与排障

## 5. 验收标准（需求层面）

1. 业务开发者在**不获取核心仓库源码**的机器上，能完成一个新业务插件从创建到发布的全过程。
2. 第三方插件安装后：对应 CLI 命令可执行、`saicmotor plugin list` 可见、AI Agent 能读到其 SKILL.md 并正确编排。
3. 插件与核心版本不兼容时，安装或启动环节有明确报错，且不影响其他插件和核心命令。
4. 升级单个插件不需要重装或重启核心之外的任何东西；核心升级不强制插件同步发版（在兼容范围内）。
5. 内置 leave / attendance 以插件形态运行，S1~S4 回归集**全部通过**，证明统一机制无功能回退。

## 6. 待决策问题（设计阶段前需要拍板）

- **Q1 打包粒度**：一个业务系统 = 一个 npm 包（内含 catalog+skill+scripts，推荐）？还是 skill 与 catalog 分离、允许多个 skill 共享一个 catalog 包？
- **Q2 发现方式**：包名前缀自动扫描（约定优于配置）vs 配置文件显式登记插件列表（可控、可禁用）vs 两者结合？
- **Q3 兼容契约载体**：npm `peerDependencies`（生态原生、npm 自带警告但不阻断）vs 插件 manifest 自定义引擎版本范围 + 核心启动时强校验（推荐，行为可控）？
- **Q4 marketplace/审核机制**：S8 只做"能发能装"，官方插件目录与上架审批留后续 sprint？（倾向只做机制）

已确认：

- ✅ S6 开发者手册并入 S8，不单独排期
- ✅ 核心内置能力（leave / attendance）插件化，内置与外部插件统一机制

## 7. 不做的

- ❌ 不改引擎的业务无关性——插件化只增加"加载外部贡献物"的能力，引擎流水线不吸收业务知识
- ❌ 不引入第二语言/第二运行时——插件仍是 TS/JS + 声明式 JSON
- ❌ 不做插件市场 UI、不做服务端托管平台（S8 聚焦机制与 npm 分发）
- ❌ 不允许插件绕过写操作确认、凭证 0600 等安全约定——插件复用同一套安全模型

## 8. 关联文档

- [Sprint 7: npm Registry 发布](sprint-7-npm-registry-publish.md) —— 硬前置
- [Sprint 3: 三层架构落地](sprint-3-catalog-script-skill.md) —— 插件贡献物的模型基础
- [Sprint 4: AI 发现机制](sprint-4-ai-discovery.md) —— SKILL.md 注册机制的现有实现
- [ARCHITECTURE.md](../ARCHITECTURE.md) —— §4 三层模型、§11 安装分发、§12 配置化
- 经验依赖：
  - [npm v11 全局安装三坑](../../../.claude/projects/D--work-things-saicmotor-cli-all/memory/npm-v11-global-install-quirks.md)
  - [npm registry 发布策略](../../../.claude/projects/D--work-things-saicmotor-cli-all/memory/npm-registry-publish-strategy.md)
  - [飞书 CLI npx 检测](../../../.claude/projects/D--work-things-saicmotor-cli-all/memory/feishu-cli-npx-detection.md)
