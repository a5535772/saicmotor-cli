# saicmotor-cli Framework V2 — 文档导航

> **面向人群**：平台开发者、插件开发者、运维人员 —— 无论你来自哪个角色，这里都有适合你的入口。

## 这个文档体系解决什么问题？

V1 文档（`howto/framework/01-07`）覆盖了系统的方方面面，但假设读者已经理解 AI Agent、Skill 注册等概念。V2 从零开始，用生活类比、流程图、FAQ 来**降低认知门槛**。

## 阅读路线

### 🚀 路线 A：我想 10 分钟了解全貌
> 适合：新加入团队的平台开发者、技术 Leader 评估方案

1. [00 一页全貌](./00-quick-overview.md) — 电梯演讲 + 核心概念图
2. [01 核心概念](./01-concepts.md) — 用生活类比理解 Skill、Catalog、引擎

### 🏗️ 路线 B：我要深入了解架构和原理
> 适合：需要二次开发核心引擎、做架构评审

1. [02 系统架构](./02-architecture.md) — 四层架构 + 包拓扑 + 数据流
2. [03 安装全流程](./03-installation-flow.md) — 从 `npm install` 到第一个命令的每一步
3. [04 插件系统](./04-plugin-system.md) — 插件加载、生命周期、状态管理
4. [05 Skills 与 Suite](./05-skills-and-suite.md) — AI Agent 如何发现你的插件
5. [06 执行引擎](./06-engine-pipeline.md) — 命令注册 → 参数校验 → 执行 → 输出

### 🔧 路线 C：我要开发业务插件
> 适合：插件开发者，在独立工程中写业务逻辑

1. [01 核心概念](./01-concepts.md) — 理解 Skill、Catalog、Manifest
2. [10 插件开发指南](./10-plugin-development.md) — 从零到发布的全流程
3. [04 插件系统](./04-plugin-system.md) — 插件如何被 CLI 加载和执行
4. [05 Skills 与 Suite](./05-skills-and-suite.md) — 让你的插件被 AI 发现

### ⚙️ 路线 D：我要部署和运维
> 适合：负责部署、配置、排查问题的运维人员

1. [03 安装全流程](./03-installation-flow.md) — 安装步骤与验证
2. [07 认证体系](./07-auth-flow.md) — exchange/password 登录
3. [08 配置体系](./08-config-system.md) — 改一个文件就能上线
4. [09 构建与发布](./09-build-and-publish.md) — npm 发布流程
5. [A2 排障速查](./A2-troubleshooting.md) — 常见问题快速定位

## 附录

| 文件 | 内容 |
|------|------|
| [A1 FAQ](./A1-faq.md) | 中级工程师角色提出的全部疑问 + 扩展问答 |
| [A2 排障速查](./A2-troubleshooting.md) | 常见错误 + 引擎管道各阶段的错误信号 |
| [A3 术语表](./A3-glossary.md) | 统一术语定义，避免一个概念多个说法 |

## V1 vs V2 对照表

| V1 文档 | V2 对应章节 | 增强点 |
|---------|-------------|--------|
| 01-architecture.md | 00 + 02 | 新增电梯演讲、核心概念图、包拓扑详解 |
| 02-plugin-system.md | 04 | 新增 manifest 各字段"为什么"、常见错误 |
| 03-skills-registration.md | 05 | 新增 AI Agent 发现机制的通俗解释、连锁反应图 |
| 04-auth.md | 07 | 新增 loopback 安全性分析、401 重试决策树 |
| 05-engine.md | 06 | 新增时间轴标注、异常路径、脚本覆盖决策树 |
| 06-build-publish.md | 09 | 新增 preuninstall 守卫流程图 |
| 07-config.md | 08 | 新增配置瀑布图、使用位置追踪 |
| 无 | 03 | **全新**：安装全流程端到端串讲 |
| 无 | 10 | **全新**：插件开发完整指南 |
| 无 | A1-A3 | **全新**：FAQ + 排障 + 术语表 |

## 约定

- **💡 提示**：补充说明、最佳实践
- **⚠️ 注意**：容易出错的地方、已知限制
- **🔗 参见**：交叉引用到其他章节
- **❓ 自学检查**：每章末尾 3 个自测问题