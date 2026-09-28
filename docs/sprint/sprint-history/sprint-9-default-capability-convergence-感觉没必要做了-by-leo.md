# Sprint 9: 默认能力收敛 + 卸载自动化

> 状态：⚪ 待排期（新建） | 创建于 2026-09-23
>
> 本 sprint 是 scoped 分发 + 插件生态统一架构的**收敛期**：验证 S8 的插件机制可纯外部化后，
> 把具业务属性的能力全部移出框架核心，默认只保留"查询用户基本信息"这一项。
> 需求来源见 [端到端架构设计](2026-09-23-scoped-distribution-plugin-architecture.md) §4「S9」及 [TODO 事项 2/3](todo.md)。

## 1. 背景

S8 把 leave / attendance 在框架 monorepo 内改造成了插件，机制已被证明可用。但若它们长期和核心住在同一个 monorepo，会：

- 让 monorepo 重新长成"插件大杂烩"，退回单体耦合
- 让业务属性（请假/考勤的数据源、语义）持续污染框架维护者的心智
- 使"业务团队独立分仓、独立发版"这条路径始终缺一个真实演练样本

因此 S9 做两件事：**把业务能力彻底外迁**，并把核心的默认体验**收敛到"零业务"**；同时补齐 S8 遗留的**卸载闭环**（卸载设计依赖插件住所定型，S8 落定后 S9 才能做）。

## 2. 目标

1. 框架核心**零业务命令**：裸核心不含任何业务系统，只保留通用的载体、登录、引擎、工具链。
2. 唯一默认能力是**查询用户基本信息**，且它也是插件（`@saicmotor/plugin-user`），由首跑向导引导安装。
3. leave / attendance 迁出 monorepo 为**独立仓 / 独立包**，走纯外部分发路径，可装可卸。
4. **卸载自动化**：装/卸都零文档化，AI 可自主发现并执行，无残留。

## 3. 需求拆解

### 3.1 内置能力外迁

- [ ] leave / attendance 从 monorepo 迁出为独立仓（可交业务团队维护），registry 包名不变、用户无感
- [ ] 保留其在 monorepo 的回归测试能力：以外部分发包的形态接入 S1~S4 回归集

### 3.2 默认能力收敛

- [ ] `@saicmotor/plugin-user`：提供"查询用户基本信息"，数据源差异封装在插件内（网关端点 or SSO claims）
- [ ] 核心首跑向导：裸核心首跑引导安装 `@saicmotor/plugin-user`（默认勾选）
- [ ] 终态验收：裸核心零业务命令；装 user 插件即可查个人信息；leave / attendance 作为纯外部插件可装可卸

### 3.3 卸载自动化（TODO 事项 2）

- [ ] `saicmotor uninstall` 向导：列出将删除的 skills / `~/.saicmotor` / 残留 → 确认 → 执行（支持 `--yes`）
- [ ] 清理内容：业务 skills 条目 + uninstall skill 自身 + `~/.saicmotor`（尊重 `SAICMOTOR_HOME`）+ npm 全局残留
- [ ] 兜底：`npm uninstall -g` 的 preuninstall 静默失败不阻断卸载（可选，需实测 npm v11 行为）
- [ ] 卸载后验证指引：`saicmotor --version` 不可用、skills ls 无 saicmotor 条目

### 3.4 卸载零文档化（TODO 事项 3 之"卸"）

- [ ] 新增 uninstall skill：SKILL.md frontmatter 能被"卸载/删除/清理 saicmotor"意图命中，正文给出完整清理步骤
- [ ] 自卸载顺序：先清其他 skills 与数据，最后删 npm 包；文档说明每步失败的降级处理
- [ ] 安装侧的"HTTP 安装指引"已在 S7 落地；本 sprint 只负责卸载侧

## 4. 验收标准

1. 裸核心零业务命令；装 `@saicmotor/plugin-user` 即可查询个人信息；leave / attendance 纯外部化、可装可卸。
2. 隔离环境 `npm i -g` → 登录 →（先跑 `saicmotor uninstall` 或直接）`npm uninstall -g` 后，skills / 本地数据 / npm 全局三处全部干净。
3. 人全程不出现"文档""SKILL.md""howto"等字眼，仅凭 HTTP 地址（安装）和 skill 自主发现（卸载）完成闭环。
4. 外迁后 S1~S4 回归集全部通过。

## 5. 关联文档

- [端到端架构设计（S7/S8/S9）](2026-09-23-scoped-distribution-plugin-architecture.md)
- [Sprint 7: npm Registry 发布 + Scoped 改名](sprint-7-npm-registry-publish.md)
- [Sprint 8: Skill 插件化生态](sprint-8-skill-plugin-ecosystem.md)
- [TODO 清单](todo.md)

## 6. 不做的

- ❌ 不做插件市场 / 上架审批（仍只做"能发能装"，市场机制留后续 sprint）
- ❌ 不在 S9 引入新的业务能力——只收敛，不扩张