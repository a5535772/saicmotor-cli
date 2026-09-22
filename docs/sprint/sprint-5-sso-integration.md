# Sprint 5 — 真实 SSO 打通

> **状态**: ✅ 开发完成，待人工端到端验证 | **时间**: 2026-09-22

## 目标

找一个容易对接的 SSO 系统，打通真实认证链路，验证 CLI 的 auth 模型在真实生产环境下的可行性。

## 选型结论

- **IdP**：飞书网页授权登录（标准 OAuth2/OIDC）。CLI 用 loopback 自动接收回调 code，网关持有飞书 app_id/secret 做 code→身份→token 交换。
- **架构分工**：CLI 驱动浏览器 + 本地接收 code；网关负责持有 IdP 凭证、换用户身份、签发自有 token。
- **POC 范围**：实现 `exchange`（OIDC 式）认证；`redirect`/`prefetch` 仅在接口层面预留，未实现。

## 架构

详见：
- 设计 spec：[2026-09-22-sso-feishu-poc-design.md](../superpowers/specs/2026-09-22-sso-feishu-poc-design.md)
- 实现计划：[2026-09-22-sso-feishu-poc.md](../superpowers/plans/2026-09-22-sso-feishu-poc.md)
- 飞书申请手册：[FEISHU-OIDC-SETUP.md](../../howto/FEISHU-OIDC-SETUP.md)

### 交付摘要

| # | 任务 | 状态 | 提交（CLI/网关） |
|---|---|---|---|
| 1 | AuthConfig 支持 exchange/loopback 配置 | ✅ | fbaab3c |
| 2 | 抽 AuthProvider 接口，password → PasswordProvider | ✅ | de1076a |
| 3 | loopback 回调服务（async 工厂） | ✅ | 504b883 |
| 4 | ExchangeProvider + 打开浏览器 | ✅ | f47374c |
| 5 | auth login 命令适配 | ✅ | b71a8ed |
| 6 | 网关 IdP 配置 + 用户 email | ✅ | c9976f6 |
| 7 | StateStore（短 TTL 单次消费） | ✅ | dad8a4e |
| 8 | IdpProvider 接口 + 飞书实现 | ✅ | a7c28da |
| 9 | /auth/exchange start + exchange 接口 | ✅ | 4176235 |
| — | StateStore @Autowired 修复 | ✅ | 99aebbc |
| 10 | 人工端到端验证 | ⬜ | 待执行 |

## 待办项

- [ ] 按 [飞书对接手册](../../howto/FEISHU-OIDC-SETUP.md) 申请飞书企业自建应用
- [ ] 按 [人工验证文档](./sprint-5-sso-manual-verification.md) 执行端到端验证
- [ ] 验证通过后更新 ARCHITECTURE.md §7 exchange 为 ✅ 已实现

## 相关文档

- 设计：[2026-09-22-sso-feishu-poc-design.md](../superpowers/specs/2026-09-22-sso-feishu-poc-design.md)
- 计划：[2026-09-22-sso-feishu-poc.md](../superpowers/plans/2026-09-22-sso-feishu-poc.md)
- 手册：[FEISHU-OIDC-SETUP.md](../../howto/FEISHU-OIDC-SETUP.md)
- 架构 §7：[ARCHITECTURE.md](../ARCHITECTURE.md)