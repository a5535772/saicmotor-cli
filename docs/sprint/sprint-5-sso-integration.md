# Sprint 5 — 真实 SSO 打通

> **状态**: ⬜ 待排期（优先级最低） | **预计时间**: 待定

## 目标

找一个容易对接的 SSO 系统，打通真实认证链路，验证 CLI 的 auth 模型在真实生产环境下的可行性。

## 背景

当前 CLI 的 auth 模型已经设计为可插拔架构，参见 [ARCHITECTURE.md](../ARCHITECTURE.md) §7：

| type | 场景 | 说明 |
|---|---|---|
| `password` | 单系统直登 | ✅ 已实现（当前 POC） |
| `redirect` | CAS 式 | SSO → 302 → ticket → 换 token |
| `exchange` | OIDC 式 | code → SSO token → 系统 token |
| `prefetch` | 先取页 | GET 某页拿 token 再写回 |

关键设计原则：**换认证方式只改 `auth` 段，`requests`/`commands` 完全不动**。

## 选型方向

> 待后续调研，找最容易对接的 SSO 系统。

候选方向：
- 公司内部有现成 CAS/OIDC 的话优先
- 或者找一个公开的 SSO 服务做 POC 验证

## 待办项

> 等待后续规划，目前尚未分解为具体任务。

## 相关文档

- 设计：[2026-09-20-saicmotor-cli-gateway-design.md](../superpowers/specs/2026-09-20-saicmotor-cli-gateway-design.md)
- 计划：[2026-09-20-saicmotor-cli-gateway.md](../superpowers/plans/2026-09-20-saicmotor-cli-gateway.md)
- CLI 架构 §7（认证模型）：[ARCHITECTURE.md](../ARCHITECTURE.md)