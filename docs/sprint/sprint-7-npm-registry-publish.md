# Sprint 7: npm Registry 发布 + 安装健壮性加固

> 状态：⬜ 待排期 | 创建于 2026-09-21

## 背景

### 现状问题

当前 saicmotor-cli 通过 `github:a5535772/saicmotor-cli` 安装，存在两个已知问题：

1. **npm v11 allow-scripts 门槛**：npm v11 默认阻止 lifecycle 钩子（prepare、postinstall），用户需要额外配置或加 `--foreground-scripts` 才能执行。

2. **npm v11 `github:` 文件提取缺陷**：即使加了 `--foreground-scripts` 让钩子执行，npm v11 对 `github:` specifier 的 `files` 目录通配处理有问题——`scripts/postinstall.js` 在安装目录中找不到。

3. **公司环境约束**：内部用户大多不会安装 git，无法通过 `github:` 或 git 协议安装。公司 GitLab 仓库功能不全，用户只能走 `npm install`。

### 飞书 CLI 对比分析

已完整分析 `@larksuite/cli` 的架构（见关联文档），结论：

- **借鉴设计理念**，不照搬架构
- 飞书是"npm 壳 + 外挂 Go 二进制下载"，saicmotor-cli 不需要——纯 TS 项目无需 Go 二进制
- 飞书的架构为其跨平台原生二进制分发服务，不是为绕 npm 问题设计的

## 目标

1. saicmotor-cli 可以通过公司内部 npm registry 安装（`npm install -g saicmotor-cli`）
2. 安装过程不依赖 git、GitHub 或任何外网资源
3. 即使 postinstall 未执行（allow-scripts 被阻止），CLI 也能给出清晰指引或自动修复

## 任务拆解

### 任务 1: 确认/搭建公司内部 npm registry

- [ ] 确认公司是否已有 Verdaccio / Artifactory / 其他 npm 私服
- [ ] 如有，获取 publish 权限和地址
- [ ] 如无，评估搭建方案（Verdaccio 轻量）
- [ ] 配置 `.npmrc` 指向内部 registry

### 任务 2: `files` 字段显式化

当前：
```json
"files": ["dist/", "skills/", "catalog/", "scripts/"]
```

改为显式列出（精确 glob 或逐文件）：
```json
"files": [
  "dist/**/*.js",
  "dist/**/*.json",
  "skills/**/*.md",
  "catalog/**/*.json",
  "scripts/run.js",
  "scripts/postinstall.js",
  "saicmotor.config.json"
]
```

- [ ] 修改 `package.json` 的 `files` 字段
- [ ] `npm pack --dry-run` 验证打包内容
- [ ] 确保 `src/` 不被打包（源码不应进发布包）

### 任务 3: `run.js` 优雅降级

当前：
```javascript
if (!fs.existsSync(entry)) {
  console.error("入口缺失，请重装");
  process.exit(1);
}
```

改进方案（可选，取决于是否在发布包里带 `src/` 和 `tsc`）：
- [ ] dist/ 缺失时检测是否在开发环境（有 `src/` 和 `tsc`）
- [ ] 如在开发环境：自动 `npm run build` 后重试
- [ ] 如不在开发环境：给出清晰的修复指引 + registry 安装命令
- [ ] 错误信息包含公司内部 registry 地址

### 任务 4: postinstall npx 检测

```javascript
// 在 scripts/postinstall.js 开头加
const isNpxPostinstall = process.env.npm_command === "exec";
if (isNpxPostinstall) {
  console.log("npx 模式，跳过 skills 自动注册");
  process.exit(0);
}
```

- [ ] 在 `scripts/postinstall.js` 开头加 npx 检测
- [ ] 验证 `npm install -g` 正常触发 postinstall
- [ ] 验证 `npx saicmotor-cli` 跳过 postinstall 重量操作

### 任务 5: 去掉 prepare 钩子

当前 `prepare` 钩子在 `npm install` 时每次都跑，在内部 registry 场景下不需要——发布前由 `prepublishOnly` 保证 dist/ 已构建。

- [ ] 评估是否保留 `prepare`（开发时有用）
- [ ] 如去掉，确保 `prepublishOnly` 覆盖构建检查

### 任务 6: 发布到内部 registry

- [ ] `npm publish --registry=<内部地址>`
- [ ] 验证 `npm install -g saicmotor-cli --registry=<内部地址>` 成功
- [ ] 验证 postinstall 正常执行
- [ ] 验证 `saicmotor --version` 正常
- [ ] 验证 `saicmotor install` 正常注册 skills

### 任务 7: 安装验证文档

- [ ] 编写面向内部用户的安装指南
- [ ] 包含：registry 配置、安装命令、常见问题排障

## 关联文档

- [npm registry 发布策略（memory）](../../../.claude/projects/D--work-things-saicmotor-cli-all/memory/npm-registry-publish-strategy.md)
- [飞书 CLI run.js 优雅降级](../../../.claude/projects/D--work-things-saicmotor-cli-all/memory/feishu-cli-runjs-graceful-degradation.md)
- [飞书 CLI 显式 files 字段](../../../.claude/projects/D--work-things-saicmotor-cli-all/memory/feishu-cli-explicit-files.md)
- [飞书 CLI npx 检测](../../../.claude/projects/D--work-things-saicmotor-cli-all/memory/feishu-cli-npx-detection.md)
- [踩坑记录：prepare hook + postinstall 安装失败](../../docs/lessons-learned-the-hard-way/2026-09-21-prepare-hook-orphan-shim-install-failure.md)

## 不做的

- ❌ 不照搬飞书 CLI 的"npm 壳 + 外挂二进制"模式——saicmotor-cli 纯 TS 项目不需要
- ❌ 不引入 Go/Rust 工具链——保持 TypeScript 单一技术栈
- ❌ 不依赖 GitHub Releases 作为二进制托管——用户可能无法访问外网