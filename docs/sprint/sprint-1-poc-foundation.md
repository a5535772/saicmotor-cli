# Sprint 1 — POC 基础建设

> **状态**: ✅ 完成 | **时间**: 2026-09-17 ~ 2026-09-20

## 目标

把 saicmotor-cli 的核心骨架搭出来：能从命令行调用业务系统 API，支持认证和 mock-gateway 中转。

## 完成项

### 1. CLI 骨架 (`src/cli/index.ts`)

- commander 动态注册命令：扫描 catalog JSON，为每个 system/resource/method 生成子命令
- 参数从 catalog 的 `requestBody` 自动生成 `--xx` flag
- `--format json|table|pretty`、`--dry-run`、`--yes` 全局选项
- 写操作默认要求 `--yes` 确认

### 2. 通用引擎 (`src/engine/`)

| 模块 | 功能 | 测试覆盖 |
|------|------|----------|
| `catalog.ts` | 从 `~/.saicmotor/skills/` 加载/校验所有 `*.json` | ✅ |
| `schema/catalog.ts` | Service/Method/Resource 的 zod schema | ✅ |
| `request.ts` | URL 拼接、参数类型转换、body 拼装 | ✅ |
| `http.ts` | fetch 封装：超时、JSON 解析、Set-Cookie 合并 | ✅ |
| `extract.ts` | 按路径从响应取字段 | ✅ |
| `output.ts` | JSON 信封 / table / pretty 输出 | ✅ |
| `errors.ts` | 五类错误归一（validation/auth/network/upstream/spec），语义化退出码 | ✅ |
| `run.ts` | 编排流水线：认证 → 构建 → 发送 → 401 重登重试 → 校验 → 输出 | ✅ |

### 3. 认证 (`src/auth/`)

- `store.ts` — 凭证/Token 文件存储（mode 0600），支持环境变量覆盖
- `login.ts` — HTTP 登录，从响应按 `tokenPath` 提取 token
- `session.ts` — `ensureToken`：有缓存用缓存，无缓存自动登录
- `transport.ts` — 请求注入 `Authorization: Bearer xxx`

### 4. CLI 命令 (`src/cli/`)

- `auth.ts` — `saicmotor auth login/logout/status`
- `error.ts` — 统一错误处理和 JSON 信封输出

### 5. Mock Gateway（Spring Boot）

- `TokenService` — 签发/解析 JWT token
- `UserDirectory` — 硬编码用户目录
- `GatewayFilter` — Bearer token 校验 + `X-User-Id` 注入 + 转发到后端
- `ForwardClient` — HTTP 转发客户端
- `AuthController` — `/auth/login` 端点

### 6. Catalog 数据

- `catalog/services/leave.json` — 请假系统（查余额、提交申请）
- `catalog/services/attendance.json` — 考勤系统（打卡记录、补卡）

### 7. 单元测试（43 个，全部通过）

| 文件 | 测试数 |
|------|--------|
| `config.test.ts` | 3 |
| `request.test.ts` | 4 |
| `http.test.ts` | 5 |
| `extract.test.ts` | 4 |
| `output.test.ts` | 6 |
| `errors.test.ts` | 2 |
| `catalog-schema.test.ts` | 3 |
| `catalog-load.test.ts` | 3 |
| `auth-login.test.ts` | 5 |
| `auth-store.test.ts` | 3 |
| `run.test.ts` | 4 |

### 8. 集成测试（1 个）

- `leave-gateway.test.ts` — 查余额 → 提申请，完整走通 mock gateway

## 架构决策

详见 [ARCHITECTURE.md](../saicmotor-cli/doc/ARCHITECTURE.md)：
- 引擎不可变 + spec 可重生成
- 著作 AI 化 + 执行确定性
- 报文层与命令层分离
- 两层身份（SSO + 各系统 session）
- auth 可插拔（password/redirect/exchange/prefetch）