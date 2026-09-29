# 飞书 SSO（网页授权登录）对接申请手册

> 面向 Sprint 5 POC：以**企业自建应用**的网页授权登录作为 OIDC IdP。
> 全程约 30 分钟。前提：你有一个飞书账号（个人版也可，企业版更佳）。

## 0. 你会拿到什么

| 值 | 用途 | 放在哪 |
|---|---|---|
| App ID | 应用标识 | 网关配置 |
| App Secret | 应用密钥 | **只放网关环境变量，绝不进 CLI / git** |
| 重定向 URL | 飞书登录后跳回 CLI 的本地地址 | 飞书后台 + 网关白名单 |

CLI 端不需要任何飞书凭证。

## 1. 创建企业自建应用

1. 打开飞书开放平台：<https://open.feishu.cn>，右上角登录。
2. 进入 **开发者后台 → 企业自建应用 → 创建企业自建应用**。
   - 名称：如 `saicmotor-cli-poc`；描述随意；图标可跳过。
3. 创建后进入应用详情页，在 **凭证与基础信息** 页拿到：
   - **App ID**（形如 `cli_a5xxxxxx`）
   - **App Secret**
   - 先记到本地临时处，Secret 只在网关注入。

## 2. 开启网页授权登录能力

1. 左侧 **安全设置**：
   - **重定向 URL** 新增：`http://localhost:3000/callback`
     - POC 阶段 CLI 端口是动态的。若后台只支持精确 URL 不支持端口段，先用固定端口 3000，并把 CLI 配置 `auth.loopbackPort` 改为 `3000`。
     - 飞书 http 协议的 loopback 地址允许 http（无需 https）。
2. 左侧 **权限管理**，开通以下权限并按需发布版本：
   - `contact:user.base:readonly`（获取用户基本信息，用于映射工号）
   - 网页授权登录相关默认权限（`authen` 能力默认随授权流程开放）
3. 左侧 **版本管理与发布 → 创建版本 → 发布**。
   - 企业内自建应用通常管理员即你本人，可直接通过；若提示需管理员审批，找飞书管理员通过。

## 3. （可选）配置可用范围

**应用发布 → 版本管理与发布 → 可用范围**：POC 可设为"仅本人"，避免影响他人。

## 4. 把凭证给网关（不要给 CLI）

在运行 mock-gateway 的环境设置：

```bash
export FEISHU_APP_ID=cli_a5xxxxxx
export FEISHU_APP_SECRET=xxxxxxxxxxxxxx
```

或 Windows 永久设置：

```powershell
setx FEISHU_APP_ID "cli_a5xxxxxx"
setx FEISHU_APP_SECRET "xxxxxxxxxxxxxx"
```

网关 `application.yml` 已通过 `${FEISHU_APP_ID}` / `${FEISHU_APP_SECRET}` 读取，无需改代码。

## 5. 验证

1. 启动 mock-gateway。
2. 终端运行：

   ```bash
   saicmotor auth login
   ```

3. 预期：浏览器自动打开飞书授权页 → 登录/同意 → 页面显示"登录成功，可关闭"→ 终端提示成功。
4. 再跑一个业务命令（如 `saicmotor leave balance query`）确认 token 可用。

## 6. 常见问题

| 现象 | 排查 |
|---|---|
| 回调报 `redirect_uri_mismatch` | 飞书后台重定向 URL 与实际 `http://localhost:<port>/callback` 不一致；动态端口场景改用固定端口 3000 |
| 授权页提示应用不可用 | 版本未发布/审批未通过/当前用户不在可用范围 |
| exchange 报"未找到对应员工" | 飞书 `name` 在网关用户表里找不到对应 `username`。在网关 `application.yml` 的 users 列表加一条：`{ username: 飞书name, password: "123456", user-id: ascii名, email: ... }` |
| 浏览器没自动打开 | 手动复制终端打印的 authUrl；远程/无桌面环境属于后续手动兜底范围（本期未做） |

## 7. POC 结束后清理

- 飞书开发者后台可**停用/删除**该自建应用；
- 删除本机环境变量中的 Secret；
- `~/.saicmotor/` 下的 token 可保留或 `saicmotor auth logout` 清除。

> 参考：官方文档「网页授权登录」
> <https://open.feishu.cn/document/common-capabilities/sso/web-application-sso/web-app-overview>
