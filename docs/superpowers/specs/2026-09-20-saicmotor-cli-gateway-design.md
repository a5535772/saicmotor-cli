# saicmotor-cli 网关中心架构设计

- **日期**：2026-09-20
- **状态**：待评审
- **范围**：把 saicmotor-cli 从「每系统一份 baseUrl+auth 的单系统 POC」重构为「网关中心」架构；第一步用网关自己的登录（账号密码 → token → Bearer）验证全链路，SSO 延后。

---

## 1. 背景与目标

### 现状

`saicmotor-cli`（原 leo-cli）当前是一个 POC：每个业务系统自己声明 `baseUrl`、`auth`（登录请求 / 会话抽取方式）、`requests`、`responseContract`、`commands`，CLI 逐个 replay HTTP。skill 现在需要用户自己在 `~/.saicmotor/skills/` 里生成，认证也是每个系统各自一套账号密码。

### 真实场景

1. **所有业务接口都在一个网关上**，网关是唯一入口。
2. CLI 用户通过 **SSO 登录信息与网关打通**（第一步先做网关自己的登录来验证链路）。
3. leave 系统的接口**注册在网关上**。
4. 网关解析用户身份后，把 **`user_id` 通过 header 下传给下游系统**——用户在 CLI 里不需要、也不应该感知 `user_id`。

### 本次目标

- 把 saicmotor-cli 重构为**网关中心**：baseUrl + 认证全局一份，业务接口按「目录（catalog）」描述。
- 参照字节 `feishu-cli`（lark-cli）的成熟做法：**机器 API 目录 + 标准 SKILL.md** 两层，都打进包内、随包分发，员工安装即可用，不自己维护 skill。
- **实施顺序**：先把 mock 网关写出来 → 通过网关 mock leave 系统 API → CLI 对接打通全链路。SSO 暂时不做。

---

## 2. 整体架构（三层，网关为中心）

参照 lark-cli 的结构，saicmotor-cli 分**三个平级、互不耦合的层**：

| 层 | 是什么 | 谁读 | 对应飞书 |
|---|---|---|---|
| **catalog（机器 API 目录）** | 每个系统的接口定义：网关相对路径 / 方法 / 参数 / 响应 | CLI 引擎（生成命令、replay HTTP） | `internal/registry/catalog/services/*.json` |
| **skills（AI 编排指引）** | 标准 Claude Code skill：告诉 Claude 用哪条命令、按什么顺序编排 | Claude Code | `skills/*/SKILL.md` |
| **auth（认证）** | 全局登录：登录流程、token 存储/续期、请求拦截注入 | CLI 引擎 | `internal/auth/` + `internal/credential/` |

关键原则：

- **catalog 里不出现 baseUrl、auth、user_id**——这些都是全局的或网关下传的，业务接口只管「在网关上叫什么路径、收什么参数、回什么字段」。
- **auth 全局一份**，不是每个系统一份；网关 baseUrl + token 全局一份。
- **skill 只管编排**（如「先查年假余额 → 再提交请假」），不描述单个接口怎么调——那是 catalog 的事。

### 请求链路

```
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22
        │
        ▼
[CLI 引擎] 读 catalog/services/leave.json → 找到 applications.submit
        │  读全局 config → 拿到 gateway baseUrl + token
        ▼
HTTP POST {gateway}/leave/applications
        Authorization: Bearer <token>
        └─ body: { start_date, end_date, reason }
        ▼
[mock 网关] 校验 token → 解析出 user_id → 注入 X-User-Id header → 转发 leave 处理
        ▼
{ application_id, status }
```

`user_id` 全程由网关注入，CLI 和 catalog 都无感知。

---

## 3. 目录结构

```
D:\work\things\2026.09.17.custom-cli\
├── saicmotor-cli/                 # CLI 包（Node + TypeScript）
│   ├── catalog/                   # 机器 API 目录（打进包内，随包分发）
│   │   └── services/
│   │       └── leave.json
│   ├── skills/                    # 标准 skill（打进包内，随包分发）
│   │   └── leave/
│   │       └── SKILL.md
│   └── src/
│       ├── auth/                  # 认证（全局）
│       │   ├── store.ts           # token 存储（全局一份）
│       │   ├── session.ts         # token 缓存 + 续期
│       │   ├── login.ts           # 登录策略（可插拔：password / 以后 sso）
│       │   └── transport.ts       # 拦截器：给每个请求注入 Authorization: Bearer
│       ├── cli/
│       │   ├── index.ts           # 根命令（commander）
│       │   └── auth.ts            # auth login / logout / status
│       ├── config.ts              # 全局配置：gateway baseUrl + auth 策略
│       ├── schema/
│       │   └── catalog.ts         # catalog 的 zod schema（替换现在的 skill.ts）
│       └── engine/
│           ├── catalog.ts         # 加载 catalog/services/*.json
│           ├── http.ts            # 发请求（走 auth transport 拦截）
│           └── run.ts             # 执行命令（编排 + 成功校验）
└── mock-gateway/                  # mock 网关（新建，Spring Boot，本次第一个交付物）
    └── ...                        # login + token 解析 + user_id 注入 + 转发 leave 后端
```

说明：
- `catalog/` 和 `skills/` 都**放进 saicmotor-cli 包内**，员工安装 npm 包即拿到，不维护 `~/.saicmotor/skills/`。
- 现在 `~/.saicmotor/` 只保留**用户自己的私有状态**：登录后的 token（或凭证）、配置。skill / catalog 不再是用户生成物。
- `src/schema/skill.ts`（旧的 SkillSchema：baseUrl/auth/requests/responseContract/commands）**废弃**，替换为 `src/schema/catalog.ts`。
- `mock-leave-server/`（Java Spring Boot，已存在）本次**改造**为 leave 后端：从 cookie/CSRF 模型换成 token/user_id-header 模型，加 `GET /leave/balance`、`POST /leave/applications`。

---

## 4. catalog 格式（套飞书，删平台专属字段）

格式直接对齐 lark-cli 的 `services/*.json`，但删掉 Lark 开放平台专属字段（`scopes`、`accessTokens`、`risk`、`docUrl`）。保留核心：`name` / `title` / `description` / `servicePath` / `resources.*.methods`，每个 method 含 `id` / `path` / `httpMethod` / `description` / `parameters` / `requestBody` / `responseBody`。

### 示例：`catalog/services/leave.json`

```json
{
  "name": "leave",
  "title": "请假",
  "description": "请假：查询年假余额、提交请假申请",
  "servicePath": "/leave",
  "resources": {
    "balance": {
      "methods": {
        "query": {
          "id": "balance.query",
          "path": "/balance",
          "httpMethod": "GET",
          "description": "查询当前用户年假余额",
          "responseBody": {
            "annual_balance": { "type": "integer", "example": 5 },
            "used":           { "type": "integer", "example": 3 }
          }
        }
      }
    },
    "applications": {
      "methods": {
        "submit": {
          "id": "applications.submit",
          "path": "/applications",
          "httpMethod": "POST",
          "description": "提交请假申请",
          "requestBody": {
            "start_date": { "type": "string", "required": true, "example": "2026-09-21" },
            "end_date":   { "type": "string", "required": true, "example": "2026-09-22" },
            "reason":     { "type": "string", "required": true, "example": "年假" }
          },
          "responseBody": {
            "application_id": { "type": "string", "example": "APP-001" },
            "status":         { "type": "string", "example": "PENDING" }
          }
        }
      }
    }
  }
}
```

### 映射规则

- `servicePath`（`/leave`）是网关上的相对路径，**不是完整 URL**；完整 URL = `{gateway}{servicePath}{method.path}`。
- `id`（`balance.query` / `applications.submit`）决定命令名：
  - `balance.query` → `saicmotor leave balance query`
  - `applications.submit` → `saicmotor leave applications submit`
- `requestBody` / `responseBody` 里**不写 `user_id`**——它由网关解析 token 后塞进 header 下传。
- 认证接口（`/auth/login`）**不进 catalog**，在全局配置的 `auth.loginPath` 里声明（与飞书一致：auth 不在业务 catalog 里）。

---

## 5. skill 格式（标准 Claude Code skill）

标准 Claude Code skill：目录 + `SKILL.md`（YAML frontmatter `name`/`description`）+ 可选 `references/`。skill 只负责**编排**，不描述接口细节。

### 示例：`skills/leave/SKILL.md`

```markdown
---
name: leave
description: 请假。请年假前先查余额确认够不够，再提交请假申请。
---

## 编排

请年假按两步走：

1. 先查余额：`saicmotor leave balance query`
2. 余额够再提交：`saicmotor leave applications submit --start-date <开始> --end-date <结束> --reason <事由>`
```

后续复杂编排（如「查余额 → 判断是否够 → 提交 → 轮询审批结果」）直接写在 SKILL.md 正文里，交给 Claude 执行；引擎只负责单条命令的确定性 replay。

---

## 6. 认证模块（全局、可插拔、password 先行）

认证是**全局一块**，不属于任何 skill / catalog。放 `src/auth/`，入口命令放 `src/cli/auth.ts`。

### 目录职责

| 文件 | 职责 |
|---|---|
| `src/auth/store.ts` | 凭证/token 存储，全局一份（不再是 per-system）。写 `~/.saicmotor/`，`0o600` 权限。 |
| `src/auth/session.ts` | token 缓存 + 过期判定 + 续期钩子。 |
| `src/auth/login.ts` | 登录策略接口 + `password` 实现（账号密码 → `POST {gateway}{auth.loginPath}` → token）。策略可插拔，以后加 `sso`。 |
| `src/auth/transport.ts` | HTTP 拦截器：发任何网关请求前自动带 `Authorization: Bearer <token>`。 |
| `src/cli/auth.ts` | `saicmotor auth login` / `auth logout` / `auth status`。 |

### 全局配置 `~/.saicmotor/config.json`

```json
{
  "gateway": "http://localhost:8081",
  "auth": {
    "type": "password",
    "loginPath": "/auth/login",
    "tokenHeader": "Authorization",
    "tokenPrefix": "Bearer"
  }
}
```

- `gateway`：网关 baseUrl（全局一份）。
- `auth.type`：登录策略，第一步 `password`；SSO 时换成 `sso`（登录流程换成 SSO 跳转/换 token），**引擎和 catalog 不动**——这是「auth 可插拔」的核心。

**配置解析顺序**（显式定义，避免歧义）：`src/config.ts` 里的 built-in 默认（指向 mock 网关 `http://localhost:8081`）→ 被 `~/.saicmotor/config.json` 覆盖 → 再被环境变量（如 `SAICMOTOR_GATEWAY`）覆盖。员工装完即可连 mock 网关，改一个配置即切换真实网关。

### 与飞书的对应

| 飞书 | 我们 | 是否做 |
|---|---|---|
| `internal/auth/`（token_store / transport / device_flow） | `src/auth/`（store / session / login / transport） | ✅ |
| `internal/credential/`（credential_provider 可插拔） | `src/auth/store.ts` + 可插拔策略 | ✅ |
| `cmd/auth/`（login / logout / status / check） | `src/cli/auth.ts` | ✅ |
| `sidecar/`（多租户独立进程） | — | ❌ v1 不做 |

---

## 7. 引擎

引擎只做确定性的事：**加载 catalog → 生成命令 → 按 catalog 定义 replay HTTP → 校验响应**。编排交给 SKILL.md（Claude）。

- `src/engine/catalog.ts`：启动时加载包内 `catalog/services/*.json`（和 `skills/*/SKILL.md` 同源分发），解析为 zod 校验后的结构。
- `src/cli/index.ts`：读 catalog，为每个 service 注册子命令、每个 method 注册叶子命令；参数由 `requestBody`/`parameters` 生成（commander option）。
- `src/engine/run.ts`：执行单条命令——拼 URL（`gateway + servicePath + path`）、拼 body、走 `auth/transport` 注入 token、发请求、按 `responseBody` 打印结果。
- 旧的 `src/engine/session.ts`（per-skill 登录抽取会话）废弃，认证统一走 `src/auth/`。

---

## 8. mock 网关 + leave 后端（本次第一个交付物）

网关用 **Spring**（与已有 mock-leave-server 同栈：Java 17 + Spring Boot 3.x），拆两个服务，忠实还原「网关是独立系统，把 user_id 通过 header 下传下游」：

| 服务 | 目录 | 端口 | 职责 |
|---|---|---|---|
| mock 网关 | `mock-gateway/`（新建） | 8081 | 登录、鉴权、解析 token → user_id、注入 `X-User-Id`、转发 |
| leave 后端 | `mock-leave-server/`（改造） | 8080 | 读 `X-User-Id`，返回年假余额 / 受理请假 |

### mock 网关（`mock-gateway/`）

- `AuthController`：`POST /auth/login` `{ username, password }` → `{ token }`。
- `GatewayFilter`（servlet `Filter`）：对 `/leave/**` 读 `Authorization: Bearer <token>` → 解析出 `user_id` → 注入 `X-User-Id` header → `WebClient` 转发到 `http://localhost:8080/leave/**`。
- 网关内置一份用户目录（username/password → user_id），用于登录校验和签发 token（mock 简化，真实环境走 SSO/IDP）。
- 不引入完整 Spring Cloud Gateway（mock 简化）；真实环境可换 Spring Cloud Gateway，网关职责不变。

### leave 后端（改造 `mock-leave-server/`）

- 从 cookie/CSRF 模型改成 **token/user_id-header 模型**：删掉 JSESSIONID、X-CSRF-Token 流程。
- 端点（读 header `X-User-Id`）：
  | 方法 | 路径 | 输入 | 输出 |
  |---|---|---|---|
  | GET | `/leave/balance` | header `X-User-Id` | `{ annual_balance, used }` |
  | POST | `/leave/applications` | header + `{ start_date, end_date, reason }` | `{ application_id, status }` |
- 用户数据沿用：`zhangsan`（年假 5）、`lisi`（年假 0）；user_id 即 username（mock 简化）。

### 网关契约（CLI 视角）

| 方法 | 路径 | 输入 | 输出 |
|---|---|---|---|
| POST | `/auth/login` | `{ username, password }` | `{ token }` |
| GET | `/leave/balance` | header `Authorization: Bearer <token>` | `{ annual_balance, used }` |
| POST | `/leave/applications` | header + `{ start_date, end_date, reason }` | `{ application_id, status }` |

### 关键点

- **token 是 mock 简化**：`base64url({ sub: user_id, username, exp })`，不签名——只演示「网关从 token 解析 user_id」。真实 SSO 换标准 JWT / OIDC，网关侧只改校验函数，CLI 不动。
- 两个服务各自 `mvn spring-boot:run` 启动；网关转发 leave 后端，验证 `user_id` 确实是「网关注入、下游读取」。

---

## 9. 实施顺序（网关先行，SSO 延后）

1. **mock 网关**：写 `mock-gateway/`（Spring Boot），实现 login + 鉴权 Filter + `X-User-Id` 注入 + 转发，含单测。
2. **leave 后端**：改造 `mock-leave-server/`，换成 token/user_id-header 模型，加 `/leave/balance`、`/leave/applications`，含单测。
3. **catalog + skill 落地**：把 `catalog/services/leave.json`、`skills/leave/SKILL.md` 写进包内。
4. **CLI 重构**：`src/schema/catalog.ts` 替换旧 schema；`src/engine/catalog.ts` 加载 catalog；`src/auth/` 全局化；`src/cli/auth.ts` 登录命令。
5. **端到端打通**：`saicmotor auth login`（连网关拿 token）→ `saicmotor leave balance query` → `saicmotor leave applications submit`，验证 token 注入 + user_id 下传 + 响应展示。
6. **（延后）SSO**：把 `auth.type` 从 `password` 换成 `sso`，只改 `src/auth/login.ts` 的登录策略，其余不动。

---

## 10. 测试策略

- **catalog schema**：zod 校验通过/失败用例（缺 `id`、`path` 非法、`requestBody` 类型错等）。
- **命令生成**：给定 catalog，断言生成的 commander 命令树与 `id` 对应（`leave balance query` 等）。
- **auth transport**：给定 token，断言发出的请求带 `Authorization: Bearer <token>`；token 缺失时抛可读错误。
- **mock 网关单测**：login 成功/失败；无 token 访问 `/leave/*` 返回 401；有 token 正确解析 user_id 并注入 `X-User-Id`。
- **端到端（integration）**：起 mock 网关 + CLI，跑通 login → query → submit 三连，断言最终响应字段。

---

## 11. 明确不做（YAGNI）

- **SSO**：延后。只做 password 策略，接口留好可插拔位。
- **events（事件订阅）**：反向推送通道，请假是同步请求/响应，不需要。
- **sidecar（多租户独立进程）**：单网关单 token，不需要。
- **多系统**：本次只做 leave 一个系统验证；多系统只是再加 catalog + skill 文件，机制不变。
- **scripts/（CI 发布脚本）**：等真要发 npm 包时再补。
- **mock-leave-server（Java）扩展**：属于浏览器录制另一条工作线，本次不动。
