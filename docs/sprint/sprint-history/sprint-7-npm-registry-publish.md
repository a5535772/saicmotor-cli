# Sprint 7: npm Registry 发布 + Scoped 改名 + npx 主推

> 状态：⚪ 待排期 | 创建于 2026-09-21，修订于 2026-09-23
>
> 本 sprint 是 scoped 分发 + 插件生态统一架构（见 [端到端架构设计](2026-09-23-scoped-distribution-plugin-architecture.md)）的**分发地基**。
> 内部结构不动——核心仍是单体包，本次只解决"怎么发、怎么装、叫什么名"。
> 详细技术决议以架构文档 §4「S7」为准，本文件只陈述需求与验收。

## 背景

### 现状问题

当前 `saicmotor-cli` 通过 `github:a5535772/saicmotor-cli` 安装，存在三个已知问题：

1. **npm v11 allow-scripts 门槛**：npm v11 默认阻止 lifecycle 钩子（prepare、postinstall），用户需额外配置或加 `--foreground-scripts` 才能执行。
2. **npm v11 `github:` 文件提取缺陷**：即使让钩子执行，npm v11 对 `github:` specifier 的 `files` 目录通配处理有问题，`scripts/postinstall.js` 在安装目录中找不到。
3. **公司环境约束**：内部用户大多不会安装 git，无法通过 `github:` 或 git 协议安装；只能走 `npm install`。

### 改名的动机（并入本 sprint）

- 现状包名为无前缀的 `saicmotor-cli`（v0.4.0，bin 名 `saicmotor`）。
- scoped 改名（`@saicmotor/cli`）确立的是整个 `@saicmotor/*` 命名空间，未来插件（`@saicmotor/plugin-*`）与 SDK（`@saicmotor/sdk`）都在此 scope 下。外部用户为零时改名成本最低，越晚改，文档/脚本/白名单里的旧名引用越多。

## 目标

1. `@saicmotor/cli` 可通过内部 npm registry 安装（POC 阶段：本地 Docker 运行 Verdaccio）。
2. 安装过程不依赖 git、GitHub 或任何外网资源。
3. **主推 `npx @saicmotor/cli@latest`**（即用即走、版本语义清晰、无全局陈旧），`npm i -g @saicmotor/cli` 继续支持、两者共存。
4. 即使 postinstall 未执行（allow-scripts 被阻止），CLI 也能给出清晰指引或自动修复。
5. 仓库内无残留旧包名引用（历史文档/changelog 除外）。

## 关键决策（详见架构文档 §4「S7」）

- **registry 端点可替换**：地址只出现在 `.npmrc`（`@saicmotor:registry=<端点>`），代码/脚本不硬编码，POC 的 Verdaccio 验证完换正式内网服务器零代码改动。
- **bin 名不变**：改为 scoped 包后，用户命令仍是 `saicmotor`，仅安装来源变化。
- **dist-tag 规范**：正式版走 `latest`，内测用 `--tag beta` 发布、`npx @saicmotor/cli@beta`。

## 任务拆解

### 任务 1: 搭建/对接内部 npm registry（POC）

- [ ] 本地 Docker 运行 Verdaccio
- [ ] 配置 `.npmrc` 指向内部 registry（scoped：`@saicmotor:registry=<端点>`）
- [ ] 确认 publish / install 权限与地址

### 任务 2: Scoped 改名

- [ ] `package.json` 改 `name: "@saicmotor/cli"`；评估是否借改名升版本号（当前 0.4.0 → 0.5.0 或 1.0.0）
- [ ] 全仓搜索旧包名字符串引用并同步：文档（howto/INSTALL、人工验证手册、sprint 文档）、脚本、postinstall 中的自身检测、测试断言
- [ ] 旧包名的处置策略二选一并记录（内部 registry 旧名保留并在 README 指向新名 / 弃置）
- [ ] npm v11 allow-scripts 白名单若按包名配置，同步改为 scoped 名

### 任务 3: `files` 字段显式化

- [ ] 将目录通配改为显式列出（精确 glob 或逐文件）
- [ ] `npm pack --dry-run` 验证打包内容
- [ ] 确保 `src/` 不被打包（源码不进发布包）

### 任务 4: `run.js` 优雅降级

- [ ] dist/ 缺失时先尝试自动 `npm run build`（开发环境有 `src/` + `tsc` 时）
- [ ] 非开发环境给清晰修复指引 + 内部 registry 安装命令

### 任务 5: `postinstall` npx 检测

- [ ] postinstall 开头加 `npm_command === "exec"` 检测，npx 场景跳过重量操作
- [ ] 验证 `npm i -g` 触发 postinstall、`npx @saicmotor/cli` 跳过

### 任务 6: 去掉 `prepare` 钩子

- [ ] 评估是否保留开发期用法；发布前由 `prepublishOnly` 保证 dist/ 已构建

### 任务 7: HTTP 安装指引（todo#3 之"装"）

- [ ] 承载地址与 registry 形态一致（内部可访问），内容为一条 npm 命令 + scoped registry 配置 + 安装后验证，AI WebFetch 即可执行

### 任务 8: 发布到内部 registry + 端到端验证

- [ ] `npm publish --registry=<内部地址>`；`npm dist-tag ls @saicmotor/cli` 确认 `latest` 指向新版本
- [ ] 干净环境验证 `npx @saicmotor/cli@latest --version` 与 `npm i -g @saicmotor/cli` 两条路径均可用
- [ ] 验证 `saicmotor --version`、`saicmotor install` 正常

## 验收标准

1. 未配置任何全局安装的机器上，仅凭 scoped registry 配置即可 `npx @saicmotor/cli@latest` 完成登录与一次业务调用。
2. `npm i -g @saicmotor/cli` 与 `npx @saicmotor/cli@latest` 两条路径在干净环境均通过端到端验证。
3. 仓库内无残留旧包名引用（历史文档/changelog 除外）。

## 关联文档

- [端到端架构设计（S7/S8/S9）](2026-09-23-scoped-distribution-plugin-architecture.md)
- [Sprint 8: Skill 插件化生态](sprint-8-skill-plugin-ecosystem.md)
- [Sprint 9: 默认能力收敛](sprint-9-default-capability-convergence.md)
- [TODO 清单](todo.md)
- 经验依赖（memory）：npm-registry-publish-strategy、npm-v11-global-install-quirks、feishu-cli-npx-detection、feishu-cli-runjs-graceful-degradation、feishu-cli-explicit-files

## 不做的

- ❌ 不照搬飞书 CLI 的"npm 壳 + 外挂二进制"模式——saicmotor-cli 纯 TS 项目不需要
- ❌ 不引入 Go/Rust 工具链——保持 TypeScript 单一技术栈
- ❌ 不依赖 GitHub Releases 作为二进制托管——用户可能无法访问外网
- ❌ 不动内部结构（插件化、loader 等属于 S8）——本 sprint 只改分发，不堵死插件的路