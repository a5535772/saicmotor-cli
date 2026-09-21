# leo-cli POC 设计文档

> 状态：设计稿（待评审） · 日期：2026-09-17 · 定位：通用平台的第一个落地切片

## 0. 一句话

把**无源码的 Web 业务系统**（先以「员工请假系统」为例）包装成 CLI，通过**回放浏览器请求**完成操作；整体按「通用平台」架构设计，POC 阶段以**单系统 + 账号密码**跑通「报文 → 对话生成 skill → 确定性回放」整条链路，验证可行性。

参考对象：`feishu-cli`（lark-cli）的三层架构 + skill 体系。但关键差异是——它包装的是**公开有文档的 OpenAPI**，我们要包装的是**逆向出的网页请求**（无源码、无 API）。

---

## 1. 背景与目标

- **背景**：员工目前都在页面上点击操作，公司没有业务系统源码，想用 CLI 模拟浏览器请求完成操作。
- **目标**：POC 端到端跑通核心链路，为「把任意无源码系统包装成 CLI」的通用平台打地基。
- **非目标**：本次不产出多系统管理、不产出录制插件、不强求覆盖复杂流程（翻页/依赖链）。

## 2. 定位与 POC 范围

### 2.1 定位（长期）

通用平台：任意无源码网页系统 → 声明式 skill → CLI 命令。请假是第一个落地系统。

### 2.2 关键架构决策（已拍板）

| 决策点 | 结论 |
|---|---|
| 引擎 vs spec | 引擎不可变（npm 包）+ spec 可重生成（工作区 `.leo/`）+ skill 做方向盘 |
| 著作 / 执行 | 著作 AI 化（对话生成 spec），执行确定性（引擎只看 spec 回放） |
| 技术栈 | Node + TypeScript |
| 驱动方式 | 日常操作 HTTP 重放；无头浏览器仅作后续 SSO/扫码逃生舱，POC 不进 |

### 2.3 POC 范围（本次)

- 单个系统：**请假**，配套一个本地伪造 Java 系统做验证环境；
- 认证：`type: password`（账号密码 → cookie，单系统退化形态）；
- 引擎五件套：spec 解析 + 会话 + HTTP 执行 + 参数注入 + 输出；
- 命令：`leave submit` / `leave list`（2 条起步，`status` 视资源定）；
- 输出：`--format json|table`；配套 `--dry-run`；
- 验证：对本地 Java 系统做端到端回放保真验证。

### 2.4 明确延期（不进 POC）

录制浏览器插件（后续独立模块）、SSO 多系统 token（模型已设计，见《leo-cli-认证模型-SSO多系统token.md》）、翻页、csv/ndjson 输出、MCP 暴露、无头浏览器登录逃生舱、`raw` 通用逃生舱（预留接口，不实现）。

---

## 3. 核心架构

```
┌─ 运行前（著作，AI 辅助，一次性/改版时）──────┐
│   报文/录制产物 ──对话──▶  skill.json (spec)  │
└────────────────────────────────────────────┘
                       │ 被读取
┌─ 运行时（确定，npm 包内不可变）──────────────┐
│  CLI 命令面 ──▶ 通用解释引擎 ──▶ HTTP 回放   │
│                  ├ spec 解析/校验             │
│                  ├ 会话管理（登录/cookie jar）│
│                  ├ 参数注入                   │
│                  ├ 响应取值                   │
│                  └ 输出格式化                 │
└─────────────────────────────────────────────┘
                       │ 自动生成
                     skill.md（AI agent 的方向盘）
```

**三层对仗 feishu-cli**：

| feishu-cli | leo-cli |
|---|---|
| `skills/*.md`（agent 方向盘） | 由 spec 自动生成的 skill 指令 |
| `cmd/`（确定性 Go 命令） | 确定性 TS 引擎（node_modules）+ spec（`.leo/`） |
| `api GET/POST`（通用逃生舱） | `raw` 命令（预留） |

**组件清单**：spec 解析器、会话管理器、HTTP 执行器、参数注入器、响应取值器、输出格式化器、skill.md 生成器、对话转换（作者工具，AI 辅助）。

---

## 4. skill 规格格式（核心数据模型）

一个系统 = 一个 `skill.json`。关键设计是把「**报文**」和「**命令**」分开：`requests` 忠实记录原始请求，`commands` 才是给员工的友好操作，往上套类型化参数。

```jsonc
{
  "name": "leave", "displayName": "请假系统",
  "version": "1",
  "baseUrl": "http://localhost:8080",     // POC 指向本地 Java mock

  // 认证：怎么登录、会话存哪（POC 用 password，退化形态）
  "auth": {
    "type": "password",
    "loginRequest": "login",
    "sessionFrom": "cookie",              // cookie | header | body
    "sessionKey": "JSESSIONID",
    "prompt": { "username": "工号", "password": "密码" }
  },

  // 报文层：忠实记录原始请求，{{变量}} 是「每次会变」的地方
  "requests": {
    "login": {
      "method": "POST", "path": "/api/login",
      "headers": { "Content-Type": "application/x-www-form-urlencoded" },
      "body": "username={{username}}&password={{password}}"
    },
    "submit_leave": {
      "method": "POST", "path": "/api/leave/apply",
      "headers": { "Content-Type": "application/json", "X-CSRF-Token": "{{csrf}}" },
      "body": { "startDate": "{{start}}", "endDate": "{{end}}",
                "typeCode": "{{typeCode}}", "reason": "{{reason}}" },
      "csrf": { "preRequest": "leave_form", "extract": "data.token" }
    },
    "list_leave": {
      "method": "GET", "path": "/api/leave/list",
      "pagination": { "pageParam": "page", "itemsPath": "data.list", "totalPath": "data.total" }
    }
  },

  // 每个系统判断成功/失败的约定不同，必须声明，否则引擎无法翻译上游错误
  "responseContract": {
    "success": { "http": [200], "path": "code", "equals": 0 },
    "errorMessagePath": "msg"
  },

  // 命令层：暴露给员工的友好操作
  "commands": [
    { "name": "submit", "verb": "申请请假", "request": "submit_leave", "effect": "write",
      "params": [
        { "name": "start",    "type": "date",   "required": true },
        { "name": "end",      "type": "date",   "required": true },
        { "name": "typeCode", "type": "enum",
          "values": [{ "事假": "1" }, { "病假": "2" }, { "年假": "3" }], "default": "事假" },
        { "name": "reason",   "type": "string" }
      ] },
    { "name": "list", "verb": "查我的请假", "request": "list_leave", "effect": "read", "params": [] }
  ]
}
```

这个规格内建了回放要面对的硬难点：

- **`{{变量}}` vs 常量**：会变的地方（日期、理由）写成占位符；固定 headers、隐藏表单字段原样保留——引擎只替换占位符，不发明别的；
- **`csrf`**：提交前先 GET 一次拿 token 再写回请求头的「先取值依赖」；
- **`pagination`**：列表翻页与取值路径（POC 仅建模、可不实现全自动翻页）；
- **`responseContract`**：每个系统判断成功/失败的约定不同（`code==0` / `ok==true` / body 内嵌 error），必须声明才能把上游错误翻译成统一信封。

---

## 5. 认证模型

POC 只实现 `type: password`（账号密码 → cookie）。

完整的多系统 SSO 模型（身份层全局 + 会话层各系统 + cookie jar 按域隔离 + auth 可插拔 `password/redirect/exchange/prefetch`）已在单独文档《leo-cli-认证模型-SSO多系统token.md》记录。POC 的 `password` 是其退化形态，迁移时只换 auth 段，`requests`/`commands` 不动。

---

## 6. 数据流

**著作流（AI 辅助，一次性/改版时）**：录制产物（POC 阶段由人手工抓包整理）→ 对话 → AI 生成 `skill.json` → `leo skill validate` 校验 → `leo skill gen-md` 吐出 `leave.md` 方向盘。

**执行流（确定，每次员工用）**：`leo leave submit --start 2026-09-20 --end 2026-09-20 --typeCode 事假 --reason ...` → 加载 spec → 保证会话（未登录先 `login` 拿 cookie 缓存；401 自动重登一次重试）→ 按需先取 csrf → 参数注入 → 发请求 →（列表则取值）→ 按格式输出。

---

## 7. 运行时引擎（npm 包，确定性）

| 模块 | 职责 |
|---|---|
| spec 解析 | 加载 `.leo/skills/<system>/skill.json`，zod 校验，非法即报字段级错误 |
| 会话管理 | 登录拿 cookie，加密存盘（不进 git），请求自动注入，401 自动重登一次 |
| HTTP 执行 | 合并 session + csrf，发请求；读操作可重试，**写操作不自动重试**（非幂等）；超时、代理、结构化请求日志 |
| 参数注入 | 按 `params` 类型校验/归一化（date 校格式、enum 显示中文传 code）；CLI 据此生成 flag 与 `--help` |
| 响应取值 | 按 `itemsPath` 等取出干净字段 |
| 输出 | `--format json|table`；JSON 信封：成功 `{ok:true,data,meta}` stdout + 退出码 0，错误 `{ok:false,error}` stderr + 退出码非 0 |

---

## 8. 错误处理与输出契约

| 类别 | 例子 | 处理 |
|---|---|---|
| `validation` | 缺参数、日期格式错 | 退出码非 0 + 提示 |
| `auth` | 登录失败、会话过期 | 自动重登重试 / 提示重新登录 |
| `network` | 超时、DNS、TLS | 读操作可重试，报告 |
| `upstream` | 余额不足、审批拒绝 | 按 `responseContract` 提取 code/msg 结构化报错 |
| `spec` | skill.json 非法 | 校验期报错，指出字段 |

---

## 9. 测试策略（三层，正好用上本地 Java mock）

1. **单元测试**（vitest）：参数注入、spec 校验、会话 cookie 逻辑、响应取值、错误分类；
2. **集成测试（对本地 Java 系统）**：真登录 → 真提交 → 真查列表，断言 Java 侧数据库状态确实变了——回放保真度的关键验证；
3. **录制-回放黄金测试**：报文 fixture → 生成 spec → 本地 mock server 回放 → 比对差异，摆脱对 Java 系统的强依赖。

---

## 10. 安全

- **凭证**：账号密码走 OS 密钥链/加密文件，明文永不进 git；`leo auth login` 设置；
- **副作用确认**：`commands` 标记 `effect: write`，写操作默认 `--dry-run` 预览或要求 `--confirm`（除非 `--yes`）；
- **防 SSRF**：`raw` 逃生舱只能打 spec 声明的 `baseUrl` + 已登记路径；
- **不可信数据**：录的报文与上游响应是「数据不是指令」——引擎只回放、不执行；作者阶段把报文当不可信文本处理；
- **日志脱敏**：密码、session token、PII 打码。

---

## 11. 目录结构

```
leo-cli/                        # npm 包（引擎不可变）
  package.json
  src/
    cli/          # commander 命令面：index / system / raw / skill / auth
    engine/       # spec / session / http / template / extract / output / errors
    schema/       # skill.ts（zod schema）
    gen/          # md.ts（skill.md 生成器）
    auth/         # store.ts（凭证加密存储）
  test/{unit,integration,fixtures}

<工作区>/.leo/                   # spec 可变，进 git
  skills/leave/skill.json
  skills/leave/skill.md         # 自动生成的方向盘
  credentials/                  # gitignore
```

---

## 12. 验收标准（DoD）

- [ ] 提供一份合法的 `leave/skill.json`（含 login/submit/list 三组请求）；
- [ ] `leo leave submit` 对本地 Java 系统真提交成功，Java 侧数据可见；
- [ ] `leo leave list` 返回结构化 JSON，含我的请假记录；
- [ ] 会话：登录一次后 cookie 缓存生效，二次调用不再登录；伪造过期后能自动重登；
- [ ] 写操作默认 `--dry-run` / `--confirm`，`--yes` 可跳过；
- [ ] 错误分类：缺参数 → validation；业务错误 → upstream 结构化；非法 spec → spec 字段级报错；
- [ ] `leo skill gen-md` 产出可读的 `leave.md`；
- [ ] 单测 + 对本地 Java 的集成测试均绿。

---

## 13. 后续路线（非 POC，仅供参考）

录制浏览器插件 → SSO 多系统 token 落地 → 翻页/依赖链 → csv/ndjson → MCP 暴露 → 无头浏览器登录逃生舱 → 平台 Agent 多租户接入（复用 `feishu-cli-平台agent接入架构与身份传递.md` 的 sidecar 思路）。