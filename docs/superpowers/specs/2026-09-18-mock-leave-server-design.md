# mock-leave-server 设计文档

> 状态：设计稿（待评审） · 日期：2026-09-18 · 定位：leo-cli POC 的本地回放保真验证靶场

## 0. 一句话

用 Spring Boot 构建一个**纯 API、极简**的虚拟「员工请假系统」，严格对齐 leo-cli POC 的 `skill.json` 契约（登录 → 取 CSRF → 提交 → 查列表），作为 CLI 端到端回放和集成测试的真实靶场；数据落 H2 内存库可查可断言，另提供 dev 端点确定性模拟会话过期。

配套文档：[`2026-09-17-leo-cli-poc-design.md`](2026-09-17-leo-cli-poc-design.md)。

---

## 1. 背景与目标

- **背景**：leo-cli POC 要包装「无源码的网页系统」，需要一个本地伪造的 Java 系统做验证环境（POC 设计 §2.3 已明确）。
- **目标**：
  1. CLI 能真登录、真提交、真查列表，且能断言 Java 侧数据库状态确实变化（回放保真度验证）；
  2. 能确定性触发两类错误：会话过期（401 → CLI 自动重登）、业务错误（`code != 0` → upstream 结构化报错）；
  3. Java 程序员友好：一条命令启动、SQL 可见、H2 console 可查。
- **非目标（YAGNI）**：HTML 页面、Spring Security、Swagger/OpenAPI、Docker、用户注册/管理后台、真实邮件审批流。

## 2. 技术栈

- Maven + Java 17 + Spring Boot 3.x（最新稳定 3.3.x）；
- 依赖：`spring-boot-starter-web`、`spring-boot-starter-data-jpa`、`h2`（runtime）、`spring-boot-starter-test`（test）；
- 端口 `8080`，无 context-path，对齐 spec 的 `baseUrl: http://localhost:8080`；
- H2 内存库（`jdbc:h2:mem:leavedb`），开启 H2 web console（`/h2-console`）与 SQL 日志。

## 3. 工程结构

工程根目录：`mock-leave-server/`（与 leo-cli npm 包平级、互相独立）。

```
mock-leave-server/
  pom.xml
  README.md
  src/main/java/com/example/leave/
    LeaveMockApplication.java
    common/
      ApiResponse.java          # 统一信封 {code,msg,data}，静态 ok()/fail()
      BusinessException.java    # 携带 code 的业务错误
      GlobalExceptionHandler.java
    auth/
      AuthController.java       # POST /api/login
      SessionInterceptor.java   # 校验 JSESSIONID token
      SessionRegistry.java      # token -> SessionInfo（并发 Map）
      SessionInfo.java          # username、empName、绑定的 csrf token
      WebConfig.java            # 注册拦截器，放行 /api/login、/api/dev/**、/h2-console/**
    user/
      UserDirectory.java        # 预置账号（内存 Map，application.yml 可配）
    leave/
      LeaveController.java      # GET /api/leave/form、POST /api/leave/apply、GET /api/leave/list
      LeaveService.java
      LeaveRecord.java          # JPA 实体
      LeaveRecordRepository.java
    dev/
      DevController.java        # POST /api/dev/session/expire
  src/main/resources/
    application.yml             # 账号配置走 UserDirectory 绑定，无需 data.sql
  src/test/java/com/example/leave/
    LeaveFlowSmokeTest.java
```

## 4. 接口契约（严格对齐 skill.json）

统一响应信封：

```json
{ "code": 0, "msg": "ok", "data": { } }
```

- 业务成功/业务失败：HTTP **恒 200**，靠 `code` 区分（模拟常见中文 web 系统习惯，让 CLI 必须实现 `responseContract` 才能翻译错误）；
- 鉴权类失败：HTTP **401/403**，让 CLI 能区分「该重登」与「业务报错」；
- 所有响应 JSON 字段名与 POC spec 示例完全一致。

### 4.1 `POST /api/login`

- 无需鉴权；`Content-Type: application/x-www-form-urlencoded`，字段 `username`、`password`；
- 成功：HTTP 200，`Set-Cookie: JSESSIONID=<uuid>; Path=/; HttpOnly`，响应：
  ```json
  { "code": 0, "msg": "ok", "data": { "username": "zhangsan", "empName": "张三" } }
  ```
  token 注册进 `SessionRegistry`；同一用户重复登录生成新 token（旧 token 不主动失效）。
- 失败（账号不存在/密码错）：HTTP 200，`{ "code": 4001, "msg": "账号或密码错误", "data": null }`，**不写 cookie**。

### 4.2 `GET /api/leave/form`

- 需鉴权；为当前会话生成并绑定一个 CSRF token（存入 `SessionInfo`，覆盖旧值）；
- 响应：
  ```json
  { "code": 0, "msg": "ok",
    "data": {
      "token": "5f3c...（uuid）",
      "types": [
        { "code": "1", "name": "事假" },
        { "code": "2", "name": "病假" },
        { "code": "3", "name": "年假" }
      ]
    } }
  ```

### 4.3 `POST /api/leave/apply`

- 需鉴权；`Content-Type: application/json`；请求头必须带 `X-CSRF-Token: <form 返回的 token>`；
- 请求体（对齐 spec）：
  ```json
  { "startDate": "2026-09-20", "endDate": "2026-09-20",
    "typeCode": "1", "reason": "个人事务" }
  ```
- **CSRF token 一次性**：校验通过后立即从会话中清除；重复使用或不匹配 → HTTP 403 `{code:4003,msg:"CSRF token 无效或已过期"}`；
- 成功：落库一条记录（`status=PENDING`），HTTP 200：
  ```json
  { "code": 0, "msg": "ok",
    "data": { "id": 1, "startDate": "...", "endDate": "...",
              "typeCode": "1", "typeName": "事假",
              "reason": "...", "status": "PENDING", "createdAt": "..." } }
  ```
- 规则型业务错误（HTTP 200，`code != 0`）：
  | code | 触发条件 | msg |
  |---|---|---|
  | 1002 | startDate/endDate/reason 缺失，或日期非 `yyyy-MM-dd` | 参数不完整或格式错误 |
  | 1001 | endDate 早于 startDate | 结束日期不能早于开始日期 |
  | 2001 | typeCode=3（年假）且 请假天数 > 个人年假余额 | 年假余额不足 |

  请假天数按自然日 `endDate - startDate + 1` 计算。

### 4.4 `GET /api/leave/list`

- 需鉴权；第一版**不分页**（忽略/接受 `page` 参数不报错，为引擎留余量），返回当前登录人的全部记录，按 `createdAt` 倒序：
  ```json
  { "code": 0, "msg": "ok",
    "data": { "list": [ { ...记录... } ], "total": 2 } }
  ```

### 4.5 `POST /api/dev/session/expire`（dev 端点）

- 无需鉴权（mock 便利设施，仅本地使用）；读取请求 cookie 中的 `JSESSIONID` 并从 registry 移除；
- 响应 `{ "code": 0, "msg": "ok", "data": { "expired": true } }`；
- 用途：CLI 集成测试中确定性验证「401 → 自动重登一次 → 重试成功」，无需等待真实超时。

## 5. 会话模型

- 自管 token，**不使用** Servlet `HttpSession`、不引入 Spring Security；
- `SessionRegistry`：`ConcurrentHashMap<String token, SessionInfo>`；`SessionInfo{ username, empName, csrf }`；
- `SessionInterceptor` 拦截 `/api/leave/**`：无 cookie / token 不在 registry → HTTP 401 `{code:401,msg:"未登录或会话已过期"}`；
- 拦截器把当前 `SessionInfo` 写入 request attribute，供 controller/service 取用当前用户；
- 服务重启 registry 与 H2 数据同时清空，状态自洽。

## 6. 数据模型

`LeaveRecord`（表 `leave_record`）：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | Long，自增主键 | |
| applicant | varchar(64) | 申请人 username（工号） |
| startDate | date | |
| endDate | date | |
| typeCode | varchar(8) | 1事假/2病假/3年假 |
| typeName | varchar(16) | 提交时落库，避免字典漂移 |
| reason | varchar(500) | |
| status | varchar(16) | 固定 `PENDING`（POC 无审批流） |
| createdAt | timestamp | 序列化为 ISO-8601 本地时间字符串（如 `2026-09-18T10:30:00`） |

预置账号（`UserDirectory` 内存配置，`application.yml` 可覆盖）：

| username | password | empName | 年假余额（天） |
|---|---|---|---|
| zhangsan | 123456 | 张三 | 5 |
| lisi | 123456 | 李四 | 0（必触发 2001） |

## 7. 错误处理

- `BusinessException(code, msg)` 由 service 抛出；`GlobalExceptionHandler` 捕获后包成 `{code,msg,data:null}`，HTTP 200；
- 401/403 由拦截器/CSRF 校验直接写响应（不经业务信封的 200 通道）；
- 未知异常：HTTP 500 `{code:500,msg:"服务器内部错误"}`，异常堆栈打日志（mock 本地环境，不做脱敏）。

## 8. 配置（application.yml）

```yaml
server:
  port: 8080
spring:
  datasource:
    url: jdbc:h2:mem:leavedb
    driver-class-name: org.h2.Driver
    username: sa
    password: ""
  jpa:
    hibernate:
      ddl-auto: create-drop
    show-sql: true
    properties:
      hibernate.format_sql: true
  h2:
    console:
      enabled: true        # /h2-console 可直接查表
leave:
  mock:
    users:
      - { username: zhangsan, password: "123456", emp-name: 张三, annual-balance: 5 }
      - { username: lisi,     password: "123456", emp-name: 李四, annual-balance: 0 }
```

## 9. 测试

工程自带一个 `@SpringBootTest`（MockMvc 或全量 RestTemplate 均可，取 MockMvc 更快）冒烟测试，覆盖：

1. **主链路**：登录拿到 cookie → GET form 拿 csrf → POST apply 成功（200/code=0）→ GET list 能看到该记录；并通过注入 `LeaveRecordRepository` 断言库里确实多一条、字段一致；
2. **登录失败**：错误密码 → `code=4001`，无 Set-Cookie；
3. **未登录**：不带 cookie 调 list → HTTP 401；
4. **CSRF 一次性**：同一 token 连续提交两次 → 第二次 403/4003；
5. **业务错误**：lisi 登录提交 1 天年假 → `code=2001`；end 早于 start → `code=1001`；缺 reason → `code=1002`；
6. **dev 过期**：登录后调 `/api/dev/session/expire`，再调 list → 401；重新登录后恢复。

CLI 侧对本服务的端到端集成测试属于 leo-cli 工程，不在本工程内，但本服务的契约（字段名、cookie 名、code）必须与之严格对齐，后续不随意改动。

## 10. 运行与交付

- 启动：`mvn spring-boot:run`（JDK 17）；
- README 内容：预置账号表、5 个端点的 curl 示例（含 cookie/CSRF 完整流程）、dev 过期用法、H2 console 入口与连接串；
- 交付物：`mock-leave-server/` 整个 Maven 工程 + 本设计文档；
- DoD：
  - [ ] `mvn spring-boot:run` 一键启动于 8080；
  - [ ] curl 走通「登录 → form → apply → list」全链路；
  - [ ] H2 console 中可查到提交记录；
  - [ ] dev/expire 后下一次请求确定返回 401；
  - [ ] 1001/1002/2001/4001/4003 五条错误路径均可复现；
  - [ ] 工程自带冒烟测试全绿。
