# saicmotor-cli 网关中心架构 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 saicmotor-cli 从「每系统一份 baseUrl+auth 的单系统 POC」重构为「网关中心」：mock 网关 + leave 后端 + CLI（catalog/SKILL.md/auth 全局化），并端到端打通「登录 → 查余额 → 提交请假」。

**Architecture:** 两个 Spring 服务（mock 网关 8081、leave 后端 8080）+ 一个 Node CLI。CLI 用全局一份 gateway+token 连网关，业务接口由包内 `catalog/services/*.json` 描述、编排由 `skills/*/SKILL.md` 描述。网关解析 token → 注入 `X-User-Id` header → 转发 leave 后端。

**Tech Stack:** Java 17 + Spring Boot 3.3.5（mock 网关、leave 后端）；Node 20 + TypeScript + commander + zod + vitest（CLI）。

---

## 环境约定（Windows 本机，务必遵守）

- **Java 17 与 JAVA_HOME**：本机 `JAVA_HOME` 默认指向 JDK 12，会挡住 Spring Boot 3.3.5 构建。**每次跑 Maven 前先覆盖**：
  ```bash
  export JAVA_HOME="/c/Program Files/Java/jdk-17"
  ```
  验证：`./mvnw -v` 应显示 `Java version: 17.0.10`。（`PATH` 上的 `java` 已是 17，但 Maven 走 `JAVA_HOME`，别用系统 `mvn` —— 它绑定 JDK 12 且 Maven 3.6.1 过旧。）
- **mock-gateway 用 wrapper**：`mock-gateway/` 是新建工程，没有 wrapper。Task 5 第一步直接复制 `mock-leave-server/` 的 `mvnw`、`mvnw.cmd`、`.mvn/` 到 `mock-gateway/`，之后一律 `./mvnw`。
- **Node**：本机 node v24 / npm 11，`saicmotor-cli` 用 `npm run build`（tsc）和 `npx vitest run`。

---

## 约定（全项目）

- **响应信封**（网关 + leave 后端统一）：`{ "code": 0, "msg": "ok", "data": ... }`。`code == 0` = 成功，`code != 0` = 业务错误（HTTP 恒 200）；鉴权失败 HTTP 401。
- **user_id 下传**：网关解析 token 得 `user_id`，注入 header `X-User-Id` 转发；leave 后端读 `X-User-Id`。
- **token**：mock 简化，`base64url({"sub":user_id,"username":...,"exp":...})`，不签名。
- **命令名**：`saicmotor <service.name> <resource> <method>`，如 `saicmotor leave balance query`。
- **目录**：`mock-gateway/`（新建）、`mock-leave-server/`（改造）、`saicmotor-cli/`（重构）。

---

# Phase 1：leave 后端改造（mock-leave-server，端口 8080）

从 cookie/CSRF 模型改成 token/user_id-header 模型。产出：`GET /leave/balance`、`POST /leave/applications`，读 `X-User-Id`。

### Task 1: 精简工程（去 JPA/H2/CSRF）

**Files:**
- Modify: `mock-leave-server/pom.xml`
- Modify: `mock-leave-server/src/main/resources/application.yml`
- Delete: `mock-leave-server/src/main/java/com/example/leave/common/CsrfException.java`
- Modify: `mock-leave-server/src/main/java/com/example/leave/common/GlobalExceptionHandler.java`

- [ ] **Step 1: 删掉 CsrfException.java**

Run: `rm mock-leave-server/src/main/java/com/example/leave/common/CsrfException.java`

- [ ] **Step 2: 改 pom.xml（去掉 data-jpa 和 h2）**

把 `pom.xml` 的 `<dependencies>` 整段替换为：

```xml
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
```

- [ ] **Step 3: 改 application.yml（去掉 datasource/jpa/h2，保留账号数据）**

`application.yml` 整体替换为：

```yaml
server:
  port: 8080

leave:
  mock:
    users:
      - { username: zhangsan, emp-name: 张三, annual-balance: 5 }
      - { username: lisi,     emp-name: 李四, annual-balance: 0 }
```

- [ ] **Step 4: 改 GlobalExceptionHandler.java（去掉 CsrfException handler）**

整文件替换为：

```java
package com.example.leave.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(BusinessException.class)
    public ApiResponse<Void> handleBusiness(BusinessException e) {
        return ApiResponse.fail(e.getCode(), e.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleOther(Exception e) {
        log.error("unhandled exception", e);
        return ResponseEntity.status(500).body(ApiResponse.fail(500, "服务器内部错误"));
    }
}
```

- [ ] **Step 5: 编译验证**

Run: `cd mock-leave-server && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q compile`
Expected: 成功（现有测试 `GlobalExceptionHandlerTest.java` / `LeaveMockApplicationTests.java` 可能引用已删的 CsrfException，下一步处理）。

- [ ] **Step 6: 修/删旧测试**

查看并删除引用 CsrfException / cookie 的旧测试（`mock-leave-server/src/test/java/com/example/leave/common/GlobalExceptionHandlerTest.java`，`LeaveMockApplicationTests.java` 若仅 `contextLoads` 可保留）。用 `grep -rl "Csrf\|JSESSIONID\|SessionRegistry" mock-leave-server/src/test` 定位。

- [ ] **Step 7: Commit**

```bash
cd D:/work/things/2026.09.17.custom-cli
git add mock-leave-server/pom.xml mock-leave-server/src/main/resources/application.yml mock-leave-server/src/main mock-leave-server/src/test
git commit -m "refactor(mock-leave-server): drop cookie/CSRF model, keep web-only stack"
```

### Task 2: UserDirectory（用户目录）

**Files:**
- Create: `mock-leave-server/src/main/java/com/example/leave/user/UserDirectory.java`
- Test: `mock-leave-server/src/test/java/com/example/leave/user/UserDirectoryTest.java`

- [ ] **Step 1: 写失败测试**

```java
package com.example.leave.user;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class UserDirectoryTest {

    @Test
    void findReturnsUserByUsername() {
        UserDirectory d = new UserDirectory();
        d.setUsers(java.util.List.of(
            new UserDirectory.UserInfo("zhangsan", "张三", 5),
            new UserDirectory.UserInfo("lisi", "李四", 0)));
        UserDirectory.UserInfo u = d.find("zhangsan");
        assertEquals("张三", u.empName());
        assertEquals(5, u.annualBalance());
    }

    @Test
    void findReturnsNullWhenMissing() {
        UserDirectory d = new UserDirectory();
        d.setUsers(java.util.List.of());
        assertNull(d.find("nobody"));
    }
}
```

Run: `cd mock-leave-server && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=UserDirectoryTest`
Expected: 编译失败（UserDirectory 不存在）。

- [ ] **Step 2: 实现 UserDirectory**

```java
package com.example.leave.user;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "leave.mock")
public class UserDirectory {

    private List<UserInfo> users;

    public record UserInfo(String username, String empName, int annualBalance) {}

    public List<UserInfo> getUsers() { return users; }
    public void setUsers(List<UserInfo> users) { this.users = users; }

    public UserInfo find(String userId) {
        if (users == null) return null;
        return users.stream()
            .filter(u -> u.username().equals(userId))
            .findFirst()
            .orElse(null);
    }
}
```

- [ ] **Step 3: 跑测试**

Run: `cd mock-leave-server && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=UserDirectoryTest`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add mock-leave-server/src/main/java/com/example/leave/user mock-leave-server/src/test/java/com/example/leave/user
git commit -m "feat(mock-leave-server): add UserDirectory from config"
```

### Task 3: LeaveService（余额 + 提交业务逻辑）

**Files:**
- Create: `mock-leave-server/src/main/java/com/example/leave/leave/LeaveApplication.java`
- Create: `mock-leave-server/src/main/java/com/example/leave/leave/LeaveService.java`
- Test: `mock-leave-server/src/test/java/com/example/leave/leave/LeaveServiceTest.java`

- [ ] **Step 1: 写失败测试**

```java
package com.example.leave.leave;

import com.example.leave.common.BusinessException;
import com.example.leave.user.UserDirectory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;

class LeaveServiceTest {

    private LeaveService service;

    @BeforeEach
    void setUp() {
        UserDirectory d = new UserDirectory();
        d.setUsers(List.of(new UserDirectory.UserInfo("zhangsan", "张三", 5)));
        service = new LeaveService(d);
    }

    @Test
    void balanceReturnsAnnualBalance() {
        var resp = service.balance("zhangsan");
        assertEquals(0, resp.getCode());
        assertEquals(5, ((Map<?, ?>) resp.getData()).get("annual_balance"));
        assertEquals(0, ((Map<?, ?>) resp.getData()).get("used"));
    }

    @Test
    void submitStoresApplicationAndIncrementsUsed() {
        service.submit("zhangsan", Map.of("start_date", "2026-09-21", "end_date", "2026-09-22", "reason", "年假"));
        var resp = service.balance("zhangsan");
        assertEquals(2, ((Map<?, ?>) resp.getData()).get("used"));
    }

    @Test
    void submitRejectsEndBeforeStart() {
        assertThrows(BusinessException.class, () ->
            service.submit("zhangsan", Map.of("start_date", "2026-09-22", "end_date", "2026-09-21", "reason", "x")));
    }

    @Test
    void submitRejectsMissingField() {
        assertThrows(BusinessException.class, () ->
            service.submit("zhangsan", Map.of("start_date", "2026-09-21", "end_date", "2026-09-22")));
    }
}
```

Run: `cd mock-leave-server && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=LeaveServiceTest`
Expected: 编译失败（LeaveService 不存在）。

- [ ] **Step 2: 实现 LeaveApplication**

```java
package com.example.leave.leave;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

public record LeaveApplication(String id, String startDate, String endDate, String reason, String status) {
    public int days() {
        LocalDate s = LocalDate.parse(startDate);
        LocalDate e = LocalDate.parse(endDate);
        return (int) ChronoUnit.DAYS.between(s, e) + 1;
    }
}
```

- [ ] **Step 3: 实现 LeaveService**

```java
package com.example.leave.leave;

import com.example.leave.common.ApiResponse;
import com.example.leave.common.BusinessException;
import com.example.leave.user.UserDirectory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class LeaveService {

    private final UserDirectory userDirectory;
    private final AtomicInteger seq = new AtomicInteger(0);
    private final Map<String, List<LeaveApplication>> applications = new ConcurrentHashMap<>();

    public LeaveService(UserDirectory userDirectory) {
        this.userDirectory = userDirectory;
    }

    public ApiResponse<Map<String, Object>> balance(String userId) {
        UserDirectory.UserInfo u = userDirectory.find(userId);
        if (u == null) throw new BusinessException(404, "用户不存在");
        int used = applications.getOrDefault(userId, List.of())
            .stream().mapToInt(LeaveApplication::days).sum();
        return ApiResponse.ok(Map.of("annual_balance", u.annualBalance(), "used", used));
    }

    public ApiResponse<Map<String, Object>> submit(String userId, Map<String, String> body) {
        UserDirectory.UserInfo u = userDirectory.find(userId);
        if (u == null) throw new BusinessException(404, "用户不存在");

        String start = body.get("start_date");
        String end = body.get("end_date");
        String reason = body.get("reason");
        if (start == null || end == null || reason == null
                || !isDate(start) || !isDate(end)) {
            throw new BusinessException(1002, "参数不完整或格式错误");
        }
        if (end.compareTo(start) < 0) {
            throw new BusinessException(1001, "结束日期不能早于开始日期");
        }

        LeaveApplication app = new LeaveApplication(
            "APP-" + seq.incrementAndGet(), start, end, reason, "PENDING");
        applications.computeIfAbsent(userId, k -> new ArrayList<>()).add(app);
        return ApiResponse.ok(Map.of("application_id", app.id(), "status", app.status()));
    }

    private static boolean isDate(String s) {
        try {
            LocalDate.parse(s);
            return true;
        } catch (DateTimeParseException e) {
            return false;
        }
    }
}
```

- [ ] **Step 4: 跑测试**

Run: `cd mock-leave-server && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=LeaveServiceTest`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add mock-leave-server/src/main/java/com/example/leave/leave mock-leave-server/src/test/java/com/example/leave/leave
git commit -m "feat(mock-leave-server): add balance + submit leave logic"
```

### Task 4: LeaveController + 冒烟测试

**Files:**
- Create: `mock-leave-server/src/main/java/com/example/leave/leave/LeaveController.java`
- Test: `mock-leave-server/src/test/java/com/example/leave/LeaveFlowSmokeTest.java`

- [ ] **Step 1: 写失败测试（MockMvc 全链路）**

```java
package com.example.leave;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class LeaveFlowSmokeTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void balanceWithoutUserIdReturns401() throws Exception {
        mvc.perform(get("/leave/balance"))
            .andExpect(status().isUnauthorized())
            .andExpect(jsonPath("$.code").value(401));
    }

    @Test
    void balanceReturnsAnnualBalanceForZhangsan() throws Exception {
        mvc.perform(get("/leave/balance").header("X-User-Id", "zhangsan"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.annual_balance").value(5));
    }

    @Test
    void submitThenBalanceReflectsUsed() throws Exception {
        mvc.perform(post("/leave/applications")
                .header("X-User-Id", "zhangsan")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"start_date\":\"2026-09-21\",\"end_date\":\"2026-09-22\",\"reason\":\"年假\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.status").value("PENDING"));

        mvc.perform(get("/leave/balance").header("X-User-Id", "zhangsan"))
            .andExpect(jsonPath("$.data.used").value(2));
    }

    @Test
    void submitRejectsEndBeforeStart() throws Exception {
        mvc.perform(post("/leave/applications")
                .header("X-User-Id", "zhangsan")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"start_date\":\"2026-09-22\",\"end_date\":\"2026-09-21\",\"reason\":\"x\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(1001));
    }
}
```

Run: `cd mock-leave-server && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=LeaveFlowSmokeTest`
Expected: 编译失败（LeaveController 不存在）。

- [ ] **Step 2: 实现 LeaveController**

```java
package com.example.leave.leave;

import com.example.leave.common.ApiResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/leave")
public class LeaveController {

    private final LeaveService service;

    public LeaveController(LeaveService service) {
        this.service = service;
    }

    @GetMapping("/balance")
    public ResponseEntity<ApiResponse<Map<String, Object>>> balance(
            @RequestHeader(value = "X-User-Id", required = false) String userId) {
        if (userId == null) {
            return ResponseEntity.status(401).body(ApiResponse.<Map<String, Object>>fail(401, "未登录或会话已过期"));
        }
        return ResponseEntity.ok(service.balance(userId));
    }

    @PostMapping("/applications")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submit(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody Map<String, String> body) {
        if (userId == null) {
            return ResponseEntity.status(401).body(ApiResponse.<Map<String, Object>>fail(401, "未登录或会话已过期"));
        }
        return ResponseEntity.ok(service.submit(userId, body));
    }
}
```

- [ ] **Step 3: 跑测试**

Run: `cd mock-leave-server && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=LeaveFlowSmokeTest`
Expected: PASS。

- [ ] **Step 4: 全量测试**

Run: `cd mock-leave-server && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test`
Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add mock-leave-server/src/main/java/com/example/leave/leave/LeaveController.java mock-leave-server/src/test/java/com/example/leave/LeaveFlowSmokeTest.java
git commit -m "feat(mock-leave-server): expose balance/submit via X-User-Id header"
```

---

# Phase 2：mock 网关（mock-gateway，端口 8081）

新建 Spring Boot 工程，实现 login + token 解析 + `X-User-Id` 注入 + 转发 leave 后端。

### Task 5: 工程骨架

**Files:**
- Copy: `mock-leave-server/{mvnw,mvnw.cmd,.mvn/}` → `mock-gateway/`
- Create: `mock-gateway/pom.xml`
- Create: `mock-gateway/src/main/resources/application.yml`
- Create: `mock-gateway/src/main/java/com/example/gateway/GatewayApplication.java`

- [ ] **Step 0: 复制 Maven wrapper + git 配置（mock-gateway 没有，用 mock-leave-server 的）**

```bash
cd /d/work/things/2026.09.17.custom-cli
cp mock-leave-server/mvnw mock-gateway/ && cp mock-leave-server/mvnw.cmd mock-gateway/
cp mock-leave-server/.gitignore mock-leave-server/.gitattributes mock-gateway/
cp -r mock-leave-server/.mvn mock-gateway/
```
Expected: `mock-gateway/` 下出现 `mvnw`、`mvnw.cmd`、`.gitignore`、`.gitattributes`、`.mvn/`。

- [ ] **Step 1: 写 pom.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.3.5</version>
        <relativePath/>
    </parent>

    <groupId>com.example</groupId>
    <artifactId>mock-gateway</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>mock-gateway</name>
    <description>saicmotor-cli 网关 mock</description>

    <properties>
        <java.version>17</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>
```

- [ ] **Step 2: 写 application.yml**

```yaml
server:
  port: 8081

gateway:
  leave-backend: http://localhost:8080
  users:
    - { username: zhangsan, password: "123456", user-id: zhangsan }
    - { username: lisi,     password: "123456", user-id: lisi }
```

- [ ] **Step 3: 写 GatewayApplication**

```java
package com.example.gateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class GatewayApplication {
    public static void main(String[] args) {
        SpringApplication.run(GatewayApplication.class, args);
    }
}
```

- [ ] **Step 4: 编译验证**

Run: `cd mock-gateway && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q compile`
Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git add mock-gateway/pom.xml mock-gateway/src/main/resources/application.yml mock-gateway/src/main/java/com/example/gateway/GatewayApplication.java \
        mock-gateway/mvnw mock-gateway/mvnw.cmd mock-gateway/.gitignore mock-gateway/.gitattributes mock-gateway/.mvn
git commit -m "feat(mock-gateway): spring boot skeleton"
```

### Task 6: TokenService（签发/解析 token）

**Files:**
- Create: `mock-gateway/src/main/java/com/example/gateway/auth/TokenService.java`
- Test: `mock-gateway/src/test/java/com/example/gateway/auth/TokenServiceTest.java`

- [ ] **Step 1: 写失败测试**

```java
package com.example.gateway.auth;

import org.junit.jupiter.api.Test;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import static org.junit.jupiter.api.Assertions.*;

class TokenServiceTest {

    private final TokenService service = new TokenService();

    @Test
    void issueThenParseRoundTrips() {
        String token = service.issue("zhangsan", "zhangsan");
        assertEquals("zhangsan", service.parseUserId(token));
    }

    @Test
    void parseGarbageReturnsNull() {
        assertNull(service.parseUserId("not-a-valid-token"));
    }

    @Test
    void parseExpiredReturnsNull() {
        String payload = "{\"sub\":\"zhangsan\",\"exp\":1}";
        String expired = Base64.getUrlEncoder().withoutPadding()
            .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        assertNull(service.parseUserId(expired));
    }
}
```

Run: `cd mock-gateway && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=TokenServiceTest`
Expected: 编译失败（TokenService 不存在）。

- [ ] **Step 2: 实现 TokenService**

```java
package com.example.gateway.auth;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

@Component
public class TokenService {

    private static final long TTL_MS = 3_600_000L;
    private final ObjectMapper mapper = new ObjectMapper();

    public String issue(String username, String userId) {
        String payload = "{\"sub\":\"" + userId + "\",\"username\":\"" + username
            + "\",\"exp\":" + (System.currentTimeMillis() + TTL_MS) + "}";
        return Base64.getUrlEncoder().withoutPadding()
            .encodeToString(payload.getBytes(StandardCharsets.UTF_8));
    }

    public String parseUserId(String token) {
        try {
            byte[] decoded = Base64.getUrlDecoder().decode(token);
            JsonNode node = mapper.readTree(new String(decoded, StandardCharsets.UTF_8));
            if (node.path("exp").asLong() < System.currentTimeMillis()) return null;
            return node.path("sub").asText();
        } catch (Exception e) {
            return null;
        }
    }
}
```

- [ ] **Step 3: 跑测试**

Run: `cd mock-gateway && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=TokenServiceTest`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add mock-gateway/src/main/java/com/example/gateway/auth/TokenService.java mock-gateway/src/test/java/com/example/gateway/auth/TokenServiceTest.java
git commit -m "feat(mock-gateway): token issue/parse"
```

### Task 7: UserDirectory + AuthController（登录）

**Files:**
- Create: `mock-gateway/src/main/java/com/example/gateway/auth/UserDirectory.java`
- Create: `mock-gateway/src/main/java/com/example/gateway/auth/AuthController.java`
- Test: `mock-gateway/src/test/java/com/example/gateway/auth/AuthControllerTest.java`

- [ ] **Step 1: 写失败测试**

```java
package com.example.gateway.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerTest {

    @Autowired
    private MockMvc mvc;

    @Test
    void loginSuccessReturnsToken() throws Exception {
        mvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"zhangsan\",\"password\":\"123456\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(0))
            .andExpect(jsonPath("$.data.token").isNotEmpty());
    }

    @Test
    void loginWrongPasswordReturns4001() throws Exception {
        mvc.perform(post("/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"zhangsan\",\"password\":\"wrong\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.code").value(4001));
    }
}
```

Run: `cd mock-gateway && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=AuthControllerTest`
Expected: 编译失败（AuthController 不存在）。

- [ ] **Step 2: 实现 UserDirectory**

```java
package com.example.gateway.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.util.List;

@Component
@ConfigurationProperties(prefix = "gateway")
public class UserDirectory {

    private List<User> users;

    public static class User {
        private String username;
        private String password;
        private String userId;
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
        public String getUserId() { return userId; }
        public void setUserId(String userId) { this.userId = userId; }
    }

    public List<User> getUsers() { return users; }
    public void setUsers(List<User> users) { this.users = users; }

    public User findByUsername(String username) {
        if (users == null) return null;
        return users.stream().filter(u -> u.getUsername().equals(username)).findFirst().orElse(null);
    }
}
```

- [ ] **Step 3: 实现 AuthController**

```java
package com.example.gateway.auth;

import org.springframework.web.bind.annotation.*;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class AuthController {

    private final UserDirectory userDirectory;
    private final TokenService tokenService;

    public AuthController(UserDirectory userDirectory, TokenService tokenService) {
        this.userDirectory = userDirectory;
        this.tokenService = tokenService;
    }

    @PostMapping("/auth/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String password = body.get("password");
        UserDirectory.User user = userDirectory.findByUsername(username);
        if (user == null || !user.getPassword().equals(password)) {
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("code", 4001);
            resp.put("msg", "账号或密码错误");
            resp.put("data", null);
            return resp;
        }
        String token = tokenService.issue(username, user.getUserId());
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("code", 0);
        resp.put("msg", "ok");
        resp.put("data", Map.of("token", token));
        return resp;
    }
}
```

- [ ] **Step 4: 跑测试**

Run: `cd mock-gateway && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=AuthControllerTest`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add mock-gateway/src/main/java/com/example/gateway/auth/UserDirectory.java mock-gateway/src/main/java/com/example/gateway/auth/AuthController.java mock-gateway/src/test/java/com/example/gateway/auth/AuthControllerTest.java
git commit -m "feat(mock-gateway): auth login issuing token"
```

### Task 8: ForwardClient + GatewayFilter（鉴权 + 注入 + 转发）

**Files:**
- Create: `mock-gateway/src/main/java/com/example/gateway/gateway/ForwardClient.java`
- Create: `mock-gateway/src/main/java/com/example/gateway/gateway/GatewayFilter.java`
- Create: `mock-gateway/src/main/java/com/example/gateway/gateway/GatewayConfig.java`
- Test: `mock-gateway/src/test/java/com/example/gateway/gateway/GatewayFilterTest.java`

- [ ] **Step 1: 写失败测试**

```java
package com.example.gateway.gateway;

import com.example.gateway.auth.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class GatewayFilterTest {

    @Test
    void forwardsWithInjectedUserId() throws Exception {
        TokenService tokens = mock(TokenService.class);
        when(tokens.parseUserId("tok")).thenReturn("zhangsan");
        ForwardClient client = mock(ForwardClient.class);
        when(client.forward(eq("GET"), eq("http://localhost:8080/leave/balance"), isNull(), any(), eq("zhangsan")))
            .thenReturn(new ForwardClient.ForwardResponse(200, "application/json", "{\"code\":0}".getBytes()));

        GatewayFilter filter = new GatewayFilter(tokens, client, "http://localhost:8080");
        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/leave/balance");
        req.addHeader("Authorization", "Bearer tok");
        MockHttpServletResponse res = new MockHttpServletResponse();

        filter.doFilter(req, res, (rq, rs) -> {});

        assertEquals(200, res.getStatus());
        verify(client).forward(eq("GET"), eq("http://localhost:8080/leave/balance"), isNull(), any(), eq("zhangsan"));
    }

    @Test
    void missingTokenReturns401WithoutForwarding() throws Exception {
        TokenService tokens = mock(TokenService.class);
        ForwardClient client = mock(ForwardClient.class);
        GatewayFilter filter = new GatewayFilter(tokens, client, "http://localhost:8080");

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/leave/balance");
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, (rq, rs) -> {});

        assertEquals(401, res.getStatus());
        verify(client, never()).forward(anyString(), anyString(), any(), any(), any());
    }

    @Test
    void invalidTokenReturns401() throws Exception {
        TokenService tokens = mock(TokenService.class);
        when(tokens.parseUserId("bad")).thenReturn(null);
        ForwardClient client = mock(ForwardClient.class);
        GatewayFilter filter = new GatewayFilter(tokens, client, "http://localhost:8080");

        MockHttpServletRequest req = new MockHttpServletRequest("GET", "/leave/balance");
        req.addHeader("Authorization", "Bearer bad");
        MockHttpServletResponse res = new MockHttpServletResponse();
        filter.doFilter(req, res, (rq, rs) -> {});

        assertEquals(401, res.getStatus());
        verify(client, never()).forward(anyString(), anyString(), any(), any(), any());
    }
}
```

Run: `cd mock-gateway && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=GatewayFilterTest`
Expected: 编译失败（ForwardClient / GatewayFilter 不存在）。

- [ ] **Step 2: 实现 ForwardClient**

```java
package com.example.gateway.gateway;

import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class ForwardClient {

    private final RestClient client = RestClient.create();

    public record ForwardResponse(int status, String contentType, byte[] body) {}

    public ForwardResponse forward(String method, String url, String contentType, byte[] body, String userId) {
        RestClient.RequestBodySpec spec = client.method(HttpMethod.valueOf(method))
            .uri(url)
            .header("X-User-Id", userId);
        if (contentType != null) spec.header("Content-Type", contentType);
        if (body != null && body.length > 0) spec.body(body);
        ResponseEntity<byte[]> e = spec.retrieve().toEntity(byte[].class);
        return new ForwardResponse(e.getStatusCode().value(), e.getHeaders().getFirst("Content-Type"), e.getBody());
    }
}
```

- [ ] **Step 3: 实现 GatewayFilter**

```java
package com.example.gateway.gateway;

import com.example.gateway.auth.TokenService;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;

@Component
public class GatewayFilter implements Filter {

    private final TokenService tokenService;
    private final ForwardClient forwardClient;
    private final String leaveBackend;

    public GatewayFilter(TokenService tokenService, ForwardClient forwardClient,
                         @Value("${gateway.leave-backend}") String leaveBackend) {
        this.tokenService = tokenService;
        this.forwardClient = forwardClient;
        this.leaveBackend = leaveBackend;
    }

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;

        String auth = req.getHeader("Authorization");
        if (auth == null || !auth.startsWith("Bearer ")) {
            writeJson(res, 401, "{\"code\":401,\"msg\":\"未登录或 token 缺失\",\"data\":null}");
            return;
        }
        String userId = tokenService.parseUserId(auth.substring(7));
        if (userId == null) {
            writeJson(res, 401, "{\"code\":401,\"msg\":\"未登录或会话已过期\",\"data\":null}");
            return;
        }

        String query = req.getQueryString();
        String target = leaveBackend + req.getRequestURI() + (query != null ? "?" + query : "");
        byte[] body = req.getInputStream().readAllBytes();

        ForwardClient.ForwardResponse upstream = forwardClient.forward(
            req.getMethod(), target, req.getContentType(), body, userId);

        res.setStatus(upstream.status());
        if (upstream.contentType() != null) res.setContentType(upstream.contentType());
        res.getOutputStream().write(upstream.body() == null ? new byte[0] : upstream.body());
    }

    private void writeJson(HttpServletResponse res, int status, String json) throws IOException {
        res.setStatus(status);
        res.setContentType("application/json");
        res.getWriter().write(json);
    }
}
```

- [ ] **Step 4: 实现 GatewayConfig（注册 Filter 到 /leave/*）**

```java
package com.example.gateway.gateway;

import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GatewayConfig {

    @Bean
    public FilterRegistrationBean<GatewayFilter> gatewayFilterRegistration(GatewayFilter filter) {
        FilterRegistrationBean<GatewayFilter> reg = new FilterRegistrationBean<>(filter);
        reg.addUrlPatterns("/leave/*");
        return reg;
    }
}
```

- [ ] **Step 5: 跑测试**

Run: `cd mock-gateway && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test -Dtest=GatewayFilterTest`
Expected: PASS。

- [ ] **Step 6: 全量测试**

Run: `cd mock-gateway && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q test`
Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
git add mock-gateway/src/main/java/com/example/gateway/gateway mock-gateway/src/test/java/com/example/gateway/gateway
git commit -m "feat(mock-gateway): forward leave with X-User-Id injection"
```

### Task 9: 手工冒烟（curl 验证网关 + leave 全链路）

- [ ] **Step 1: 起 leave 后端**

Run: `cd mock-leave-server && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q spring-boot:run &`
Expected: 8080 启动，无报错。

- [ ] **Step 2: 起网关**

Run: `cd mock-gateway && export JAVA_HOME="/c/Program Files/Java/jdk-17" && ./mvnw -q spring-boot:run &`
Expected: 8081 启动。

- [ ] **Step 3: 登录拿 token**

Run: `curl -s -X POST http://localhost:8081/auth/login -H "Content-Type: application/json" -d '{"username":"zhangsan","password":"123456"}'`
Expected: `{"code":0,"msg":"ok","data":{"token":"eyJzdWIi..."}}`（复制 token）。

- [ ] **Step 4: 带 token 查余额**

Run: `curl -s http://localhost:8081/leave/balance -H "Authorization: Bearer <上一步 token>"`
Expected: `{"code":0,"msg":"ok","data":{"annual_balance":5,"used":0}}`。

- [ ] **Step 5: 带 token 提交请假**

Run: `curl -s -X POST http://localhost:8081/leave/applications -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"start_date":"2026-09-21","end_date":"2026-09-22","reason":"年假"}'`
Expected: `{"code":0,"msg":"ok","data":{"application_id":"APP-1","status":"PENDING"}}`。

- [ ] **Step 6: 无 token 访问应 401**

Run: `curl -s http://localhost:8081/leave/balance`
Expected: `{"code":401,...}`。

- [ ] **Step 7: 停掉两个服务**（`Ctrl+C` 或 kill）。

Phase 1+2 完成，可独立验证，不依赖 CLI。

---

# Phase 3：saicmotor-cli 重构（CLI）

### Task 10: catalog zod schema（替换旧 skill schema）

**Files:**
- Create: `saicmotor-cli/src/schema/catalog.ts`
- Test: `saicmotor-cli/test/unit/catalog-schema.test.ts`
- Delete: `saicmotor-cli/src/schema/skill.ts`（本任务末尾删）
- Delete: `saicmotor-cli/test/unit/schema.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect } from "vitest";
import { ServiceSchema } from "../../src/schema/catalog";

const valid = {
  name: "leave",
  servicePath: "/leave",
  resources: {
    balance: {
      methods: {
        query: {
          id: "balance.query",
          path: "/balance",
          httpMethod: "GET",
          responseBody: { annual_balance: { type: "integer", example: 5 } },
        },
      },
    },
    applications: {
      methods: {
        submit: {
          id: "applications.submit",
          path: "/applications",
          httpMethod: "POST",
          requestBody: { start_date: { type: "string", required: true } },
        },
      },
    },
  },
};

describe("ServiceSchema", () => {
  it("accepts a valid service", () => {
    expect(ServiceSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects missing servicePath", () => {
    const { servicePath, ...rest } = valid;
    expect(ServiceSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects unknown httpMethod", () => {
    const bad = { ...valid, resources: { balance: { methods: { query: { ...valid.resources.balance.methods.query, httpMethod: "FOO" } } } } };
    expect(ServiceSchema.safeParse(bad).success).toBe(false);
  });
});
```

Run: `cd saicmotor-cli && npx vitest run test/unit/catalog-schema.test.ts`
Expected: FAIL（无法导入 catalog schema）。

- [ ] **Step 2: 实现 schema**

`src/schema/catalog.ts`：

```ts
import { z } from "zod";

export const FieldSchema = z.object({
  type: z.enum(["string", "integer", "number", "boolean"]),
  description: z.string().optional(),
  required: z.boolean().optional(),
  example: z.unknown().optional(),
});

export const MethodSchema = z.object({
  id: z.string(),
  path: z.string(),
  httpMethod: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  description: z.string().optional(),
  requestBody: z.record(z.string(), FieldSchema).optional(),
  responseBody: z.record(z.string(), FieldSchema).optional(),
});

export const ResourceSchema = z.object({
  methods: z.record(z.string(), MethodSchema),
});

export const ServiceSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  servicePath: z.string(),
  resources: z.record(z.string(), ResourceSchema),
});

export type Field = z.infer<typeof FieldSchema>;
export type Method = z.infer<typeof MethodSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Service = z.infer<typeof ServiceSchema>;
```

- [ ] **Step 3: 跑测试**

Run: `cd saicmotor-cli && npx vitest run test/unit/catalog-schema.test.ts`
Expected: PASS。

- [ ] **Step 4: 删旧 schema 及其测试**

Run: `rm saicmotor-cli/src/schema/skill.ts saicmotor-cli/test/unit/schema.test.ts`

- [ ] **Step 5: Commit**

```bash
git add saicmotor-cli/src/schema/catalog.ts saicmotor-cli/test/unit/catalog-schema.test.ts
git add -u saicmotor-cli/src/schema/skill.ts saicmotor-cli/test/unit/schema.test.ts
git commit -m "feat(cli): replace skill schema with gateway catalog schema"
```

### Task 11: 包内 catalog + skill 落地

**Files:**
- Create: `saicmotor-cli/catalog/services/leave.json`
- Create: `saicmotor-cli/skills/leave/SKILL.md`

- [ ] **Step 1: 写 catalog/services/leave.json**

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
            "used": { "type": "integer", "example": 3 }
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
            "end_date": { "type": "string", "required": true, "example": "2026-09-22" },
            "reason": { "type": "string", "required": true, "example": "年假" }
          },
          "responseBody": {
            "application_id": { "type": "string", "example": "APP-001" },
            "status": { "type": "string", "example": "PENDING" }
          }
        }
      }
    }
  }
}
```

- [ ] **Step 2: 写 skills/leave/SKILL.md**

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

- [ ] **Step 3: Commit**

```bash
git add saicmotor-cli/catalog saicmotor-cli/skills
git commit -m "feat(cli): bundle leave catalog + skill"
```

### Task 12: 全局 config（gateway + auth 策略）

**Files:**
- Create: `saicmotor-cli/src/config.ts`
- Test: `saicmotor-cli/test/unit/config.test.ts`
- Delete: `saicmotor-cli/src/engine/config.ts`（本任务末尾删）
- Delete: `saicmotor-cli/test/unit/config.test.ts`（旧的，被替换）

- [ ] **Step 1: 写失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, saicmotorDir } from "../../src/config";

describe("config", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-")); process.env.SAICMOTOR_HOME = tmp; });
  afterEach(() => { delete process.env.SAICMOTOR_HOME; delete process.env.SAICMOTOR_GATEWAY; fs.rmSync(tmp, { recursive: true, force: true }); });

  it("defaults gateway to localhost:8081", () => {
    expect(loadConfig().gateway).toBe("http://localhost:8081");
  });

  it("overrides gateway from config file", () => {
    fs.writeFileSync(path.join(saicmotorDir(), "config.json"), JSON.stringify({ gateway: "http://gw.example.com" }));
    expect(loadConfig().gateway).toBe("http://gw.example.com");
  });

  it("env var has highest precedence", () => {
    process.env.SAICMOTOR_GATEWAY = "http://env.example.com";
    expect(loadConfig().gateway).toBe("http://env.example.com");
  });
});
```

Run: `cd saicmotor-cli && npx vitest run test/unit/config.test.ts`
Expected: FAIL（无法导入 config）。

- [ ] **Step 2: 实现 config**

`src/config.ts`：

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AuthConfig {
  type: "password";
  loginPath: string;
  tokenPath: string;
  tokenHeader: string;
  tokenPrefix: string;
}

export interface Config {
  gateway: string;
  auth: AuthConfig;
}

export const DEFAULT_CONFIG: Config = {
  gateway: "http://localhost:8081",
  auth: {
    type: "password",
    loginPath: "/auth/login",
    tokenPath: "data.token",
    tokenHeader: "Authorization",
    tokenPrefix: "Bearer",
  },
};

export function saicmotorDir(): string {
  return process.env.SAICMOTOR_HOME ?? path.join(os.homedir(), ".saicmotor");
}

export function configPath(): string {
  return path.join(saicmotorDir(), "config.json");
}

export function loadConfig(): Config {
  let user: Partial<Config> = {};
  try {
    user = JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    /* use defaults */
  }
  const gateway = process.env.SAICMOTOR_GATEWAY ?? user.gateway ?? DEFAULT_CONFIG.gateway;
  const auth = { ...DEFAULT_CONFIG.auth, ...(user.auth ?? {}) };
  return { gateway, auth };
}

export function catalogDir(): string {
  return process.env.SAICMOTOR_CATALOG ?? path.join(__dirname, "..", "catalog", "services");
}

export function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/_/g, "-");
}

export function toCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
```

- [ ] **Step 3: 跑测试**

Run: `cd saicmotor-cli && npx vitest run test/unit/config.test.ts`
Expected: PASS。

- [ ] **Step 4: 删旧 config**

Run: `rm saicmotor-cli/src/engine/config.ts`

- [ ] **Step 5: Commit**

```bash
git add saicmotor-cli/src/config.ts saicmotor-cli/test/unit/config.test.ts
git add -u saicmotor-cli/src/engine/config.ts
git commit -m "feat(cli): global config with gateway + auth"
```

### Task 13: auth 模块（store / login / session / transport）

**Files:**
- Create: `saicmotor-cli/src/auth/store.ts`（重写为全局 token+凭证）
- Create: `saicmotor-cli/src/auth/login.ts`
- Create: `saicmotor-cli/src/auth/session.ts`
- Create: `saicmotor-cli/src/auth/transport.ts`
- Test: `saicmotor-cli/test/unit/auth-store.test.ts`（替换旧的）
- Test: `saicmotor-cli/test/unit/auth-login.test.ts`
- Delete: `saicmotor-cli/src/engine/session.ts`（本任务末尾删）
- Delete: `saicmotor-cli/test/unit/session.test.ts`

- [ ] **Step 1: 写 auth-store 失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeToken, readToken, clearToken, writeCredentials, readCredentials } from "../../src/auth/store";

describe("auth store", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-")); process.env.SAICMOTOR_HOME = tmp; });
  afterEach(() => { delete process.env.SAICMOTOR_HOME; delete process.env.SAICMOTOR_USERNAME; delete process.env.SAICMOTOR_PASSWORD; fs.rmSync(tmp, { recursive: true, force: true }); });

  it("round-trips token", () => {
    writeToken("tok-123");
    expect(readToken()).toBe("tok-123");
    clearToken();
    expect(readToken()).toBeUndefined();
  });

  it("round-trips credentials", () => {
    writeCredentials({ username: "zhangsan", password: "123456" });
    expect(readCredentials()).toEqual({ username: "zhangsan", password: "123456" });
  });

  it("reads credentials from env", () => {
    process.env.SAICMOTOR_USERNAME = "u";
    process.env.SAICMOTOR_PASSWORD = "p";
    expect(readCredentials()).toEqual({ username: "u", password: "p" });
  });
});
```

Run: `cd saicmotor-cli && npx vitest run test/unit/auth-store.test.ts`
Expected: FAIL（auth/store.ts 还是旧的 per-system 版本）。

- [ ] **Step 2: 重写 src/auth/store.ts**

```ts
import fs from "node:fs";
import path from "node:path";
import { saicmotorDir } from "../config";

export interface Credentials {
  username: string;
  password: string;
}

function credentialsFile(): string {
  return path.join(saicmotorDir(), "credentials.json");
}

function tokenFile(): string {
  return path.join(saicmotorDir(), "token.json");
}

export function writeCredentials(creds: Credentials): void {
  fs.mkdirSync(path.dirname(credentialsFile()), { recursive: true });
  fs.writeFileSync(credentialsFile(), JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function readCredentials(): Credentials | undefined {
  const envUser = process.env.SAICMOTOR_USERNAME;
  const envPass = process.env.SAICMOTOR_PASSWORD;
  if (envUser && envPass) return { username: envUser, password: envPass };
  try {
    const raw = JSON.parse(fs.readFileSync(credentialsFile(), "utf8"));
    if (typeof raw.username === "string" && typeof raw.password === "string") {
      return { username: raw.username, password: raw.password };
    }
  } catch {
    /* not found */
  }
  return undefined;
}

export function clearCredentials(): void {
  try { fs.rmSync(credentialsFile(), { force: true }); } catch { /* ignore */ }
}

export function writeToken(token: string): void {
  fs.mkdirSync(path.dirname(tokenFile()), { recursive: true });
  fs.writeFileSync(tokenFile(), JSON.stringify({ token }, null, 2), { mode: 0o600 });
}

export function readToken(): string | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(tokenFile(), "utf8"));
    if (typeof raw.token === "string" && raw.token.length > 0) return raw.token;
  } catch {
    /* not found */
  }
  return undefined;
}

export function clearToken(): void {
  try { fs.rmSync(tokenFile(), { force: true }); } catch { /* ignore */ }
}
```

- [ ] **Step 3: 跑 auth-store 测试**

Run: `cd saicmotor-cli && npx vitest run test/unit/auth-store.test.ts`
Expected: PASS。

- [ ] **Step 4: 写 auth-login + auth-session 失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../src/config";
import { login } from "../../src/auth/login";
import { ensureToken } from "../../src/auth/session";
import { writeCredentials, writeToken, clearToken } from "../../src/auth/store";
import { startServer, MockServer } from "../helpers/server";

describe("auth login + session", () => {
  let tmp: string;
  let server: MockServer | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-"));
    process.env.SAICMOTOR_HOME = tmp;
    process.env.SAICMOTOR_GATEWAY = "";
  });
  afterEach(async () => {
    delete process.env.SAICMOTOR_HOME;
    delete process.env.SAICMOTOR_GATEWAY;
    fs.rmSync(tmp, { recursive: true, force: true });
    await server?.close();
  });

  it("login fetches and caches token", async () => {
    server = await startServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, msg: "ok", data: { token: "tok-abc" } }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    const token = await login(config, "zhangsan", "123456");
    expect(token).toBe("tok-abc");
    expect(readTokenFromHome(tmp)).toBe("tok-abc");
  });

  it("login throws on code != 0", async () => {
    server = await startServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 4001, msg: "账号或密码错误", data: null }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    await expect(login(config, "zhangsan", "bad")).rejects.toThrow(/账号或密码错误/);
  });

  it("ensureToken reuses cached token without login", async () => {
    writeToken("cached-tok");
    writeCredentials({ username: "zhangsan", password: "123456" });
    let logins = 0;
    server = await startServer((_req, res) => {
      logins++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, data: { token: "tok" } }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    expect(await ensureToken(config)).toBe("cached-tok");
    expect(logins).toBe(0);
  });

  it("ensureToken logs in when no cached token", async () => {
    clearToken();
    writeCredentials({ username: "zhangsan", password: "123456" });
    server = await startServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, data: { token: "fresh-tok" } }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    expect(await ensureToken(config)).toBe("fresh-tok");
  });

  it("ensureToken throws when no credentials", async () => {
    clearToken();
    fs.rmSync(path.join(tmp, "credentials.json"), { force: true });
    const config = { ...loadConfig(), gateway: "http://localhost:1" };
    await expect(ensureToken(config)).rejects.toThrow(/auth login/);
  });
});

function readTokenFromHome(home: string): string | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(home, "token.json"), "utf8"));
    return raw.token;
  } catch { return undefined; }
}
```

Run: `cd saicmotor-cli && npx vitest run test/unit/auth-login.test.ts`
Expected: FAIL（login / session 模块不存在）。

- [ ] **Step 5: 实现 login / session / transport**

`src/auth/login.ts`：

```ts
import type { Config } from "../config";
import { SaicmotorError } from "../engine/errors";
import { send } from "../engine/http";
import { getByPath } from "../engine/extract";
import { writeToken } from "./store";

export async function login(config: Config, username: string, password: string): Promise<string> {
  const resp = await send({
    method: "POST",
    url: config.gateway + config.auth.loginPath,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (resp.status >= 400) {
    throw new SaicmotorError("auth", `登录失败 (HTTP ${resp.status})`, { hint: "检查网关地址或账号密码" });
  }
  const body = resp.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object" && body.code !== 0) {
    throw new SaicmotorError("auth", `登录失败: ${body.msg ?? "未知错误"}`, { hint: "检查账号密码" });
  }
  const token = getByPath(body, config.auth.tokenPath);
  if (typeof token !== "string" || token.length === 0) {
    throw new SaicmotorError("auth", "登录响应中未找到 token", { hint: `检查 tokenPath 配置: ${config.auth.tokenPath}` });
  }
  writeToken(token);
  return token;
}
```

`src/auth/session.ts`：

```ts
import type { Config } from "../config";
import { SaicmotorError } from "../engine/errors";
import { readToken, readCredentials } from "./store";
import { login } from "./login";

export async function ensureToken(config: Config, opts: { force?: boolean } = {}): Promise<string> {
  const cached = opts.force ? undefined : readToken();
  if (cached) return cached;
  const creds = readCredentials();
  if (!creds) {
    throw new SaicmotorError("auth", "未登录，请先运行: saicmotor auth login --username <工号> --password <密码>");
  }
  return login(config, creds.username, creds.password);
}
```

`src/auth/transport.ts`：

```ts
import type { Config } from "../config";

export function applyAuth(headers: Record<string, string>, config: Config, token: string): Record<string, string> {
  headers[config.auth.tokenHeader] = `${config.auth.tokenPrefix} ${token}`;
  return headers;
}
```

- [ ] **Step 6: 跑测试**

Run: `cd saicmotor-cli && npx vitest run test/unit/auth-store.test.ts test/unit/auth-login.test.ts`
Expected: PASS。

- [ ] **Step 7: 删旧 session 及其测试**

Run: `rm saicmotor-cli/src/engine/session.ts saicmotor-cli/test/unit/session.test.ts`

- [ ] **Step 8: Commit**

```bash
git add saicmotor-cli/src/auth saicmotor-cli/test/unit/auth-store.test.ts saicmotor-cli/test/unit/auth-login.test.ts
git add -u saicmotor-cli/src/engine/session.ts saicmotor-cli/test/unit/session.test.ts
git commit -m "feat(cli): global auth (store/login/session/transport)"
```

### Task 14: engine 改造（catalog 加载 + request + run）

**Files:**
- Create: `saicmotor-cli/src/engine/catalog.ts`
- Create: `saicmotor-cli/src/engine/request.ts`（重写）
- Create: `saicmotor-cli/src/engine/run.ts`（重写）
- Test: `saicmotor-cli/test/unit/catalog-load.test.ts`
- Test: `saicmotor-cli/test/unit/request.test.ts`（替换旧的）
- Test: `saicmotor-cli/test/unit/run.test.ts`（替换旧的）
- Delete: `saicmotor-cli/src/engine/spec.ts`、`saicmotor-cli/src/engine/template.ts`
- Delete: `saicmotor-cli/test/unit/spec.test.ts`、`saicmotor-cli/test/unit/template.test.ts`

- [ ] **Step 1: 写 catalog-load 失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCatalog } from "../../src/engine/catalog";

describe("loadCatalog", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-")); process.env.SAICMOTOR_CATALOG = tmp; });
  afterEach(() => { delete process.env.SAICMOTOR_CATALOG; fs.rmSync(tmp, { recursive: true, force: true }); });

  it("loads valid services", () => {
    fs.writeFileSync(path.join(tmp, "leave.json"), JSON.stringify({
      name: "leave", servicePath: "/leave",
      resources: { balance: { methods: { query: { id: "balance.query", path: "/balance", httpMethod: "GET" } } } },
    }));
    const services = loadCatalog();
    expect(services).toHaveLength(1);
    expect(services[0].name).toBe("leave");
  });

  it("throws on invalid catalog", () => {
    fs.writeFileSync(path.join(tmp, "bad.json"), JSON.stringify({ name: "bad" }));
    expect(() => loadCatalog()).toThrow(/catalog 校验失败/);
  });

  it("returns empty when dir missing", () => {
    fs.rmSync(tmp, { recursive: true, force: true });
    expect(loadCatalog()).toEqual([]);
  });
});
```

Run: `cd saicmotor-cli && npx vitest run test/unit/catalog-load.test.ts`
Expected: FAIL（engine/catalog 不存在）。

- [ ] **Step 2: 实现 engine/catalog.ts**

```ts
import fs from "node:fs";
import path from "node:path";
import { ServiceSchema, type Service } from "../schema/catalog";
import { SaicmotorError } from "./errors";
import { catalogDir } from "../config";

export function loadCatalog(): Service[] {
  const dir = catalogDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const services: Service[] = [];
  for (const f of files) {
    const file = path.join(dir, f);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      throw new SaicmotorError("spec", `无法加载 catalog: ${file}`);
    }
    const result = ServiceSchema.safeParse(raw);
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
      throw new SaicmotorError("spec", `catalog 校验失败 (${file}): ${detail}`);
    }
    services.push(result.data);
  }
  return services;
}
```

- [ ] **Step 3: 跑 catalog-load 测试**

Run: `cd saicmotor-cli && npx vitest run test/unit/catalog-load.test.ts`
Expected: PASS。

- [ ] **Step 4: 写 request 失败测试**

```ts
import { describe, it, expect } from "vitest";
import { coerceFields, buildBody, buildUrl } from "../../src/engine/request";
import { loadConfig } from "../../src/config";
import type { Method } from "../../src/schema/catalog";

const config = { ...loadConfig(), gateway: "http://gw" };

describe("request", () => {
  it("builds url from gateway + servicePath + path", () => {
    const m: Method = { id: "b.q", path: "/balance", httpMethod: "GET" };
    expect(buildUrl(config, "/leave", m)).toBe("http://gw/leave/balance");
  });

  it("coerces string and integer fields", () => {
    const fields = {
      start_date: { type: "string" as const, required: true },
      days: { type: "integer" as const },
    };
    expect(coerceFields(fields, { start_date: "2026-09-21", days: "3" })).toEqual({ start_date: "2026-09-21", days: 3 });
  });

  it("throws on missing required field", () => {
    const fields = { start_date: { type: "string" as const, required: true } };
    expect(() => coerceFields(fields, {})).toThrow(/缺少必填参数/);
  });

  it("builds JSON body from requestBody fields", () => {
    const m: Method = {
      id: "a.s", path: "/applications", httpMethod: "POST",
      requestBody: { start_date: { type: "string" }, reason: { type: "string" } },
    };
    expect(buildBody(m, { start_date: "2026-09-21", reason: "年假" })).toBe('{"start_date":"2026-09-21","reason":"年假"}');
  });
});
```

Run: `cd saicmotor-cli && npx vitest run test/unit/request.test.ts`
Expected: FAIL（engine/request 是旧 buildRequest）。

- [ ] **Step 5: 重写 engine/request.ts**

```ts
import type { Config } from "../config";
import type { Method, Field } from "../schema/catalog";
import { SaicmotorError } from "./errors";

export function buildUrl(config: Config, servicePath: string, method: Method): string {
  return config.gateway + servicePath + method.path;
}

export function coerceFields(fields: Record<string, Field>, raw: Record<string, string | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    const value = raw[name];
    if (value === undefined) {
      if (field.required) throw new SaicmotorError("validation", `缺少必填参数: ${name}`);
      continue;
    }
    switch (field.type) {
      case "integer": {
        const n = Number(value);
        if (!Number.isInteger(n)) throw new SaicmotorError("validation", `参数 ${name} 应为整数，实际: ${value}`);
        out[name] = n;
        break;
      }
      case "number": {
        const n = Number(value);
        if (Number.isNaN(n)) throw new SaicmotorError("validation", `参数 ${name} 应为数字，实际: ${value}`);
        out[name] = n;
        break;
      }
      case "boolean":
        out[name] = value === "true" || value === "1";
        break;
      default:
        out[name] = value;
    }
  }
  return out;
}

export function buildBody(method: Method, values: Record<string, unknown>): string | undefined {
  if (!method.requestBody) return undefined;
  const body: Record<string, unknown> = {};
  for (const name of Object.keys(method.requestBody)) {
    if (values[name] !== undefined) body[name] = values[name];
  }
  return JSON.stringify(body);
}
```

- [ ] **Step 6: 跑 request 测试**

Run: `cd saicmotor-cli && npx vitest run test/unit/request.test.ts`
Expected: PASS。

- [ ] **Step 7: 写 run 失败测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMethod } from "../../src/engine/run";
import { loadConfig } from "../../src/config";
import { writeCredentials } from "../../src/auth/store";
import { startServer, MockServer } from "../helpers/server";
import type { Service, Method } from "../../src/schema/catalog";

const service: Service = {
  name: "leave", servicePath: "/leave",
  resources: { balance: { methods: { query: { id: "balance.query", path: "/balance", httpMethod: "GET" } } } },
};
const method = service.resources.balance.methods.query;

describe("runMethod", () => {
  let tmp: string;
  let server: MockServer | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-"));
    process.env.SAICMOTOR_HOME = tmp;
    writeCredentials({ username: "zhangsan", password: "123456" });
  });
  afterEach(async () => { delete process.env.SAICMOTOR_HOME; fs.rmSync(tmp, { recursive: true, force: true }); await server?.close(); });

  it("returns data on success with bearer token", async () => {
    server = await startServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/auth/login") return res.end(JSON.stringify({ code: 0, data: { token: "tok" } }));
      const auth = req.headers.authorization ?? "";
      if (auth !== "Bearer tok") { res.statusCode = 401; return res.end(JSON.stringify({ code: 401 })); }
      res.end(JSON.stringify({ code: 0, data: { annual_balance: 5 } }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    const result = await runMethod(config, service, method, {});
    expect(result.data).toEqual({ annual_balance: 5 });
    const bal = server!.requests.find((r) => r.url === "/leave/balance")!;
    expect(bal.headers["authorization"]).toBe("Bearer tok");
  });

  it("relogs in on 401 and retries", async () => {
    let logins = 0;
    server = await startServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/auth/login") { logins++; return res.end(JSON.stringify({ code: 0, data: { token: "tok2" } })); }
      const auth = req.headers.authorization ?? "";
      if (auth === "Bearer tok2") return res.end(JSON.stringify({ code: 0, data: { ok: true } }));
      res.statusCode = 401;
      res.end(JSON.stringify({ code: 401 }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    const result = await runMethod(config, service, method, {});
    expect(result.data).toEqual({ ok: true });
    expect(logins).toBe(1);
  });

  it("throws upstream error when code != 0", async () => {
    server = await startServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/auth/login") return res.end(JSON.stringify({ code: 0, data: { token: "tok" } }));
      res.end(JSON.stringify({ code: 2001, msg: "年假余额不足" }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    await expect(runMethod(config, service, method, {})).rejects.toThrow(/年假余额不足/);
  });

  it("dry-run returns request without sending", async () => {
    const config = { ...loadConfig(), gateway: "http://localhost:1" };
    const result = await runMethod(config, service, method, {}, { dryRun: true });
    expect((result.data as any).dryRun).toBe(true);
  });
});
```

Run: `cd saicmotor-cli && npx vitest run test/unit/run.test.ts`
Expected: FAIL（run.ts 还是旧 runCommand）。

- [ ] **Step 8: 重写 engine/run.ts**

```ts
import type { Config } from "../config";
import type { Service, Method } from "../schema/catalog";
import { SaicmotorError } from "./errors";
import { send, type HttpResponse } from "./http";
import { ensureToken } from "../auth/session";
import { applyAuth } from "../auth/transport";
import { clearToken } from "../auth/store";
import { buildUrl, coerceFields, buildBody } from "./request";

export interface RunResult {
  ok: true;
  data: unknown;
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === "object") return String((body as Record<string, unknown>).msg ?? "");
  return undefined;
}

function checkEnvelope(resp: HttpResponse): void {
  if (resp.status >= 400) {
    throw new SaicmotorError("upstream", `上游返回 HTTP ${resp.status}`, { upstream: { message: extractMessage(resp.body) } });
  }
  const body = resp.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object" && body.code !== 0) {
    throw new SaicmotorError("upstream", `上游业务错误: ${body.msg ?? ""}`, { upstream: { code: body.code, message: body.msg } });
  }
}

async function execute(config: Config, servicePath: string, method: Method, token: string, values: Record<string, unknown>): Promise<HttpResponse> {
  const url = buildUrl(config, servicePath, method);
  const headers: Record<string, string> = {};
  const body = buildBody(method, values);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  applyAuth(headers, config, token);
  return send({ method: method.httpMethod, url, headers, body });
}

export async function runMethod(
  config: Config,
  service: Service,
  method: Method,
  raw: Record<string, string | undefined>,
  opts: { dryRun?: boolean } = {},
): Promise<RunResult> {
  const values = coerceFields(method.requestBody ?? {}, raw);
  if (opts.dryRun) {
    return {
      ok: true,
      data: {
        dryRun: true,
        request: { method: method.httpMethod, url: buildUrl(config, service.servicePath, method), body: buildBody(method, values) },
      },
    };
  }
  let token = await ensureToken(config);
  let resp = await execute(config, service.servicePath, method, token, values);
  if (resp.status === 401) {
    clearToken();
    token = await ensureToken(config, { force: true });
    resp = await execute(config, service.servicePath, method, token, values);
  }
  checkEnvelope(resp);
  return { ok: true, data: (resp.body as Record<string, unknown> | undefined)?.data };
}
```

- [ ] **Step 9: 跑 run 测试**

Run: `cd saicmotor-cli && npx vitest run test/unit/run.test.ts`
Expected: PASS。

- [ ] **Step 10: 删旧 spec/template 及其测试**

Run: `rm saicmotor-cli/src/engine/spec.ts saicmotor-cli/src/engine/template.ts saicmotor-cli/test/unit/spec.test.ts saicmotor-cli/test/unit/template.test.ts`

- [ ] **Step 11: Commit**

```bash
git add saicmotor-cli/src/engine/catalog.ts saicmotor-cli/src/engine/request.ts saicmotor-cli/src/engine/run.ts saicmotor-cli/test/unit/catalog-load.test.ts saicmotor-cli/test/unit/request.test.ts saicmotor-cli/test/unit/run.test.ts
git add -u saicmotor-cli/src/engine/spec.ts saicmotor-cli/src/engine/template.ts saicmotor-cli/test/unit/spec.test.ts saicmotor-cli/test/unit/template.test.ts
git commit -m "feat(cli): engine loads catalog and runs methods with auth"
```

### Task 15: CLI 命令注册 + auth 子命令

**Files:**
- Create: `saicmotor-cli/src/cli/error.ts`
- Create: `saicmotor-cli/src/cli/auth.ts`
- Modify: `saicmotor-cli/src/cli/index.ts`（重写）
- Delete: `saicmotor-cli/src/gen/md.ts`、`saicmotor-cli/test/unit/gen-md.test.ts`

- [ ] **Step 1: 写 error.ts**

```ts
import { SaicmotorError } from "../engine/errors";
import { formatEnvelope } from "../engine/output";

export function handleError(e: unknown): void {
  if (e instanceof SaicmotorError) {
    console.error(formatEnvelope(false, undefined, { type: e.category, message: e.message, hint: e.hint, upstream: e.upstream }));
    process.exit(e.exitCode);
  }
  console.error(String(e));
  process.exit(1);
}
```

- [ ] **Step 2: 写 auth.ts**

```ts
import type { Command } from "commander";
import { loadConfig } from "../config";
import { writeCredentials, clearCredentials, clearToken, readToken } from "../auth/store";
import { login } from "../auth/login";
import { handleError } from "./error";

export function registerAuth(program: Command): void {
  const authCmd = program.command("auth").description("登录认证");

  authCmd.command("login")
    .requiredOption("--username <u>", "工号")
    .requiredOption("--password <p>", "密码")
    .action(async (opts: { username: string; password: string }) => {
      try {
        const config = loadConfig();
        writeCredentials({ username: opts.username, password: opts.password });
        const token = await login(config, opts.username, opts.password);
        console.log(`已登录，token 已缓存（${token.slice(0, 8)}…）`);
      } catch (e) { handleError(e); }
    });

  authCmd.command("logout").action(() => {
    try {
      clearToken();
      clearCredentials();
      console.log("已登出");
    } catch (e) { handleError(e); }
  });

  authCmd.command("status").action(() => {
    try {
      console.log(readToken() ? "已登录" : "未登录");
    } catch (e) { handleError(e); }
  });
}
```

- [ ] **Step 3: 重写 cli/index.ts**

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, toKebab, toCamel } from "../config";
import { loadCatalog } from "../engine/catalog";
import { runMethod } from "../engine/run";
import { formatJson, formatTable, formatEnvelope } from "../engine/output";
import { registerAuth } from "./auth";
import { handleError } from "./error";

const program = new Command();
program.name("saicmotor").description("把无源码业务网页系统包装成 CLI").version("0.2.0");

const config = loadConfig();
const services = loadCatalog();

for (const service of services) {
  const svc = program.command(service.name).description(service.title ?? service.name);
  for (const [resourceName, resource] of Object.entries(service.resources)) {
    const resCmd = svc.command(resourceName);
    for (const [methodName, method] of Object.entries(resource.methods)) {
      const isWrite = method.httpMethod !== "GET";
      const leaf = resCmd.command(methodName).description(method.description ?? "");
      leaf.option("--format <f>", "输出格式 json|table|pretty", "json");
      leaf.option("--dry-run", "只预览请求不发送");
      if (isWrite) leaf.option("--yes", "跳过写操作确认");
      for (const [fieldName, field] of Object.entries(method.requestBody ?? {})) {
        leaf.option(`--${toKebab(fieldName)} <value>`, field.description ?? fieldName);
      }
      leaf.action(async (opts: Record<string, unknown>) => {
        try {
          if (isWrite && !opts.dryRun && !opts.yes) {
            console.error("该命令有副作用，加 --yes 确认，或加 --dry-run 预览");
            process.exit(1);
          }
          const raw: Record<string, string | undefined> = {};
          for (const fieldName of Object.keys(method.requestBody ?? {})) {
            raw[fieldName] = opts[toCamel(toKebab(fieldName))] as string | undefined;
          }
          const result = await runMethod(config, service, method, raw, { dryRun: !!opts.dryRun });
          const fmt = String(opts.format ?? "json");
          if (fmt === "table") console.log(formatTable(result.data));
          else if (fmt === "pretty") console.log(formatJson(result.data, true));
          else console.log(formatEnvelope(true, result.data));
        } catch (e) { handleError(e); }
      });
    }
  }
}

registerAuth(program);
program.parseAsync(process.argv).catch(handleError);
```

- [ ] **Step 4: 删 gen/md 及其测试**

Run: `rm saicmotor-cli/src/gen/md.ts saicmotor-cli/test/unit/gen-md.test.ts`（`src/gen/` 目录若空则一并删）。

- [ ] **Step 5: 编译 + 全量测试**

Run: `cd saicmotor-cli && npm run build && npx vitest run`
Expected: 编译通过，测试全绿（旧 `examples/leave/skill.json` 与 `test/fixtures/leave-skill.json` 已无引用，可删）。

- [ ] **Step 6: 删遗留旧文件**

Run: `rm -f saicmotor-cli/examples/leave/skill.json saicmotor-cli/test/fixtures/leave-skill.json saicmotor-cli/test/integration/leave.test.ts`
（integration 测试在 Task 17 重写。）

- [ ] **Step 7: Commit**

```bash
git add saicmotor-cli/src/cli saicmotor-cli/src/engine/output.ts
git add -u saicmotor-cli/src/gen saicmotor-cli/test/unit/gen-md.test.ts saicmotor-cli/examples saicmotor-cli/test/fixtures saicmotor-cli/test/integration
git commit -m "feat(cli): register catalog commands + auth subcommands"
```

---

# Phase 4：端到端

### Task 16: 集成测试（node:http mock 网关）

**Files:**
- Create: `saicmotor-cli/test/integration/leave-gateway.test.ts`

- [ ] **Step 1: 写集成测试**

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../src/config";
import { loadCatalog } from "../../src/engine/catalog";
import { runMethod } from "../../src/engine/run";
import { writeCredentials } from "../../src/auth/store";
import { startServer, MockServer } from "../helpers/server";

describe("leave through gateway end-to-end", () => {
  let tmp: string;
  let server: MockServer | undefined;
  const apps: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-"));
    process.env.SAICMOTOR_HOME = tmp;
    process.env.SAICMOTOR_CATALOG = path.join(process.cwd(), "catalog", "services");
    writeCredentials({ username: "zhangsan", password: "123456" });
    apps.length = 0;
  });
  afterEach(async () => {
    delete process.env.SAICMOTOR_HOME;
    delete process.env.SAICMOTOR_CATALOG;
    fs.rmSync(tmp, { recursive: true, force: true });
    await server?.close();
  });

  function mockGateway() {
    return startServer((req, res, ctx) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/auth/login") {
        return res.end(JSON.stringify({ code: 0, msg: "ok", data: { token: "tok-zhangsan" } }));
      }
      const auth = req.headers.authorization ?? "";
      if (auth !== "Bearer tok-zhangsan") {
        res.statusCode = 401;
        return res.end(JSON.stringify({ code: 401, msg: "未登录" }));
      }
      if (req.url === "/leave/balance") {
        return res.end(JSON.stringify({ code: 0, data: { annual_balance: 5, used: apps.length } }));
      }
      if (req.url === "/leave/applications") {
        const body = JSON.parse(ctx.body || "{}");
        apps.push({ ...body, application_id: "APP-1", status: "PENDING" });
        return res.end(JSON.stringify({ code: 0, data: { application_id: "APP-1", status: "PENDING" } }));
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 404, msg: "not found" }));
    });
  }

  it("balance then submit round-trips through gateway", async () => {
    server = await mockGateway();
    const config = { ...loadConfig(), gateway: server!.url };
    const [service] = loadCatalog();
    const balanceMethod = service.resources.balance.methods.query;
    const submitMethod = service.resources.applications.methods.submit;

    const bal = await runMethod(config, service, balanceMethod, {});
    expect((bal.data as any).annual_balance).toBe(5);

    const sub = await runMethod(config, service, submitMethod, { start_date: "2026-09-21", end_date: "2026-09-22", reason: "年假" });
    expect((sub.data as any).application_id).toBe("APP-1");

    expect(server!.requests.filter((r) => r.url === "/auth/login")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑集成测试**

Run: `cd saicmotor-cli && npx vitest run test/integration/leave-gateway.test.ts`
Expected: PASS。

- [ ] **Step 3: 全量测试**

Run: `cd saicmotor-cli && npx vitest run`
Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add saicmotor-cli/test/integration/leave-gateway.test.ts
git commit -m "test(cli): integration test leave-through-gateway"
```

### Task 17: 手工端到端（真实 Spring 网关）

- [ ] **Step 1: 起 leave 后端 + 网关**（同 Task 9 Step 1-2）。

- [ ] **Step 2: 登录**

Run: `cd saicmotor-cli && npx tsx src/cli/index.ts auth login --username zhangsan --password 123456`
Expected: `已登录，token 已缓存（...）`。

- [ ] **Step 3: 查余额**

Run: `npx tsx src/cli/index.ts leave balance query`
Expected: `{"ok":true,"data":{"annual_balance":5,"used":0}}`。

- [ ] **Step 4: 提交请假**

Run: `npx tsx src/cli/index.ts leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --yes`
Expected: `{"ok":true,"data":{"application_id":"APP-1","status":"PENDING"}}`。

- [ ] **Step 5: 再查余额（used 变 2）**

Run: `npx tsx src/cli/index.ts leave balance query`
Expected: `used: 2`。

- [ ] **Step 6: 登出**

Run: `npx tsx src/cli/index.ts auth logout`
Expected: `已登出`。

- [ ] **Step 7: 停服务**。

---

## 完成标准（DoD）

- [ ] `mock-leave-server`：`./mvnw test` 全绿；`GET /leave/balance`、`POST /leave/applications` 经 `X-User-Id` 工作。
- [ ] `mock-gateway`：`./mvnw test` 全绿；`/auth/login` 发 token，`/leave/*` 解析 token 注入 `X-User-Id` 转发。
- [ ] `saicmotor-cli`：`npm run build` 通过，`npx vitest run` 全绿。
- [ ] 手工端到端：`auth login` → `leave balance query` → `leave applications submit` 三连走通，token 注入 + user_id 下传正确。
- [ ] 延后项（不做）：SSO、events、sidecar、多系统、`scripts/` CI 脚本。
