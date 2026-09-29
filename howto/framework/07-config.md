# 07 — 配置体系

> 本文档覆盖 saicmotor CLI 的全部配置入口：内置默认值、包级配置文件、用户配置文件、环境变量覆盖。
> 每个配置项标注其当前值及 **是否需要在发布生产前变更**。

---

## 配置优先级

```
环境变量 > 用户配置文件 (~/.saicmotor/config.json) > 包级默认 (saicmotor.config.json) > 硬编码默认
```

---

## 一、包级默认配置

**文件**：`packages/cli/saicmotor.config.json`

```json
{
  "installUrl": "@saicmotor/cli",
  "defaults": {
    "gateway": "http://localhost:8081"
  }
}
```

| 字段 | 说明 | 当前值 | 需变更？ |
|------|------|--------|:---:|
| `installUrl` | AI 安装指引中引用的包名 | `@saicmotor/cli` | ✅ 不变 |
| `defaults.gateway` | 网关地址（无用户配置 & 无环境变量时使用） | `http://localhost:8081` | 🔴 发布前改为生产网关地址 |

**加载路径**：`packages/cli/src/config.ts:26-30`

```typescript
function loadPackageConfig() {
  return JSON.parse(fs.readFileSync(packageFile("saicmotor.config.json"), "utf8"));
}
```

> 编译后 `saicmotor.config.json` 通过 `files` 字段随包发布。

---

## 二、硬编码默认值

**文件**：`packages/cli/src/config.ts:34-48`

```typescript
export const DEFAULT_CONFIG: Config = {
  gateway: pkgConfig.defaults?.gateway ?? "http://localhost:8081",
  auth: {
    type: "exchange",
    loginPath: "/auth/login",
    tokenPath: "data.token",
    tokenHeader: "Authorization",
    tokenPrefix: "Bearer",
    startPath: "/auth/exchange/start",
    exchangePath: "/auth/exchange",
    loopbackHost: "127.0.0.1",
    loopbackPort: 3000,
    callbackTimeoutMs: 120000,
  },
};
```

| 字段 | 当前值 | 说明 | 需变更？ |
|------|--------|------|:---:|
| `auth.type` | `"exchange"` | 默认认证类型（飞书 OAuth） | ✅ 生产不变 |
| `auth.loginPath` | `"/auth/login"` | 密码登录接口路径 | ⚠️ 按实际网关路由确认 |
| `auth.tokenPath` | `"data.token"` | 响应中 token 的 JSONPath | ⚠️ 按实际响应结构确认 |
| `auth.tokenHeader` | `"Authorization"` | HTTP 认证头 | ✅ 通常不变 |
| `auth.tokenPrefix` | `"Bearer"` | token 前缀 | ✅ 通常不变 |
| `auth.startPath` | `"/auth/exchange/start"` | exchange 流程起始路径 | ⚠️ 按实际 OAuth 端点确认 |
| `auth.exchangePath` | `"/auth/exchange"` | exchange 换 token 路径 | ⚠️ 按实际 OAuth 端点确认 |
| `auth.loopbackHost` | `"127.0.0.1"` | OAuth 回调服务器地址 | ✅ 不变（本地回环） |
| `auth.loopbackPort` | `3000` | OAuth 回调服务器端口 | ⚠️ 可能端口冲突，评估是否需要可配置 |
| `auth.callbackTimeoutMs` | `120000`（2 分钟） | OAuth 回调超时 | ✅ 2 分钟足够 |

---

## 三、用户配置文件

**文件**：`~/.saicmotor/config.json`

| 字段 | 说明 | 示例 |
|------|------|------|
| `gateway` | 覆盖网关地址 | `"https://api.example.com"` |
| `auth.type` | 覆盖认证类型 | `"password"` 或 `"exchange"` |
| `auth.loginPath` | 覆盖登录路径 | `"/v2/auth/login"` |
| `auth.*` | 可部分覆盖 `DEFAULT_CONFIG.auth` 任意字段 | — |

**读取逻辑**（`config.ts:58-72`）：
- `gateway`：环境变量 → 用户配置 → 包级默认 → 硬编码
- `auth`：浅合并 `DEFAULT_CONFIG.auth` ← 用户 `auth` ← `SAICMOTOR_AUTH_TYPE`

---

## 四、环境变量

| 变量 | 覆盖项 | 优先级 | 生产必需？ |
|------|--------|:---:|:---:|
| `SAICMOTOR_HOME` | 数据根目录（替代 `~/.saicmotor`） | 最高 | 否 |
| `SAICMOTOR_GATEWAY` | 网关地址 | 最高 | 否（可配在 config.json） |
| `SAICMOTOR_AUTH_TYPE` | 认证类型 `"password"` / `"exchange"` | 最高 | 否 |
| `SAICMOTOR_USERNAME` | 用户名（CI/非交互环境） | — | 否 |
| `SAICMOTOR_PASSWORD` | 密码（CI/非交互环境） | — | 否 |
| `SAICMOTOR_CATALOG` | catalog 目录覆盖（测试/定制） | 最高 | 否 |
| `SAICMOTOR_SCRIPTS` | 脚本目录覆盖（测试/定制） | 最高 | 否 |

**各变量使用位置**：

| 变量 | 使用文件 | 行号 |
|------|----------|:---:|
| `SAICMOTOR_HOME` | `src/config.ts` | 51 |
| `SAICMOTOR_GATEWAY` | `src/config.ts` | 65 |
| `SAICMOTOR_AUTH_TYPE` | `src/config.ts` | 69 |
| `SAICMOTOR_USERNAME` | `src/auth/store.ts` | 24 |
| `SAICMOTOR_PASSWORD` | `src/auth/store.ts` | 25 |
| `SAICMOTOR_CATALOG` | `src/config.ts` | 75 |
| `SAICMOTOR_SCRIPTS` | `src/engine/script.ts` | 43 |

---

## 五、本地数据文件

所有数据存储在 `~/.saicmotor/`（或 `$SAICMOTOR_HOME/`）：

| 文件/目录 | 用途 | 权限 |
|-----------|------|:---:|
| `config.json` | 用户配置（gateway、auth 覆盖） | 644 |
| `credentials.json` | 用户名/密码（password 模式） | 600 |
| `token.json` | 缓存的认证 token | 600 |
| `plugins/node_modules/` | npm 安装的插件包 | — |
| `plugins/linked/` | dev link 的插件 junction | — |
| `plugins/state.json` | 插件启用/禁用状态 | 644 |
| `skills/` | skills 注册 junction（legacy，部分 AI 工具使用） | — |

---

## 六、发布生产前必须变更项

| 优先级 | 配置项 | 当前值 | 生产值 | 位置 |
|:---:|--------|--------|--------|------|
| 🔴 | `defaults.gateway` | `http://localhost:8081` | 生产网关 URL | `saicmotor.config.json` |
| 🔴 | `auth.loginPath` | `/auth/login` | 确认与网关一致 | `config.ts` `DEFAULT_CONFIG` |
| 🔴 | `auth.startPath` | `/auth/exchange/start` | 确认与 OAuth 端点一致 | `config.ts` `DEFAULT_CONFIG` |
| 🔴 | `auth.exchangePath` | `/auth/exchange` | 确认与 OAuth 端点一致 | `config.ts` `DEFAULT_CONFIG` |
| 🟡 | `auth.tokenPath` | `data.token` | 确认响应 JSON 结构 | `config.ts` `DEFAULT_CONFIG` |
| 🟡 | `auth.loopbackPort` | `3000` | 避免常见端口冲突 | `config.ts` `DEFAULT_CONFIG` |
| 🟡 | `installUrl` | `@saicmotor/cli` | 确认 npm registry 包名 | `saicmotor.config.json` |
| 🟢 | `auth.tokenHeader` | `Authorization` | 通常不变 | `config.ts` `DEFAULT_CONFIG` |
| 🟢 | `auth.tokenPrefix` | `Bearer` | 通常不变 | `config.ts` `DEFAULT_CONFIG` |

---

## 七、配置架构图

```
saicmotor.config.json          用户 ~/.saicmotor/config.json      环境变量
（包级默认，随 npm 发布）       （用户本地覆盖）                  （运行时注入）
        │                              │                              │
        ▼                              ▼                              ▼
   loadPackageConfig()           fs.readFileSync()              process.env.XXX
        │                              │                              │
        └──────────────────────────────┼──────────────────────────────┘
                                       │
                                       ▼
                                  loadConfig()
                                       │
                                       ▼
                         { gateway, auth: { type, ... } }
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼            ▼
                     engine/run    auth/session   plugin/loader
```