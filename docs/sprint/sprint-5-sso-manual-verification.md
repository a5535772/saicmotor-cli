# Sprint 5 — 飞书 SSO 人工端到端验证

> 参照 Sprint 4 验证格式。执行前请先完成 [飞书对接申请手册](../../howto/FEISHU-OIDC-SETUP.md)。

## 前置条件

1. **飞书应用**：已在飞书开放平台创建企业自建应用，拿到 App ID / App Secret，重定向 URL 登记 `http://localhost:3000/callback`，版本已发布。
2. **环境变量**：设置 `FEISHU_APP_ID` 和 `FEISHU_APP_SECRET`。
3. **邮箱映射**：你的飞书邮箱必须在网关 `application.yml` 某个用户的 email 字段中。
4. **CLI 配置**：`~/.saicmotor/config.json` 中 `auth.type` 设置为 `"exchange"`（或直接改 `src/config.ts` 的 `DEFAULT_CONFIG.auth.type` 为 `"exchange"` 后重新 `npm run build`）。

## 启动服务

### 终端 1 — 业务后端（端口 8080）

```bash
cd saicmotor-cli-mock-services
JAVA_HOME="C:/Program Files/Java/jdk-17" ./mvnw spring-boot:run
```

### 终端 2 — 网关（端口 8081）

```bash
cd saicmotor-cli-mock-gateway
JAVA_HOME="C:/Program Files/Java/jdk-17" FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx ./mvnw spring-boot:run
```

预期：网关日志显示 `Started GatewayApplication`。

### 终端 3 — CLI

```bash
cd saicmotor-cli
npm run build
```

---

## 验证清单

### 1. auth login（exchange 模式）

| | |
|---|---|
| **命令** | `node dist/src/cli/index.js auth login` |
| **预期** | 浏览器自动打开飞书授权页 → 登录/扫码/已登录则一键授权 → 页面显示"登录成功，可以关闭本页。" → 终端打印 `已登录，token 已缓存（…）` |
| **实际** | |
| **通过** | ⬜ |

### 2. auth status（已登录状态）

| | |
|---|---|
| **命令** | `node dist/src/cli/index.js auth status` |
| **预期** | stdout 输出 `已登录` |
| **实际** | |
| **通过** | ⬜ |

### 3. leave balance query（SSO token 执行业务命令）

| | |
|---|---|
| **命令** | `node dist/src/cli/index.js leave balance query` |
| **预期** | 返回 `{ code: 0, data: { annual_balance: ... } }` 格式 JSON |
| **实际** | |
| **通过** | ⬜ |

### 4. attendance records（另一业务命令确认 token 有效）

| | |
|---|---|
| **命令** | `node dist/src/cli/index.js attendance records --yes` |
| **预期** | 返回考勤记录 JSON |
| **实际** | |
| **通过** | ⬜ |

### 5. auth logout

| | |
|---|---|
| **命令** | `node dist/src/cli/index.js auth logout` |
| **预期** | stdout 输出 `已登出` |
| **实际** | |
| **通过** | ⬜ |

### 6. auth status（登出后）

| | |
|---|---|
| **命令** | `node dist/src/cli/index.js auth status` |
| **预期** | stdout 输出 `未登录` |
| **实际** | |
| **通过** | ⬜ |

### 7. state 过期 / 回退 password 模式切回

| | |
|---|---|
| **步骤** | 把 `~/.saicmotor/config.json` 改回 `auth.type: "password"`，执行 `node dist/src/cli/index.js auth login --username zhangsan --password 123456` |
| **预期** | ✅ 仍能正常登录（password 逻辑不受影响） |
| **实际** | |
| **通过** | ⬜ |

---

## 验证人 & 日期

- **验证人**：
- **日期**：
- **结论**：⬜ 通过 / ⬜ 部分通过 / ⬜ 未通过