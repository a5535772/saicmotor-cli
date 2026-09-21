# saicmotor-cli 认证模型：SSO 身份 + 多业务系统各自 token

> **一句话**：生产环境是 SSO 统一认证、各业务系统发各自 token——SSO 只回答「你是谁」，各系统自行发「门票」。所以 CLI 的认证必须分两层，用「浏览器式 cookie jar」做原语，auth 可插拔。

> 配套阅读：本文件讲「单用户 × 多系统」的身份轴；`feishu-cli-平台agent接入架构与身份传递.md` 讲「多用户 × 单 Agent（平台）」的身份轴。两者都是「两层身份，别混」，但轴不同、互补。

---

## 1. 场景与问题

- **POC（当前）**：单点系统，账号 + 密码 → 拿到 cookie。简单直接。
- **真实（后续）**：员工先过 SSO 登录（统一身份认证），SSO 认证通过后，**每个业务系统 A/B/C 各自签发自己的 token**。
- **问题**：多系统时，凭证怎么组织？答：不能把「登录」看成一件全局的事。

## 2. 两层模型

| 层 | 是什么 | 生命周期 | 存哪 |
|---|---|---|---|
| **身份层（SSO）** | 「我是谁」，全局一份，多系统共享 | 登录一次，长期有效 | `.saicmotor/identity`（全局） |
| **会话层（各业务系统）** | A/B/C 各自的 token | 各自过期、各自续期 | cookie jar 按 host 隔离 |

SSO 只做认证（证明身份），各系统信任 SSO 的结论后**自己发 token**——这正是「sso 只做了认证，业务系统的 token 是各自的」的技术含义。

## 3. 核心原语：cookie jar + 重定向跟随

浏览器怎么做，CLI 就怎么模拟（纯 HTTP 即可，无需无头浏览器）：

1. SSO 登录一次 → `SSO_SESSION` 落 jar（domain = `sso.corp.com`）；
2. 访问系统 A → A 把请求 302 到 SSO → **jar 自动带 SSO cookie**，SSO 认出是你 → 302 跳回 A 带 `ticket` → A 验票后往 jar 写 `LEAVE_SESSION`（domain = `leave.corp.com`）；
3. 访问系统 B → 又一套跳转，但 jar 里已有 SSO cookie，**不必重输密码**，B 直接发 `EXPENSE_SESSION`。

## 4. spec 表达：auth 拆两段

```jsonc
// ① 全局身份：每台机器一份，所有系统共享
"identity": {
  "type": "sso",
  "loginRequest": "sso_login",
  "sessionKey": "SSO_SESSION_ID",
  "prompt": { "username": "工号", "password": "密码" }
}

// ② 每个系统各自声明「怎么借 SSO 身份换自己的 token」
"auth": {
  "type": "redirect",              // CAS 式：请求入口→302→带 ticket 跳回
  "entry": "/", "follow": true,
  "sessionKey": "LEAVE_SESSION", "sessionFrom": "cookie"
}
// 其它可插拔 type：
//   "exchange"  — OIDC 式：拿 code → 换 SSO token → 换系统 token
//   "prefetch"  — 先 GET 某页拿 token 再写回请求
//   "password"  — 单系统直登（POC 用）
```

## 5. 多系统协作 / token 独立过期

- 一次 SSO 登录，各系统各拿各 token，互不干扰；
- 系统 A 收到 401 → 引擎**单独重跑 A 的 `auth`**，不动 B/C；
- SSO 身份本身过期 → 才需要重新输密码。

## 6. POC → 真实场景的迁移

POC 的 `type: password` 不是特例，而是「身份 = 会话、单系统」时两层塌缩成一层的**退化形态**。真实 SSO 多系统场景只把 auth 段从 `password` 扩成「`identity`(SSO) + `system auth`(redirect/exchange)」，**requests 和 commands 层完全不动**。