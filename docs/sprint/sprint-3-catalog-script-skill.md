# Sprint 3 — 三层架构落地：skill / catalog / script

> **状态**: ✅ 完成 | **完成时间**: 2026-09-21

## 目标

将三层架构模型（skill / catalog / script）文档化并实现路径落地。

## 三层模型回顾

```
             ┌─────────────────┐
             │    SKILL.md      │  ← 编排层（AI 方向盘）
             │ 告诉 AI：先做什么 │
             │ 后做什么、什么条件 │
             │ 下做什么          │
             └────────┬─────────┘
                      │ 调用
          ┌───────────┴───────────┐
          │                       │
   ┌──────┴──────┐        ┌──────┴──────┐
   │  catalog/   │        │  scripts/   │
   │  xxx.json   │        │  xxx.ts     │
   │ 纯声明式 API │        │ 有逻辑的脚本  │
   └─────────────┘        └─────────────┘
        ↑                       ↑
        │                       │
   HTTP 直接回放          Node 执行复杂逻辑
   （零代码）             （if/else、跨系统、数据加工）
```

## 各层职责

| 层 | 是什么 | 包含什么 | 不含什么 |
|---|---|---|---|
| **SKILL.md**（编排层） | AI 的方向盘 | 意图→命令路由、多步编排规则（"先查余额再提交"）、写操作确认要求、认证提示 | 不关心具体怎么执行（HTTP 还是脚本） |
| **catalog/xxx.json**（执行层-声明式） | 纯 API 声明 | path、method、参数名/类型/是否必填、请求体结构、返回值结构 | 不写任何逻辑（无 if/else、循环、数据转换） |
| **scripts/xxx.ts**（执行层-过程式） | catalog 的替代执行引擎 | 复杂客户端逻辑：跨 API 调用、A 返回值加工后传 B、条件判断、数据聚合 | 不是另一个"目录"，是同一条 method 的另一种执行方式 |

## catalog 和 script 的关系（关键）

catalog 和 script **不是平级目录**，是**同一条 method 的两种执行引擎**：

- **默认**：CLI 读 catalog → HTTP 直接回放（零代码）
- **覆盖**：某个 method 有对应 script 文件 → CLI 走脚本而不是 HTTP
- catalog **永远声明接口**（不改），script **覆盖实现**（按需添加）

## 加复杂逻辑的标准路径

1. catalog 里声明 API 接口 ← 不改，永远做
2. 给需要复杂逻辑的 method 写脚本 ← 只在确实需要时
3. skill 里写上条件编排 ← 让 AI 知道什么时候走什么分支

简单 method 永远零代码，只有真正需要 if/else、跨系统、数据加工的场景才写脚本。

## 已完成项

已完成：scripts 调度机制 (`src/engine/script.ts`) + 验证脚本 `attendance/corrections/submit.ts`（考勤补签提交） + `leave/applications/submit.ts`（请假申请） + 单测覆盖（调度 + 回退）。

## 相关文档

- 设计：[2026-09-20-saicmotor-cli-gateway-design.md](../superpowers/specs/2026-09-20-saicmotor-cli-gateway-design.md)
- 计划：[2026-09-20-saicmotor-cli-gateway.md](../superpowers/plans/2026-09-20-saicmotor-cli-gateway.md)
- CLI 架构：[ARCHITECTURE.md](../../saicmotor-cli/doc/ARCHITECTURE.md)