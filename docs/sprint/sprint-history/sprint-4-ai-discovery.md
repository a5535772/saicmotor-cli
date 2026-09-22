# Sprint 4 — AI 发现机制

> **状态**: ✅ 完成 | **完成时间**: 2026-09-21

## 目标

让 Claude Code 认识 saicmotor-cli：安装后 AI 知道有这个 CLI、什么时候用、怎么用。

## 核心机制

AI 不是"自动发现"命令行工具的——需要通过 Claude Code 的 **skill 系统** 显式注册。

参考 feishu-cli 做法，完整链路：

```
npm install -g saicmotor-cli
        │
        ├── ① CLI 进 PATH
        │    package.json: { "bin": { "saicmotor": "dist/cli/index.js" } }
        │    npm 全局安装后，终端可以直接敲 saicmotor xxx
        │
        ├── ② Skill 注册到 Claude Code
        │    通过 npx skills add <repo-url> -g
        │    把仓库里的 skills/ 目录安装到 ~/.claude/skills/
        │    Claude Code 启动时自动扫描这个目录，发现所有 SKILL.md
        │
        └── ③ AI 加载并执行
             SKILL.md frontmatter 声明 requires.bins: ["saicmotor"]
             → Claude Code 检查系统里有没有 saicmotor 命令
             SKILL.md 内容教 AI：
             - 什么场景用（description 触发路由）
             - 怎么拼命令（参数格式、示例）
             - 注意事项（写操作要 --yes、先查余额再提交等）
```

## 待做事项

| 步骤 | 做什么 | 产出 |
|------|--------|------|
| 1 | 每个 `skills/<system>/SKILL.md` frontmatter 加 `metadata.requires.bins: ["saicmotor"]` | Claude Code 知道这 skill 依赖 saicmotor 命令 |
| 2 | 写入口 skill（聚合路由），如 `skills/saicmotor/SKILL.md`，列出所有子能力路由表 | AI 先读这个，知道有哪些系统可用 |
| 3 | 每个子 skill 写详细：命令格式、参数、编排规则、边缘情况 | AI 读完知道具体怎么执行 |
| 4 | 写共享 skill（认证/配置/排障），如 `skills/shared/SKILL.md` | AI 知道怎么登录、401 怎么处理 |
| 5 | `package.json` 加 `postinstall` 脚本，自动跑 `npx skills add` | 用户一键安装 |
| 6 | 发 npm 包 + 确定 skill 仓库 URL | 别人能安装使用 |

## 参考

feishu-cli 的完整实现在 `D:\work\things\2026.09.17.custom-cli\feishu-cli`：
- `package.json` — `"bin"` + `"postinstall"` + `"files"`
- `scripts/install-wizard.js` — 交互式安装向导（`lark-cli install`）
- `skills/*/SKILL.md` — 27 个子能力 skill
- `isolated-skills/lark-suite/SKILL.md` — 聚合路由入口
- `skill-template/master-skill-template.md` — skill 模板

## 相关文档

> - 设计文档: [2026-09-21-sprint-4-ai-discovery-design.md](../superpowers/specs/2026-09-21-sprint-4-ai-discovery-design.md)
> - 实施计划: [2026-09-21-sprint-4-ai-discovery.md](../superpowers/plans/2026-09-21-sprint-4-ai-discovery.md)