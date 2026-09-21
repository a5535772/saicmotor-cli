# mock-leave-server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个 Spring Boot 纯 API 极简请假系统 mock，作为 leo-cli POC 的回放保真验证靶场。

**Architecture:** 单模块 Maven 工程；自管 UUID token 会话（cookie 名 `JSESSIONID`，不引入 Spring Security）；统一响应信封 `{code,msg,data}`，业务错误 HTTP 恒 200 靠 code 区分，鉴权错误 401/403；H2 内存库 + JPA 持久化请假记录；一次性 CSRF token 强制「先取 form 再提交」链路；dev 端点确定性模拟会话过期。

**Tech Stack:** Java 17、Spring Boot 3.3.5（web / data-jpa）、H2、JUnit 5 + MockMvc、Maven

**Spec:** `docs/superpowers/specs/2026-09-18-mock-leave-server-design.md`

> 环境前提：本机已安装 JDK 17 与 Maven（`java -version`、`mvn -v` 可用）。所有命令在 `mock-leave-server/` 目录下执行。该目录在 Task 1 中 `git init` 为独立仓库。

---

## File Structure

```
mock-leave-server/
  pom.xml                              # 依赖与构建
  .gitignore
  README.md                            # Task 8 编写
  src/main/resources/application.yml   # 端口/H2/预置账号
  src/main/java/com/example/leave/
    LeaveMockApplication.java          # 启动类 + @EnableConfigurationProperties
    common/
      ApiResponse.java                 # 统一信封 {code,msg,data}
      BusinessException.java           # code != 0 业务错误（HTTP 200）
      CsrfException.java               # CSRF 错误（HTTP 403）
      GlobalExceptionHandler.java      # 异常 → 信封
    config/
      MockProperties.java              # leave.mock.users 配置绑定
    user/
      UserDirectory.java               # 预置账号查询（内存 Map）
    auth/
      SessionInfo.java                 # 会话值对象（含 csrf、年假余额）
      SessionRegistry.java             # token -> SessionInfo
      AuthController.java              # POST /api/login
      SessionInterceptor.java          # /api/leave/** 鉴权
      WebConfig.java                   # 注册拦截器
    leave/
      LeaveTypes.java                  # 假别字典 1事假/2病假/3年假
      LeaveRecord.java                 # JPA 实体
      LeaveRecordRepository.java
      ApplyRequest.java                # apply 请求 DTO
      LeaveService.java                # 业务规则（1001/1002/2001）
      LeaveController.java             # form / apply / list
    dev/
      DevController.java               # POST /api/dev/session/expire
  src/test/java/com/example/leave/
    common/GlobalExceptionHandlerTest.java
    auth/AuthControllerTest.java
    leave/LeaveRecordRepositoryTest.java
    leave/LeaveFlowTest.java
```

---

## Task 1: 工程脚手架与可运行骨架

**Files:**
- Create: `mock-leave-server/pom.xml`
- Create: `mock-leave-server/.gitignore`
- Create: `mock-leave-server/src/main/resources/application.yml`
- Create: `mock-leave-server/src/main/java/com/example/leave/LeaveMockApplication.java`
- Create: `mock-leave-server/src/test/java/com/example/leave/LeaveMockApplicationTests.java`

- [ ] **Step 1: 确认本机 JDK/Maven 可用**

Run: `java -version && mvn -v`
Expected: JDK 17（17.x）与 Maven 3.8+ 版本输出。若缺失，先安装 JDK 17 与 Maven 再继续。

- [ ] **Step 2: 创建 `pom.xml`**

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
    <artifactId>mock-leave-server</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>mock-leave-server</name>
    <description>leo-cli POC 的极简请假系统 mock 靶场</description>

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
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>runtime</scope>
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

- [ ] **Step 3: 创建 `.gitignore`**

```gitignore
target/
.idea/
*.iml
.vscode/
*.log
```

- [ ] **Step 4: 创建 `application.yml`**

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
      hibernate:
        format_sql: true
  h2:
    console:
      enabled: true

leave:
  mock:
    users:
      - username: zhangsan
        password: "123456"
        emp-name: 张三
        annual-balance: 5
      - username: lisi
        password: "123456"
        emp-name: 李四
        annual-balance: 0
```

- [ ] **Step 5: 创建启动类**

`src/main/java/com/example/leave/LeaveMockApplication.java`：

```java
package com.example.leave;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
public class LeaveMockApplication {

    public static void main(String[] args) {
        SpringApplication.run(LeaveMockApplication.class, args);
    }
}
```

- [ ] **Step 6: 创建上下文冒烟测试**

`src/test/java/com/example/leave/LeaveMockApplicationTests.java`：

```java
package com.example.leave;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class LeaveMockApplicationTests {

    @Test
    void contextLoads() {
    }
}
```

- [ ] **Step 7: 验证测试通过**

Run: `mvn -q test`
Expected: BUILD SUCCESS，`Tests run: 1, Failures: 0`。（首次运行会下载依赖，耗时属正常。）

- [ ] **Step 8: 初始化 git 仓库并提交**

```bash
cd mock-leave-server
git init
git add .
git commit -m "chore: scaffold spring boot mock-leave-server"
```

---

## Task 2: 统一响应信封与全局异常处理

**Files:**
- Create: `src/main/java/com/example/leave/common/ApiResponse.java`
- Create: `src/main/java/com/example/leave/common/BusinessException.java`
- Create: `src/main/java/com/example/leave/common/CsrfException.java`
- Create: `src/main/java/com/example/leave/common/GlobalExceptionHandler.java`
- Test: `src/test/java/com/example/leave/common/GlobalExceptionHandlerTest.java`

- [ ] **Step 1: 写失败测试**

`src/test/java/com/example/leave/common/GlobalExceptionHandlerTest.java`：

```java
package com.example.leave.common;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class GlobalExceptionHandlerTest {

    @RestController
    static class ProbeController {
        @GetMapping("/probe/business")
        public String business() {
            throw new BusinessException(2001, "年假余额不足");
        }

        @GetMapping("/probe/csrf")
        public String csrf() {
            throw new CsrfException("CSRF token 无效或已过期");
        }

        @GetMapping("/probe/boom")
        public String boom() {
            throw new IllegalStateException("unexpected");
        }
    }

    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new ProbeController())
            .setControllerAdvice(new GlobalExceptionHandler())
            .build();

    @Test
    void businessError_isHttp200WithCode() throws Exception {
        mockMvc.perform(get("/probe/business"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(2001))
                .andExpect(jsonPath("$.msg").value("年假余额不足"))
                .andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void csrfError_isHttp403WithCode4003() throws Exception {
        mockMvc.perform(get("/probe/csrf"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(4003))
                .andExpect(content().contentType(MediaType.APPLICATION_JSON));
    }

    @Test
    void unknownError_isHttp500() throws Exception {
        mockMvc.perform(get("/probe/boom"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value(500))
                .andExpect(jsonPath("$.msg").value("服务器内部错误"));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=GlobalExceptionHandlerTest`
Expected: 编译失败（`ApiResponse` / `BusinessException` / `CsrfException` / `GlobalExceptionHandler` 不存在）。

- [ ] **Step 3: 实现 `ApiResponse`**

```java
package com.example.leave.common;

public class ApiResponse<T> {

    private int code;
    private String msg;
    private T data;

    public ApiResponse() {
    }

    public ApiResponse(int code, String msg, T data) {
        this.code = code;
        this.msg = msg;
        this.data = data;
    }

    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>(0, "ok", data);
    }

    public static <T> ApiResponse<T> fail(int code, String msg) {
        return new ApiResponse<>(code, msg, null);
    }

    public int getCode() {
        return code;
    }

    public String getMsg() {
        return msg;
    }

    public T getData() {
        return data;
    }
}
```

说明：业务错误的 `data` 为 null，Jackson 序列化为 `"data":null`，因此断言用 `nullValue()` 而非 `doesNotExist()`。

- [ ] **Step 4: 实现 `BusinessException` 与 `CsrfException`**

```java
package com.example.leave.common;

public class BusinessException extends RuntimeException {

    private final int code;

    public BusinessException(int code, String msg) {
        super(msg);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}
```

```java
package com.example.leave.common;

public class CsrfException extends RuntimeException {

    public CsrfException(String msg) {
        super(msg);
    }
}
```

- [ ] **Step 5: 实现 `GlobalExceptionHandler`**

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

    @ExceptionHandler(CsrfException.class)
    public ResponseEntity<ApiResponse<Void>> handleCsrf(CsrfException e) {
        return ResponseEntity.status(403).body(ApiResponse.fail(4003, e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleOther(Exception e) {
        log.error("unhandled exception", e);
        return ResponseEntity.status(500).body(ApiResponse.fail(500, "服务器内部错误"));
    }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `mvn -q test -Dtest=GlobalExceptionHandlerTest`
Expected: PASS，3 个测试全绿。

- [ ] **Step 7: 提交**

```bash
git add src
git commit -m "feat: add unified api envelope and global exception handling"
```

---

## Task 3: 预置账号配置绑定与目录查询

**Files:**
- Create: `src/main/java/com/example/leave/config/MockProperties.java`
- Create: `src/main/java/com/example/leave/user/UserDirectory.java`
- Modify: `src/main/java/com/example/leave/LeaveMockApplication.java`
- Test: `src/test/java/com/example/leave/user/UserDirectoryTest.java`

- [ ] **Step 1: 写失败测试**

`src/test/java/com/example/leave/user/UserDirectoryTest.java`：

```java
package com.example.leave.user;

import com.example.leave.config.MockProperties;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class UserDirectoryTest {

    private MockProperties.UserConfig user(String username, String password,
                                           String empName, int annualBalance) {
        MockProperties.UserConfig u = new MockProperties.UserConfig();
        u.setUsername(username);
        u.setPassword(password);
        u.setEmpName(empName);
        u.setAnnualBalance(annualBalance);
        return u;
    }

    @Test
    void findsSeededUserAndReturnsEmptyForUnknown() {
        MockProperties props = new MockProperties();
        props.setUsers(List.of(user("zhangsan", "123456", "张三", 5)));

        UserDirectory directory = new UserDirectory(props);

        assertThat(directory.findByUsername("zhangsan")).isPresent();
        assertThat(directory.findByUsername("zhangsan").get().getEmpName()).isEqualTo("张三");
        assertThat(directory.findByUsername("nobody")).isEmpty();
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=UserDirectoryTest`
Expected: 编译失败（`MockProperties` / `UserDirectory` 不存在）。

- [ ] **Step 3: 实现 `MockProperties`**

```java
package com.example.leave.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.util.ArrayList;
import java.util.List;

@ConfigurationProperties(prefix = "leave.mock")
public class MockProperties {

    private List<UserConfig> users = new ArrayList<>();

    public List<UserConfig> getUsers() {
        return users;
    }

    public void setUsers(List<UserConfig> users) {
        this.users = users;
    }

    public static class UserConfig {
        private String username;
        private String password;
        private String empName;
        private int annualBalance;

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getEmpName() {
            return empName;
        }

        public void setEmpName(String empName) {
            this.empName = empName;
        }

        public int getAnnualBalance() {
            return annualBalance;
        }

        public void setAnnualBalance(int annualBalance) {
            this.annualBalance = annualBalance;
        }
    }
}
```

- [ ] **Step 4: 实现 `UserDirectory`**

```java
package com.example.leave.user;

import com.example.leave.config.MockProperties;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class UserDirectory {

    private final Map<String, MockProperties.UserConfig> byUsername;

    public UserDirectory(MockProperties properties) {
        this.byUsername = properties.getUsers().stream()
                .collect(Collectors.toMap(MockProperties.UserConfig::getUsername, Function.identity()));
    }

    public Optional<MockProperties.UserConfig> findByUsername(String username) {
        return Optional.ofNullable(byUsername.get(username));
    }
}
```

- [ ] **Step 5: 启用配置绑定**

修改 `LeaveMockApplication.java`：

```java
package com.example.leave;

import com.example.leave.config.MockProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(MockProperties.class)
public class LeaveMockApplication {

    public static void main(String[] args) {
        SpringApplication.run(LeaveMockApplication.class, args);
    }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `mvn -q test -Dtest=UserDirectoryTest`
Expected: PASS。再跑全量 `mvn -q test` 确认上下文仍能加载（验证 yml 配置绑定正确）：Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src
git commit -m "feat: bind seeded users from application.yml"
```

---

## Task 4: 会话注册表与登录端点

**Files:**
- Create: `src/main/java/com/example/leave/auth/SessionInfo.java`
- Create: `src/main/java/com/example/leave/auth/SessionRegistry.java`
- Create: `src/main/java/com/example/leave/auth/AuthController.java`
- Test: `src/test/java/com/example/leave/auth/AuthControllerTest.java`

- [ ] **Step 1: 写失败测试**

`src/test/java/com/example/leave/auth/AuthControllerTest.java`：

```java
package com.example.leave.auth;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void loginSuccess_setsJsessionidCookieAndReturnsProfile() throws Exception {
        String body = mockMvc.perform(post("/api/login")
                        .param("username", "zhangsan")
                        .param("password", "123456"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.username").value("zhangsan"))
                .andExpect(jsonPath("$.data.empName").value("张三"))
                .andReturn().getResponse().getContentAsString();

        Cookie cookie = mockMvc.perform(post("/api/login")
                        .param("username", "zhangsan")
                        .param("password", "123456"))
                .andReturn().getResponse().getCookie("JSESSIONID");
        assertThat(cookie).isNotNull();
        assertThat(cookie.isHttpOnly()).isTrue();
        assertThat(cookie.getValue()).isNotBlank();
    }

    @Test
    void loginWrongPassword_returns4001AndNoCookie() throws Exception {
        var response = mockMvc.perform(post("/api/login")
                        .param("username", "zhangsan")
                        .param("password", "wrong"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(4001))
                .andExpect(jsonPath("$.msg").value("账号或密码错误"))
                .andReturn().getResponse();
        assertThat(response.getCookie("JSESSIONID")).isNull();
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=AuthControllerTest`
Expected: 测试 FAIL（404 / 登录端点不存在）。

- [ ] **Step 3: 实现 `SessionInfo`**

```java
package com.example.leave.auth;

public class SessionInfo {

    private final String username;
    private final String empName;
    private final int annualBalance;
    private String csrf;

    public SessionInfo(String username, String empName, int annualBalance) {
        this.username = username;
        this.empName = empName;
        this.annualBalance = annualBalance;
    }

    public String getUsername() {
        return username;
    }

    public String getEmpName() {
        return empName;
    }

    public int getAnnualBalance() {
        return annualBalance;
    }

    public String getCsrf() {
        return csrf;
    }

    public void setCsrf(String csrf) {
        this.csrf = csrf;
    }
}
```

- [ ] **Step 4: 实现 `SessionRegistry`**

```java
package com.example.leave.auth;

import com.example.leave.config.MockProperties;
import org.springframework.stereotype.Component;

import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SessionRegistry {

    private final ConcurrentHashMap<String, SessionInfo> sessions = new ConcurrentHashMap<>();

    public String create(MockProperties.UserConfig user) {
        String token = UUID.randomUUID().toString().replace("-", "");
        sessions.put(token, new SessionInfo(user.getUsername(), user.getEmpName(),
                user.getAnnualBalance()));
        return token;
    }

    public SessionInfo get(String token) {
        return token == null ? null : sessions.get(token);
    }

    public boolean invalidate(String token) {
        return token != null && sessions.remove(token) != null;
    }
}
```

- [ ] **Step 5: 实现 `AuthController`**

```java
package com.example.leave.auth;

import com.example.leave.common.ApiResponse;
import com.example.leave.config.MockProperties;
import com.example.leave.user.UserDirectory;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class AuthController {

    public static final String COOKIE_NAME = "JSESSIONID";

    private final UserDirectory users;
    private final SessionRegistry sessions;

    public AuthController(UserDirectory users, SessionRegistry sessions) {
        this.users = users;
        this.sessions = sessions;
    }

    @PostMapping("/api/login")
    public ApiResponse<Map<String, String>> login(
            @RequestParam String username,
            @RequestParam String password,
            HttpServletResponse response) {

        MockProperties.UserConfig user = users.findByUsername(username).orElse(null);
        if (user == null || !user.getPassword().equals(password)) {
            return ApiResponse.fail(4001, "账号或密码错误");
        }

        String token = sessions.create(user);
        Cookie cookie = new Cookie(COOKIE_NAME, token);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        response.addCookie(cookie);

        return ApiResponse.ok(Map.of(
                "username", user.getUsername(),
                "empName", user.getEmpName()));
    }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `mvn -q test -Dtest=AuthControllerTest`
Expected: PASS（2 个测试）。

- [ ] **Step 7: 提交**

```bash
git add src
git commit -m "feat: add session registry and password login endpoint"
```

---

## Task 5: 请假记录实体与仓储

**Files:**
- Create: `src/main/java/com/example/leave/leave/LeaveRecord.java`
- Create: `src/main/java/com/example/leave/leave/LeaveRecordRepository.java`
- Test: `src/test/java/com/example/leave/leave/LeaveRecordRepositoryTest.java`

- [ ] **Step 1: 写失败测试**

`src/test/java/com/example/leave/leave/LeaveRecordRepositoryTest.java`：

```java
package com.example.leave.leave;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class LeaveRecordRepositoryTest {

    @Autowired
    private LeaveRecordRepository repository;

    private LeaveRecord record(String applicant, LocalDateTime createdAt) {
        LeaveRecord r = new LeaveRecord();
        r.setApplicant(applicant);
        r.setStartDate(LocalDate.of(2026, 9, 20));
        r.setEndDate(LocalDate.of(2026, 9, 20));
        r.setTypeCode("1");
        r.setTypeName("事假");
        r.setReason("个人事务");
        r.setStatus("PENDING");
        r.setCreatedAt(createdAt);
        return r;
    }

    @Test
    void findsByApplicantOrderedByCreatedAtDesc() {
        repository.save(record("zhangsan", LocalDateTime.of(2026, 9, 1, 9, 0)));
        repository.save(record("lisi", LocalDateTime.of(2026, 9, 2, 9, 0)));
        repository.save(record("zhangsan", LocalDateTime.of(2026, 9, 3, 9, 0)));

        List<LeaveRecord> mine = repository.findByApplicantOrderByCreatedAtDesc("zhangsan");

        assertThat(mine).hasSize(2);
        assertThat(mine.get(0).getCreatedAt()).isEqualTo(LocalDateTime.of(2026, 9, 3, 9, 0));
        assertThat(mine.get(1).getCreatedAt()).isEqualTo(LocalDateTime.of(2026, 9, 1, 9, 0));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=LeaveRecordRepositoryTest`
Expected: 编译失败（实体/仓储不存在）。

- [ ] **Step 3: 实现 `LeaveRecord`**

```java
package com.example.leave.leave;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "leave_record")
public class LeaveRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String applicant;
    private LocalDate startDate;
    private LocalDate endDate;
    private String typeCode;
    private String typeName;
    private String reason;
    private String status;
    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public String getApplicant() {
        return applicant;
    }

    public void setApplicant(String applicant) {
        this.applicant = applicant;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public void setEndDate(LocalDate endDate) {
        this.endDate = endDate;
    }

    public String getTypeCode() {
        return typeCode;
    }

    public void setTypeCode(String typeCode) {
        this.typeCode = typeCode;
    }

    public String getTypeName() {
        return typeName;
    }

    public void setTypeName(String typeName) {
        this.typeName = typeName;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
```

- [ ] **Step 4: 实现 `LeaveRecordRepository`**

```java
package com.example.leave.leave;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LeaveRecordRepository extends JpaRepository<LeaveRecord, Long> {

    List<LeaveRecord> findByApplicantOrderByCreatedAtDesc(String applicant);
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `mvn -q test -Dtest=LeaveRecordRepositoryTest`
Expected: PASS（控制台可见 Hibernate 建表/插入 SQL）。

- [ ] **Step 6: 提交**

```bash
git add src
git commit -m "feat: add leave_record entity and repository"
```

---

## Task 6: 鉴权拦截器与 CSRF 表单端点

**Files:**
- Create: `src/main/java/com/example/leave/auth/SessionInterceptor.java`
- Create: `src/main/java/com/example/leave/auth/WebConfig.java`
- Create: `src/main/java/com/example/leave/leave/LeaveTypes.java`
- Create: `src/main/java/com/example/leave/leave/LeaveController.java`（本任务只含 form）
- Test: `src/test/java/com/example/leave/leave/LeaveFormTest.java`

- [ ] **Step 1: 写失败测试**

`src/test/java/com/example/leave/leave/LeaveFormTest.java`：

```java
package com.example.leave.leave;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class LeaveFormTest {

    @Autowired
    private MockMvc mockMvc;

    private Cookie login(String username) throws Exception {
        return mockMvc.perform(post("/api/login")
                        .param("username", username)
                        .param("password", "123456"))
                .andReturn().getResponse().getCookie("JSESSIONID");
    }

    @Test
    void formWithoutCookie_is401() throws Exception {
        mockMvc.perform(get("/api/leave/form"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401))
                .andExpect(jsonPath("$.msg").value("未登录或会话已过期"));
    }

    @Test
    void formWithCookie_returnsCsrfAndTypes() throws Exception {
        mockMvc.perform(get("/api/leave/form").cookie(login("zhangsan")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.token").isNotEmpty())
                .andExpect(jsonPath("$.data.types[0].code").value("1"))
                .andExpect(jsonPath("$.data.types[0].name").value("事假"))
                .andExpect(jsonPath("$.data.types[2].code").value("3"))
                .andExpect(jsonPath("$.data.types[2].name").value("年假"));
    }

    @Test
    void formWithForgedCookie_is401() throws Exception {
        mockMvc.perform(get("/api/leave/form")
                        .cookie(new Cookie("JSESSIONID", "forged-token")))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=LeaveFormTest`
Expected: FAIL（401 用例实际可能 404；form 端点不存在）。

- [ ] **Step 3: 实现 `SessionInterceptor`**

```java
package com.example.leave.auth;

import com.example.leave.common.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class SessionInterceptor implements HandlerInterceptor {

    public static final String SESSION_ATTRIBUTE = "currentSession";

    private final SessionRegistry sessions;
    private final ObjectMapper objectMapper;

    public SessionInterceptor(SessionRegistry sessions, ObjectMapper objectMapper) {
        this.sessions = sessions;
        this.objectMapper = objectMapper;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                             Object handler) throws Exception {
        String token = readToken(request);
        SessionInfo session = sessions.get(token);
        if (session == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write(objectMapper.writeValueAsString(
                    ApiResponse.fail(401, "未登录或会话已过期")));
            return false;
        }
        request.setAttribute(SESSION_ATTRIBUTE, session);
        return true;
    }

    private String readToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie cookie : cookies) {
            if (AuthController.COOKIE_NAME.equals(cookie.getName())) {
                return cookie.getValue();
            }
        }
        return null;
    }
}
```

- [ ] **Step 4: 实现 `WebConfig`**

```java
package com.example.leave.auth;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final SessionInterceptor sessionInterceptor;

    public WebConfig(SessionInterceptor sessionInterceptor) {
        this.sessionInterceptor = sessionInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(sessionInterceptor)
                .addPathPatterns("/api/leave/**");
    }
}
```

- [ ] **Step 5: 实现 `LeaveTypes`**

```java
package com.example.leave.leave;

import java.util.List;
import java.util.Map;

public final class LeaveTypes {

    /** code -> 名称，顺序即表单展示顺序 */
    public static final List<Map<String, String>> TYPES = List.of(
            Map.of("code", "1", "name", "事假"),
            Map.of("code", "2", "name", "病假"),
            Map.of("code", "3", "name", "年假"));

    public static String nameOf(String code) {
        return TYPES.stream()
                .filter(t -> t.get("code").equals(code))
                .map(t -> t.get("name"))
                .findFirst()
                .orElse(null);
    }

    private LeaveTypes() {
    }
}
```

- [ ] **Step 6: 实现 `LeaveController`（仅 form）**

```java
package com.example.leave.leave;

import com.example.leave.auth.SessionInfo;
import com.example.leave.auth.SessionInterceptor;
import com.example.leave.common.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/leave")
public class LeaveController {

    @GetMapping("/form")
    public ApiResponse<Map<String, Object>> form(HttpServletRequest request) {
        SessionInfo session = (SessionInfo) request.getAttribute(
                SessionInterceptor.SESSION_ATTRIBUTE);
        String csrf = UUID.randomUUID().toString().replace("-", "");
        session.setCsrf(csrf);
        return ApiResponse.ok(Map.of(
                "token", csrf,
                "types", LeaveTypes.TYPES));
    }
}
```

- [ ] **Step 7: 运行测试确认通过**

Run: `mvn -q test -Dtest=LeaveFormTest`
Expected: PASS（3 个测试）。

- [ ] **Step 8: 提交**

```bash
git add src
git commit -m "feat: enforce session auth on leave api and add csrf form endpoint"
```

---

## Task 7: 提交请假端点（CSRF 一次性 + 业务规则）

**Files:**
- Create: `src/main/java/com/example/leave/leave/ApplyRequest.java`
- Create: `src/main/java/com/example/leave/leave/LeaveService.java`
- Modify: `src/main/java/com/example/leave/leave/LeaveController.java`（增加 apply）
- Test: `src/test/java/com/example/leave/leave/ApplyLeaveTest.java`

- [ ] **Step 1: 写失败测试**

`src/test/java/com/example/leave/leave/ApplyLeaveTest.java`：

```java
package com.example.leave.leave;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ApplyLeaveTest {

    @Autowired private MockMvc mockMvc;
    @Autowired private LeaveRecordRepository repository;
    private final ObjectMapper mapper = new ObjectMapper();

    private Cookie login(String username) throws Exception {
        return mockMvc.perform(post("/api/login")
                        .param("username", username).param("password", "123456"))
                .andReturn().getResponse().getCookie("JSESSIONID");
    }

    private String csrf(Cookie cookie) throws Exception {
        String json = mockMvc.perform(get("/api/leave/form").cookie(cookie))
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(json).path("data").path("token").asText();
    }

    private String applyBody(String start, String end, String typeCode, String reason) {
        try {
            return mapper.writeValueAsString(
                    Map.of("startDate", start, "endDate", end,
                           "typeCode", typeCode, "reason", reason));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @Test
    void applySuccess_persistsPendingRecord() throws Exception {
        Cookie cookie = login("zhangsan");
        long before = repository.count();

        mockMvc.perform(post("/api/leave/apply")
                        .cookie(cookie)
                        .header("X-CSRF-Token", csrf(cookie))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(applyBody("2026-09-20", "2026-09-20", "1", "个人事务")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.id").isNumber())
                .andExpect(jsonPath("$.data.typeName").value("事假"))
                .andExpect(jsonPath("$.data.status").value("PENDING"));

        org.assertj.core.api.Assertions.assertThat(repository.count()).isEqualTo(before + 1);
    }

    @Test
    void csrfToken_isSingleUse() throws Exception {
        Cookie cookie = login("zhangsan");
        String token = csrf(cookie);
        String body = applyBody("2026-09-21", "2026-09-21", "1", "第一次");

        mockMvc.perform(post("/api/leave/apply").cookie(cookie)
                        .header("X-CSRF-Token", token)
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0));

        mockMvc.perform(post("/api/leave/apply").cookie(cookie)
                        .header("X-CSRF-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(applyBody("2026-09-22", "2026-09-22", "1", "第二次")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value(4003));
    }

    @Test
    void missingHeader_is403() throws Exception {
        Cookie cookie = login("zhangsan");
        csrf(cookie); // 已取 token 但故意不带
        mockMvc.perform(post("/api/leave/apply").cookie(cookie)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(applyBody("2026-09-20", "2026-09-20", "1", "x")))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value(4003));
    }

    @Test
    void endBeforeStart_is1001() throws Exception {
        Cookie cookie = login("zhangsan");
        mockMvc.perform(post("/api/leave/apply").cookie(cookie)
                        .header("X-CSRF-Token", csrf(cookie))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(applyBody("2026-09-25", "2026-09-20", "1", "x")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(1001));
    }

    @Test
    void missingReason_is1002() throws Exception {
        Cookie cookie = login("zhangsan");
        mockMvc.perform(post("/api/leave/apply").cookie(cookie)
                        .header("X-CSRF-Token", csrf(cookie))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(applyBody("2026-09-20", "2026-09-20", "1", "")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(1002));
    }

    @Test
    void annualLeaveExceedingBalance_is2001() throws Exception {
        Cookie cookie = login("lisi"); // 余额 0
        mockMvc.perform(post("/api/leave/apply").cookie(cookie)
                        .header("X-CSRF-Token", csrf(cookie))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(applyBody("2026-09-20", "2026-09-20", "3", "休息")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(2001));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=ApplyLeaveTest`
Expected: FAIL（404，apply 端点不存在）。

- [ ] **Step 3: 实现 `ApplyRequest`**

```java
package com.example.leave.leave;

public record ApplyRequest(String startDate, String endDate,
                           String typeCode, String reason) {
}
```

- [ ] **Step 4: 实现 `LeaveService`**

```java
package com.example.leave.leave;

import com.example.leave.auth.SessionInfo;
import com.example.leave.common.BusinessException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;

@Service
public class LeaveService {

    private final LeaveRecordRepository repository;

    public LeaveService(LeaveRecordRepository repository) {
        this.repository = repository;
    }

    public LeaveRecord apply(SessionInfo session, ApplyRequest request) {
        if (request == null
                || isBlank(request.startDate()) || isBlank(request.endDate())
                || isBlank(request.typeCode()) || isBlank(request.reason())) {
            throw new BusinessException(1002, "参数不完整或格式错误");
        }

        LocalDate start;
        LocalDate end;
        try {
            start = LocalDate.parse(request.startDate());
            end = LocalDate.parse(request.endDate());
        } catch (DateTimeParseException e) {
            throw new BusinessException(1002, "参数不完整或格式错误");
        }

        if (end.isBefore(start)) {
            throw new BusinessException(1001, "结束日期不能早于开始日期");
        }

        String typeName = LeaveTypes.nameOf(request.typeCode());
        if (typeName == null) {
            throw new BusinessException(1002, "参数不完整或格式错误");
        }

        long days = ChronoUnit.DAYS.between(start, end) + 1;
        if ("3".equals(request.typeCode()) && days > session.getAnnualBalance()) {
            throw new BusinessException(2001, "年假余额不足");
        }

        LeaveRecord record = new LeaveRecord();
        record.setApplicant(session.getUsername());
        record.setStartDate(start);
        record.setEndDate(end);
        record.setTypeCode(request.typeCode());
        record.setTypeName(typeName);
        record.setReason(request.reason());
        record.setStatus("PENDING");
        record.setCreatedAt(LocalDateTime.now().withNano(0));
        return repository.save(record);
    }

    private boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
```

- [ ] **Step 5: 在 `LeaveController` 增加 apply**

在 `LeaveController` 中注入 `LeaveService` 并新增方法，完整文件改为：

```java
package com.example.leave.leave;

import com.example.leave.auth.SessionInfo;
import com.example.leave.auth.SessionInterceptor;
import com.example.leave.common.ApiResponse;
import com.example.leave.common.CsrfException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/leave")
public class LeaveController {

    private final LeaveService leaveService;

    public LeaveController(LeaveService leaveService) {
        this.leaveService = leaveService;
    }

    @GetMapping("/form")
    public ApiResponse<Map<String, Object>> form(HttpServletRequest request) {
        SessionInfo session = currentSession(request);
        String csrf = UUID.randomUUID().toString().replace("-", "");
        session.setCsrf(csrf);
        return ApiResponse.ok(Map.of(
                "token", csrf,
                "types", LeaveTypes.TYPES));
    }

    @PostMapping("/apply")
    public ApiResponse<LeaveRecord> apply(
            HttpServletRequest request,
            @RequestHeader(value = "X-CSRF-Token", required = false) String csrfToken,
            @RequestBody ApplyRequest body) {

        SessionInfo session = currentSession(request);
        if (csrfToken == null || !csrfToken.equals(session.getCsrf())) {
            throw new CsrfException("CSRF token 无效或已过期");
        }
        // CSRF token 一次性：无论后续业务成功与否，校验通过即作废
        session.setCsrf(null);
        return ApiResponse.ok(leaveService.apply(session, body));
    }

    private SessionInfo currentSession(HttpServletRequest request) {
        return (SessionInfo) request.getAttribute(SessionInterceptor.SESSION_ATTRIBUTE);
    }
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `mvn -q test -Dtest=ApplyLeaveTest`
Expected: PASS（6 个测试）。再跑 `mvn -q test` 全量：Expected: 全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add src
git commit -m "feat: add leave apply with one-time csrf and business rules"
```

---

## Task 8: 列表端点、dev 过期端点、全链路冒烟与 README

**Files:**
- Modify: `src/main/java/com/example/leave/leave/LeaveController.java`（增加 list）
- Create: `src/main/java/com/example/leave/dev/DevController.java`
- Test: `src/test/java/com/example/leave/leave/LeaveFlowTest.java`
- Create: `mock-leave-server/README.md`

- [ ] **Step 1: 写失败测试（全链路 + 隔离 + 过期）**

`src/test/java/com/example/leave/leave/LeaveFlowTest.java`：

```java
package com.example.leave.leave;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class LeaveFlowTest {

    @Autowired private MockMvc mockMvc;
    private final ObjectMapper mapper = new ObjectMapper();

    private Cookie login(String username) throws Exception {
        return mockMvc.perform(post("/api/login")
                        .param("username", username).param("password", "123456"))
                .andReturn().getResponse().getCookie("JSESSIONID");
    }

    private String csrf(Cookie cookie) throws Exception {
        String json = mockMvc.perform(get("/api/leave/form").cookie(cookie))
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(json).path("data").path("token").asText();
    }

    private void submit(Cookie cookie, String start, String end,
                        String typeCode, String reason) throws Exception {
        String body = mapper.writeValueAsString(Map.of(
                "startDate", start, "endDate", end,
                "typeCode", typeCode, "reason", reason));
        mockMvc.perform(post("/api/leave/apply").cookie(cookie)
                        .header("X-CSRF-Token", csrf(cookie))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0));
    }

    @Test
    void endToFlow_loginSubmitList_isolatedByUser() throws Exception {
        Cookie zhangsan = login("zhangsan");
        Cookie lisi = login("lisi");

        submit(zhangsan, "2026-10-01", "2026-10-02", "1", "办事");
        submit(zhangsan, "2026-11-01", "2026-11-01", "2", "看病");
        // lisi 只能请非年假（余额 0）
        submit(lisi, "2026-10-10", "2026-10-10", "1", "lisi 的事");

        mockMvc.perform(get("/api/leave/list").cookie(zhangsan))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(0))
                .andExpect(jsonPath("$.data.total").value(2))
                .andExpect(jsonPath("$.data.list.length()").value(2))
                // createdAt 倒序：11 月那条在前
                .andExpect(jsonPath("$.data.list[0].reason").value("看病"))
                .andExpect(jsonPath("$.data.list[1].applicant").value("zhangsan"));

        mockMvc.perform(get("/api/leave/list").cookie(lisi))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.list[0].reason").value("lisi 的事"));
    }

    @Test
    void devExpire_thenNextCallIs401_reloginRecovers() throws Exception {
        Cookie cookie = login("zhangsan");

        mockMvc.perform(get("/api/leave/list").cookie(cookie))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/dev/session/expire").cookie(cookie))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.expired").value(true));

        mockMvc.perform(get("/api/leave/list").cookie(cookie))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value(401));

        Cookie reissued = login("zhangsan");
        mockMvc.perform(get("/api/leave/list").cookie(reissued))
                .andExpect(status().isOk()).andExpect(jsonPath("$.code").value(0));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `mvn -q test -Dtest=LeaveFlowTest`
Expected: FAIL（list/dev 端点 404）。

- [ ] **Step 3: 在 `LeaveController` 增加 list**

在类中注入 `LeaveRecordRepository` 并新增方法。构造器与 import 调整后的完整文件：

```java
package com.example.leave.leave;

import com.example.leave.auth.SessionInfo;
import com.example.leave.auth.SessionInterceptor;
import com.example.leave.common.ApiResponse;
import com.example.leave.common.CsrfException;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/leave")
public class LeaveController {

    private final LeaveService leaveService;
    private final LeaveRecordRepository repository;

    public LeaveController(LeaveService leaveService, LeaveRecordRepository repository) {
        this.leaveService = leaveService;
        this.repository = repository;
    }

    @GetMapping("/form")
    public ApiResponse<Map<String, Object>> form(HttpServletRequest request) {
        SessionInfo session = currentSession(request);
        String csrf = UUID.randomUUID().toString().replace("-", "");
        session.setCsrf(csrf);
        return ApiResponse.ok(Map.of(
                "token", csrf,
                "types", LeaveTypes.TYPES));
    }

    @PostMapping("/apply")
    public ApiResponse<LeaveRecord> apply(
            HttpServletRequest request,
            @RequestHeader(value = "X-CSRF-Token", required = false) String csrfToken,
            @RequestBody ApplyRequest body) {

        SessionInfo session = currentSession(request);
        if (csrfToken == null || !csrfToken.equals(session.getCsrf())) {
            throw new CsrfException("CSRF token 无效或已过期");
        }
        session.setCsrf(null);
        return ApiResponse.ok(leaveService.apply(session, body));
    }

    @GetMapping("/list")
    public ApiResponse<Map<String, Object>> list(HttpServletRequest request) {
        SessionInfo session = currentSession(request);
        List<LeaveRecord> records =
                repository.findByApplicantOrderByCreatedAtDesc(session.getUsername());
        return ApiResponse.ok(Map.of(
                "list", records,
                "total", records.size()));
    }

    private SessionInfo currentSession(HttpServletRequest request) {
        return (SessionInfo) request.getAttribute(SessionInterceptor.SESSION_ATTRIBUTE);
    }
}
```

- [ ] **Step 4: 实现 `DevController`**

```java
package com.example.leave.dev;

import com.example.leave.auth.AuthController;
import com.example.leave.auth.SessionRegistry;
import com.example.leave.common.ApiResponse;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class DevController {

    private final SessionRegistry sessions;

    public DevController(SessionRegistry sessions) {
        this.sessions = sessions;
    }

    @PostMapping("/api/dev/session/expire")
    public ApiResponse<Map<String, Boolean>> expire(
            @CookieValue(value = AuthController.COOKIE_NAME, required = false) String token) {
        boolean removed = sessions.invalidate(token);
        return ApiResponse.ok(Map.of("expired", removed));
    }
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `mvn -q test -Dtest=LeaveFlowTest`
Expected: PASS（2 个测试）。

- [ ] **Step 6: 全量测试**

Run: `mvn -q test`
Expected: 全部 PASS（GlobalExceptionHandler 3 + UserDirectory 1 + Auth 2 + Repository 1 + Form 3 + Apply 6 + Flow 2 + contextLoads 1 = 19）。

- [ ] **Step 7: 手动端到端验证**

启动：`mvn spring-boot:run`（另开终端），依次执行（Git Bash / 任意带 curl 的 shell）：

```bash
# 1) 登录，cookie 存入 cookies.txt
curl -i -c cookies.txt -X POST http://localhost:8080/api/login \
  -d "username=zhangsan&password=123456"
# 期望：HTTP 200，Set-Cookie: JSESSIONID=...，body code=0

# 2) 取 CSRF
curl -s -b cookies.txt http://localhost:8080/api/leave/form
# 期望：data.token 有值，types 三项

# 3) 提交（把 <TOKEN> 换成上一步的 token）
curl -s -b cookies.txt -X POST http://localhost:8080/api/leave/apply \
  -H "Content-Type: application/json" -H "X-CSRF-Token: <TOKEN>" \
  -d '{"startDate":"2026-09-20","endDate":"2026-09-20","typeCode":"1","reason":"个人事务"}'
# 期望：code=0，data.id 有值，status=PENDING

# 4) 查列表
curl -s -b cookies.txt http://localhost:8080/api/leave/list
# 期望：total=1，list 含刚才的记录

# 5) 模拟过期，再查 → 401
curl -s -b cookies.txt -X POST http://localhost:8080/api/dev/session/expire
curl -i -b cookies.txt http://localhost:8080/api/leave/list
# 期望：HTTP 401，{"code":401,...}
```

再打开浏览器访问 `http://localhost:8080/h2-console`，JDBC URL 填 `jdbc:h2:mem:leavedb`、用户名 `sa`、空密码，执行 `select * from leave_record;` 应看到提交的记录。验证后 Ctrl+C 停掉服务，删除临时文件 `cookies.txt`。

- [ ] **Step 8: 编写 README**

`mock-leave-server/README.md`：

````markdown
# mock-leave-server

leo-cli POC 使用的极简「员工请假系统」mock 服务。纯 API、无页面、无安全框架，
仅用于本地回放保真验证与集成测试靶场。

## 运行

要求 JDK 17 + Maven 3.8+。

```bash
mvn spring-boot:run
```

服务起在 `http://localhost:8080`。H2 控制台：`http://localhost:8080/h2-console`
（JDBC URL `jdbc:h2:mem:leavedb`，用户名 `sa`，密码空）。重启服务数据清空。

## 预置账号

| 账号 | 密码 | 姓名 | 年假余额（天） |
|---|---|---|---|
| zhangsan | 123456 | 张三 | 5 |
| lisi | 123456 | 李四 | 0（请年假必返回 2001） |

## 接口

统一信封：`{"code":0,"msg":"ok","data":...}`。业务错误 HTTP 恒为 200、code 非 0；
鉴权错误为 HTTP 401/403。

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | /api/login | 无 | 表单字段 username/password；成功下发 HttpOnly cookie `JSESSIONID` |
| GET | /api/leave/form | 是 | 返回一次性 CSRF `data.token` 与假别字典 |
| POST | /api/leave/apply | 是 | JSON body + 头 `X-CSRF-Token`；token 用后即作废 |
| GET | /api/leave/list | 是 | 当前用户的请假记录，`data.list` / `data.total` |
| POST | /api/dev/session/expire | 无 | 令当前 cookie 会话失效（模拟过期，供测试 401 自动重登） |

业务错误码：4001 账号或密码错误；401 未登录或会话已过期；4003 CSRF 无效/过期；
1002 参数不完整或格式错误；1001 结束日期早于开始日期；2001 年假余额不足。

## curl 全流程

```bash
curl -c cookies.txt -X POST http://localhost:8080/api/login -d "username=zhangsan&password=123456"
curl -s -b cookies.txt http://localhost:8080/api/leave/form        # 复制 data.token
curl -s -b cookies.txt -X POST http://localhost:8080/api/leave/apply \
  -H "Content-Type: application/json" -H "X-CSRF-Token: <TOKEN>" \
  -d '{"startDate":"2026-09-20","endDate":"2026-09-20","typeCode":"1","reason":"个人事务"}'
curl -s -b cookies.txt http://localhost:8080/api/leave/list
curl -s -b cookies.txt -X POST http://localhost:8080/api/dev/session/expire
```

## 测试

```bash
mvn test
```
````

- [ ] **Step 9: 提交**

```bash
git add src README.md
git commit -m "feat: add leave list, dev session expiry, smoke tests and README"
```

---

## Self-Review 记录

- **Spec 覆盖**：§4.1 login（Task 4）、§4.2 form（Task 6）、§4.3 apply 含一次性 CSRF 与 1001/1002/2001（Task 7）、§4.4 list（Task 8）、§4.5 dev/expire（Task 8）；§5 会话模型（Task 4/6）；§6 实体/预置账号（Task 3/5）；§7 异常处理（Task 2，401 在拦截器手写）；§8 yml（Task 1）；§9 六条测试场景全部落在对应 Task；§10 DoD 由 Task 8 手动验证 + README 覆盖。
- **类型一致性**：`SessionInfo` 在 Task 4 定义 `username/empName/annualBalance/csrf`，Task 6/7/8 用法一致；`SessionInterceptor.SESSION_ATTRIBUTE` 与 controller 取用一致；`LeaveTypes.nameOf`/`TYPES` 与 form 响应、apply 落库一致；`LeaveRecordRepository.findByApplicantOrderByCreatedAtDesc` 在 Task 5 定义、Task 8 使用签名一致。
- **注意点**：Jackson 对 null `data` 序列化为 null，Task 2 断言使用 `nullValue()`。
