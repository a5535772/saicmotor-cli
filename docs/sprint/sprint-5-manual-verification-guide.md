# Sprint 5 — 手工端到端验证指导

> 面向**人类验证者**的逐步操作清单，覆盖 exchange SSO 和 password 回退两个完整链路。
>
> 预计耗时：10 分钟。

---

## 前置条件

| 条件 | 说明 |
|------|------|
| Java 17 | mock-gateway 和 mock-services 是 Spring Boot 项目 |
| Node.js ≥ 16 | CLI 运行环境 |
| 飞书账号 | 已在 open.feishu.cn 创建企业自建应用，App ID / Secret 在手 |
| 飞书应用已发布 | 重定向 URL 登记 `http://localhost:3000/callback`，版本已发布 |

如果还没申请飞书应用，先按 [飞书 OIDC 申请手册](../../howto/FEISHU-OIDC-SETUP.md) 操作。

---

## 第零步：确认测试用户

当前 gateway 用户表（`application.yml`）：

| username | password | user-id | 飞书 name |
|----------|----------|---------|-----------|
| zhangsan | 123456   | zhangsan | —        |
| 章立     | 123456   | zhangli  | 章立      |
| lisi     | 123456   | lisi     | —        |

> **关键**：你的飞书账号 `name` 必须在 gateway 用户表的 `username` 列中。如果你不是"章立"，在 gateway 的 `application.yml` 里加一条自己的记录（`user-id` 用 ASCII）。

mock-services 用户表（`application.yml`）：

| username | emp-name | annual-balance |
|----------|----------|:---:|
| zhangsan | 张三     | 5 |
| zhangli  | 章立     | 5 |
| lisi     | 李四     | 0 |

---

## 第一步：启动后端服务

### 终端 1 — mock-services（端口 8080）

```bash
cd saicmotor-cli-mock-services
JAVA_HOME="C:/Program Files/Java/jdk-17" ./mvnw spring-boot:run
```

预期日志末尾：`Started MockServicesApplication`

### 终端 2 — gateway（端口 8081）

```bash
cd saicmotor-cli-mock-gateway
JAVA_HOME="C:/Program Files/Java/jdk-17" \
  FEISHU_APP_ID=cli_你的AppID \
  FEISHU_APP_SECRET=你的Secret \
  ./mvnw spring-boot:run
```

预期日志末尾：`Started GatewayApplication`

---

## 第二步：构建 CLI

```bash
cd saicmotor-cli
npm run build
```

> 每次改源码后需要重新构建。如果只做验证不改代码，构建一次即可。

---

## 第三步：验证清单

以下每条**逐一执行**。遇到不通过的记下来。

### ✅ 1. exchange SSO 登录

```bash
node dist/src/cli/index.js auth login
```

| 预期 | 实际 |
|------|------|
| 浏览器自动打开飞书授权页 |  |
| 在飞书页面登录 / 一键授权 |  |
| 页面显示"登录成功，可以关闭本页。" |  |
| 终端打印 `已登录，token 已缓存` |  |

**通过？** ⬜

---

### ✅ 2. 登录状态查询

```bash
node dist/src/cli/index.js auth status
```

| 预期 | 实际 |
|------|------|
| 输出 `已登录` |  |

**通过？** ⬜

---

### ✅ 3. SSO token 执行考勤查询

```bash
node dist/src/cli/index.js attendance records query
```

| 预期 | 实际 |
|------|------|
| 返回 JSON，`data.work_days` 有值 |  |

**通过？** ⬜

---

### ✅ 4. SSO token 执行请假余额查询

```bash
node dist/src/cli/index.js leave balance query
```

| 预期 | 实际 |
|------|------|
| 返回 JSON，`data.annual_balance` 有值 |  |

**通过？** ⬜

---

### ✅ 5. 登出

```bash
node dist/src/cli/index.js auth logout
```

| 预期 | 实际 |
|------|------|
| 输出 `已登出` |  |

**通过？** ⬜

---

### ✅ 6. 登出后状态确认

```bash
node dist/src/cli/index.js auth status
```

| 预期 | 实际 |
|------|------|
| 输出 `未登录` |  |

**通过？** ⬜

---

### ✅ 7. 登出后业务请求被拒

```bash
node dist/src/cli/index.js leave balance query
```

| 预期 | 实际 |
|------|------|
| 返回错误（401 或 auth required） |  |

**通过？** ⬜

---

### ✅ 8. password 模式切回（环境变量方式）

```bash
SAICMOTOR_AUTH_TYPE=password node dist/src/cli/index.js auth login --username zhangsan --password 123456
```

| 预期 | 实际 |
|------|------|
| 输出 `已登录，token 已缓存` |  |

**通过？** ⬜

---

### ✅ 9. password 模式执行业务命令

```bash
SAICMOTOR_AUTH_TYPE=password node dist/src/cli/index.js leave balance query
```

| 预期 | 实际 |
|------|------|
| 返回 `{ "ok": true, "data": { "annual_balance": 5, ... } }` |  |

**通过？** ⬜

---

### ✅ 10. password 模式登出

```bash
SAICMOTOR_AUTH_TYPE=password node dist/src/cli/index.js auth logout
```

| 预期 | 实际 |
|------|------|
| 输出 `已登出` |  |

**通过？** ⬜

---

### ✅ 11. 用户 config.json 切回 password

```bash
mkdir -p ~/.saicmotor
echo '{"auth":{"type":"password"}}' > ~/.saicmotor/config.json
node dist/src/cli/index.js auth login --username zhangsan --password 123456
node dist/src/cli/index.js auth status
```

| 预期 | 实际 |
|------|------|
| 登录成功 → 状态显示 `已登录` |  |

清理：`rm ~/.saicmotor/config.json` 或删掉 `auth.type` 字段即可恢复默认 exchange。

**通过？** ⬜

---

### ✅ 12. SAICMOTOR_AUTH_TYPE 环境变量最高优先级验证

```bash
# 1) 先确保 config.json 里是 password（上一步已写入）
# 2) 通过环境变量强制走 exchange
SAICMOTOR_AUTH_TYPE=exchange node dist/src/cli/index.js auth login
```

| 预期 | 实际 |
|------|------|
| 浏览器打开飞书授权页（环境变量覆盖 config.json） |  |

**通过？** ⬜

---

## 第四步：收尾清理

```bash
# 登出
node dist/src/cli/index.js auth logout

# 清理 config（恢复默认）
rm ~/.saicmotor/config.json 2>/dev/null || true

# 停止两个 Java 服务（Ctrl+C）
```

---

## 验证记录

| 日期 | 验证人 | 结果 | 备注 |
|------|--------|------|------|
| 2026-09-22 | Claude（AI 自动） | 7/7 ✅ | 初版 POC 验证 |
|           | （你的名字） | /12 |  |

---

## 常见故障排查

| 现象 | 排查点 |
|------|--------|
| `auth login` 不弹浏览器 | 检查是否在无桌面环境的服务器上——password 模式就是为此准备的 |
| 浏览器打开飞书提示"应用不可用" | 飞书后台 → 应用版本管理 → 确认已发布 + 当前用户在可用范围 |
| 授权后页面显示错误 | 看 gateway 终端日志：`FEISHU_APP_ID`/`FEISHU_APP_SECRET` 是否正确 |
| exchange 报"未找到对应员工" | 你的飞书 name 不在 gateway 用户表里——在 `application.yml` 加一条 |
| `X-User-Id` 头乱码 | gateway 用户表里 `user-id` 用了中文——改成 ASCII |
| password 模式登录失败 | 确认用户名密码在 gateway `application.yml` 的 users 列表里 |