# Sprint 5 飞书 SSO 打通 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 CLI 支持可插拔 auth，新增 exchange 方式，并通过 Java 网关对接飞书网页授权登录，跑通真实 OIDC 认证链路。

**Architecture:** CLI 只负责在浏览器完成飞书授权、收回调 code，把 code 交给网关；网关持有飞书 app_id/secret，用 code 换用户身份后签发与现有完全相同的网关 token。网关内抽象 `IdpProvider`，未来切换公司 OIDC 只需新增一个实现 + 改配置，CLI 与业务系统零改动。

**Tech Stack:** TypeScript / Node 内置 http（CLI，vitest）；Java 17 / Spring Boot 3.3.5 / JUnit 5 / MockRestServiceServer（网关）。

参考设计：`docs/superpowers/specs/2026-09-22-sso-feishu-poc-design.md`
飞书申请手册：`howto/FEISHU-OIDC-SETUP.md`

仓库布局（两个独立 git 仓库）：
- CLI：`D:\work\things\saicmotor-cli-all\saicmotor-cli`
- 网关：`D:\work\things\saicmotor-cli-all\saicmotor-cli-mock-gateway`

---

## Task 1: 扩展 CLI AuthConfig 配置

**Files:**
- Modify: `src/config.ts`
- Test: `test/unit/config.test.ts`

- [ ] **Step 1: 写失败测试**

在 `test/unit/config.test.ts` 末尾追加：

```ts
it("supports exchange auth defaults via user config", () => {
  fs.writeFileSync(
    path.join(process.env.SAICMOTOR_HOME!, "config.json"),
    JSON.stringify({ auth: { type: "exchange", loopbackPort: 3000, callbackTimeoutMs: 90000 } })
  );
  const cfg = loadConfig();
  expect(cfg.auth.type).toBe("exchange");
  expect(cfg.auth.startPath).toBe("/auth/exchange/start");
  expect(cfg.auth.exchangePath).toBe("/auth/exchange");
  expect(cfg.auth.loopbackPort).toBe(3000);
  expect(cfg.auth.callbackTimeoutMs).toBe(90000);
});
```

确认文件顶部已 import `fs`、`path`、`loadConfig`，并在 beforeEach 中设置了 `SAICMOTOR_HOME`（沿用现有测试写法）。

- [ ] **Step 2: 运行，确认失败**

Run: `npx vitest run test/unit/config.test.ts`
Expected: FAIL（`startPath` 不存在 / type 类型不匹配）

- [ ] **Step 3: 修改 `src/config.ts`**

把 `AuthConfig` 接口替换为：

```ts
export interface AuthConfig {
  type: "password" | "exchange";
  loginPath: string;
  tokenPath: string;
  tokenHeader: string;
  tokenPrefix: string;
  startPath: string;
  exchangePath: string;
  loopbackHost: string;
  loopbackPort: number;
  callbackTimeoutMs: number;
}
```

把 `DEFAULT_CONFIG.auth` 替换为：

```ts
  auth: {
    type: "password",
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
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/config.test.ts`
Expected: PASS（全部用例）

- [ ] **Step 5: 提交**

```bash
git add src/config.ts test/unit/config.test.ts
git commit -m "feat(cli): AuthConfig 支持 exchange 与 loopback 配置"
```

---

## Task 2: 抽出 AuthProvider 接口，password 逻辑改为 PasswordProvider

**Files:**
- Create: `src/auth/provider.ts`
- Create: `src/auth/password.ts`（迁移自 `src/auth/login.ts`）
- Delete: `src/auth/login.ts`
- Modify: `src/auth/session.ts`
- Modify: `test/unit/auth-login.test.ts`

- [ ] **Step 1: 创建 `src/auth/provider.ts`**

```ts
import type { Config } from "../config";

export interface AuthProvider {
  /** 完成认证，返回网关 token */
  login(): Promise<string>;
}

export function createAuthProvider(config: Config): AuthProvider {
  if (config.auth.type === "exchange") {
    // Task 4 引入，先占位会导致编译错误，故此处延迟 require 风格不可用于 ESM。
    throw new Error("exchange provider 尚未实现");
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PasswordProvider } = require("./password") as { PasswordProvider: { new(c: Config): AuthProvider } };
  return new PasswordProvider(config);
}
```

> 说明：本步先用 PasswordProvider；Task 4 会把 `createAuthProvider` 改为顶部静态 import 两个实现。这里临时的 throw/require 在 Task 4 删除。

- [ ] **Step 2: 创建 `src/auth/password.ts`，迁移 login.ts 全部逻辑**

```ts
import type { Config } from "../config";
import { SaicmotorError } from "../engine/errors";
import { send } from "../engine/http";
import { getByPath } from "../engine/extract";
import { writeToken } from "./store";
import type { AuthProvider } from "./provider";

export class PasswordProvider implements AuthProvider {
  constructor(private readonly config: Config) {}

  async login(): Promise<string> {
    return loginWithPassword(this.config, this.username, this.password);
  }

  private get username(): string {
    const v = process.env.SAICMOTOR_USERNAME;
    if (v) return v;
    throw new SaicmotorError("auth", "缺少用户名", { hint: "设置 SAICMOTOR_USERNAME 或使用 auth login --username" });
  }
  private get password(): string {
    const v = process.env.SAICMOTOR_PASSWORD;
    if (v) return v;
    throw new SaicmotorError("auth", "缺少密码", { hint: "设置 SAICMOTOR_PASSWORD 或使用 auth login --password" });
  }
}

export async function loginWithPassword(config: Config, username: string, password: string): Promise<string> {
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

- [ ] **Step 3: 删除 `src/auth/login.ts`，改 `src/auth/session.ts`**

整体替换为：

```ts
import type { Config } from "../config";
import { SaicmotorError } from "../engine/errors";
import { readToken, readCredentials } from "./store";
import { createAuthProvider } from "./provider";

export async function ensureToken(config: Config, opts: { force?: boolean } = {}): Promise<string> {
  const cached = opts.force ? undefined : readToken();
  if (cached) return cached;
  if (config.auth.type === "password" && !readCredentials()) {
    throw new SaicmotorError("auth", "未登录，请先运行: saicmotor auth login --username <工号> --password <密码>");
  }
  return createAuthProvider(config).login();
}
```

- [ ] **Step 4: 更新测试 import**

`test/unit/auth-login.test.ts` 中把

```ts
import { login } from "../../src/auth/login";
```

改为

```ts
import { loginWithPassword as login } from "../../src/auth/password";
```

`login(config, "zhangsan", "123456")` 的调用签名不变，无需改其它代码。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run test/unit/auth-login.test.ts`
Expected: PASS（5 个用例）。注意 "throws when no credentials" 用例走 ensureToken，仍然报 `/auth login/`，因为默认 type=password。

- [ ] **Step 6: 全量构建 + 测试**

Run: `npm run build && npm test`
Expected: 编译无错，全部测试 PASS

- [ ] **Step 7: 提交**

```bash
git add -A src/auth test/unit/auth-login.test.ts
git commit -m "refactor(cli): 抽出 AuthProvider，password 逻辑迁移为 PasswordProvider"
```

---

## Task 3: CLI loopback 回调服务

**Files:**
- Create: `src/auth/loopback.ts`
- Test: `test/unit/auth-loopback.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/unit/auth-loopback.test.ts`：

```ts
import { describe, it, expect } from "vitest";
import http from "node:http";
import { waitForCallback } from "../../src/auth/loopback";

function get(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}${path}`, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode ?? 0)); })
      .on("error", reject);
  });
}

describe("loopback callback", () => {
  it("captures code and state from /callback", async () => {
    const cb = waitForCallback({ host: "127.0.0.1", port: 0, timeoutMs: 5000 });
    const port = cb.port;
    const resultPromise = cb.result;
    // 模拟浏览器跳转
    const status = await new Promise<number>((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/callback?code=code-123&state=st`, (r) => { r.resume(); r.on("end", () => resolve(r.statusCode ?? 0)); })
        .on("error", reject);
    });
    expect(status).toBe(200);
    expect(await resultPromise).toEqual({ code: "code-123", state: "st" });
    await cb.close();
  });

  it("times out without callback", async () => {
    const cb = waitForCallback({ host: "127.0.0.1", port: 0, timeoutMs: 100 });
    await expect(cb.result).rejects.toThrow(/超时/);
    await cb.close();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/auth-loopback.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/auth/loopback.ts`**

```ts
import http from "node:http";
import type { AddressInfo } from "node:net";
import { SaicmotorError } from "../engine/errors";

export interface CallbackParams {
  code: string;
  state: string;
}

export interface LoopbackHandle {
  port: number;
  result: Promise<CallbackParams>;
  close: () => Promise<void>;
}

const SUCCESS_HTML = "<html><body><h3>登录成功，可以关闭本页。</h3></body></html>";
const FAIL_HTML = "<html><body><h3>登录失败，请回到终端重新登录。</h3></body></html>";

export function waitForCallback(opts: { host: string; port: number; timeoutMs: number }): LoopbackHandle {
  let resolveFn!: (p: CallbackParams) => void;
  let rejectFn!: (e: Error) => void;
  const result = new Promise<CallbackParams>((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });

  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url ?? "/", `http://${opts.host}`);
      if (u.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const code = u.searchParams.get("code") ?? "";
      const state = u.searchParams.get("state") ?? "";
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(FAIL_HTML);
        rejectFn(new SaicmotorError("auth", "回调缺少 code"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(SUCCESS_HTML);
      resolveFn({ code, state });
    } catch (e) {
      res.writeHead(500).end();
      rejectFn(e as Error);
    }
  });

  server.listen(opts.port, opts.host);
  const port = (server.address() as AddressInfo).port;
  const timer = setTimeout(() => {
    rejectFn(new SaicmotorError("auth", "等待浏览器回调超时，请重试登录"));
  }, opts.timeoutMs);

  const close = () => new Promise<void>((r) => {
    clearTimeout(timer);
    server.close(() => r());
  });

  return { port, result, close };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/auth-loopback.test.ts`
Expected: PASS（2 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/auth/loopback.ts test/unit/auth-loopback.test.ts
git commit -m "feat(cli): loopback 回调服务接收 OIDC code"
```

---

## Task 4: ExchangeProvider + 打开浏览器

**Files:**
- Create: `src/auth/open.ts`
- Create: `src/auth/exchange.ts`
- Modify: `src/auth/provider.ts`
- Test: `test/unit/auth-exchange.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `test/unit/auth-exchange.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../src/config";
import { ExchangeProvider } from "../../src/auth/exchange";
import { startServer, MockServer } from "../helpers/server";
import { readTokenFromHome } from "./auth-utils";

describe("exchange provider", () => {
  let tmp: string;
  let gateway: MockServer | undefined;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-"));
    process.env.SAICMOTOR_HOME = tmp;
  });
  afterEach(async () => {
    delete process.env.SAICMOTOR_HOME;
    fs.rmSync(tmp, { recursive: true, force: true });
    await gateway?.close();
  });

  it("start → callback → exchange 换得 token", async () => {
    gateway = await startServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.startsWith("/auth/exchange/start")) {
        // authUrl 指回本测试服务器的 /fake-callback，模拟浏览器跳转
        const port = new URL(req.url, "http://x").searchParams.get("port");
        res.end(JSON.stringify({ code: 0, data: { authUrl: `http://127.0.0.1:${port}/callback?code=C1&state=S1`, state: "S1" } }));
      } else {
        res.end(JSON.stringify({ code: 0, data: { token: "gw-tok" } }));
      }
    });
    const config: ReturnType<typeof loadConfig> = {
      ...loadConfig(),
      gateway: gateway.url,
      auth: { ...loadConfig().auth, type: "exchange", callbackTimeoutMs: 5000 },
    };
    const token = await new ExchangeProvider(config).login();
    expect(token).toBe("gw-tok");
    expect(readTokenFromHome(tmp)).toBe("gw-tok");
  });

  it("state 不匹配时报错", async () => {
    gateway = await startServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url?.startsWith("/auth/exchange/start")) {
        const port = new URL(req.url, "http://x").searchParams.get("port");
        res.end(JSON.stringify({ code: 0, data: { authUrl: `http://127.0.0.1:${port}/callback?code=C1&state=WRONG`, state: "S1" } }));
      } else {
        res.end(JSON.stringify({ code: 0, data: { token: "gw-tok" } }));
      }
    });
    const config: ReturnType<typeof loadConfig> = {
      ...loadConfig(),
      gateway: gateway.url,
      auth: { ...loadConfig().auth, type: "exchange", callbackTimeoutMs: 5000 },
    };
    await expect(new ExchangeProvider(config).login()).rejects.toThrow(/state/);
  });
});
```

创建共享小工具 `test/unit/auth-utils.ts`：

```ts
import fs from "node:fs";
import path from "node:path";

export function readTokenFromHome(home: string): string | undefined {
  try {
    return (JSON.parse(fs.readFileSync(path.join(home, "token.json"), "utf8")) as { token?: string }).token;
  } catch { return undefined; }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/auth-exchange.test.ts`
Expected: FAIL（exchange 模块不存在）

- [ ] **Step 3: 创建 `src/auth/open.ts`**

```ts
import { exec } from "node:child_process";
import { SaicmotorError } from "../engine/errors";

export function openBrowser(url: string): void {
  let cmd: string;
  if (process.platform === "win32") cmd = `start "" "${url}"`;
  else if (process.platform === "darwin") cmd = `open "${url}"`;
  else cmd = `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) throw new SaicmotorError("network", "无法打开浏览器", { hint: `请手动访问: ${url}` });
  });
}
```

- [ ] **Step 4: 创建 `src/auth/exchange.ts`**

```ts
import type { Config } from "../config";
import { SaicmotorError } from "../engine/errors";
import { send } from "../engine/http";
import { getByPath } from "../engine/extract";
import { writeToken } from "./store";
import { waitForCallback } from "./loopback";
import { openBrowser } from "./open";
import type { AuthProvider } from "./provider";

interface StartData { authUrl: string; state: string; }

export class ExchangeProvider implements AuthProvider {
  constructor(private readonly config: Config) {}

  async login(): Promise<string> {
    const a = this.config.auth;
    const handle = waitForCallback({ host: a.loopbackHost, port: a.loopbackPort, timeoutMs: a.callbackTimeoutMs });
    const startResp = await send({
      method: "GET",
      url: `${this.config.gateway}${a.startPath}?port=${handle.port}`,
    });
    const start = getByPath(startResp.body, "data") as StartData | undefined;
    if (!start || !start.authUrl || !start.state) {
      await handle.close();
      throw new SaicmotorError("auth", "网关未返回授权地址");
    }
    openBrowser(start.authUrl);

    let cb;
    try {
      cb = await handle.result;
    } finally {
      await handle.close();
    }
    if (cb.state !== start.state) {
      throw new SaicmotorError("auth", "回调 state 不匹配，请重新登录");
    }

    const exResp = await send({
      method: "POST",
      url: `${this.config.gateway}${a.exchangePath}`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cb.code, state: cb.state }),
    });
    const body = exResp.body as Record<string, unknown> | undefined;
    if (body && typeof body === "object" && body.code !== 0) {
      throw new SaicmotorError("auth", `SSO 登录失败: ${body.msg ?? "未知错误"}`);
    }
    const token = getByPath(body, a.tokenPath);
    if (typeof token !== "string" || token.length === 0) {
      throw new SaicmotorError("auth", "exchange 响应中未找到 token");
    }
    writeToken(token);
    return token;
  }
}
```

- [ ] **Step 5: 改 `src/auth/provider.ts` 为静态分发**

整体替换为：

```ts
import type { Config } from "../config";
import { PasswordProvider } from "./password";
import { ExchangeProvider } from "./exchange";
import type { AuthProvider } from "./provider-types";

export type { AuthProvider } from "./provider-types";

export function createAuthProvider(config: Config): AuthProvider {
  if (config.auth.type === "exchange") return new ExchangeProvider(config);
  return new PasswordProvider(config);
}
```

把接口挪到新文件 `src/auth/provider-types.ts`：

```ts
export interface AuthProvider {
  login(): Promise<string>;
}
```

并更新 `password.ts` / `exchange.ts` 中 `import type { AuthProvider } from "./provider"` 为 `from "./provider-types"`，更新 `session.ts` 中 `createAuthProvider` 仍由 `./provider` 导入（不变）。

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run test/unit/auth-exchange.test.ts`
Expected: PASS（2 个用例）

- [ ] **Step 7: 全量构建测试**

Run: `npm run build && npm test`
Expected: 全部 PASS

- [ ] **Step 8: 提交**

```bash
git add -A src/auth test/unit
git commit -m "feat(cli): ExchangeProvider 走 loopback 完成飞书授权换 token"
```

---

## Task 5: CLI auth 命令适配 exchange

**Files:**
- Modify: `src/cli/auth.ts`

- [ ] **Step 1: 改写 `src/cli/auth.ts` 的 login 子命令**

把 import 中的 `login` 删除，新增 `createAuthProvider`，并替换 login 命令定义：

```ts
import { createAuthProvider } from "../auth/provider";
```

```ts
  authCmd.command("login")
    .option("--username <u>", "工号（仅 password 模式需要）")
    .option("--password <p>", "密码（仅 password 模式需要）")
    .action(async (opts: { username?: string; password?: string }) => {
      try {
        const config = loadConfig();
        clearToken();
        if (config.auth.type === "password") {
          if (!opts.username || !opts.password) {
            throw new SaicmotorError("validation", "password 模式需要 --username 和 --password");
          }
          writeCredentials({ username: opts.username, password: opts.password });
        }
        const token = await createAuthProvider(config).login();
        console.log(`已登录，token 已缓存（${token.slice(0, 8)}…）`);
      } catch (e) { handleError(e); }
    });
```

确认顶部已 import `SaicmotorError`（from `../engine/errors`）、`writeCredentials`、`clearToken`。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 无错误

- [ ] **Step 3: 手动冒烟（password 模式不依赖浏览器）**

Run:
```bash
node dist/src/cli/index.js auth login 2>&1 | head -3
```
Expected（默认 password 且未提供参数）：以 JSON 信封报错退出，提示需要 --username/--password。

- [ ] **Step 4: 提交**

```bash
git add src/cli/auth.ts
git commit -m "feat(cli): auth login 支持 exchange（浏览器授权）模式"
```

---

## Task 6: 网关 IdP 配置属性与用户目录扩展

**Files（网关仓库）：**
- Modify: `src/main/resources/application.yml`
- Create: `src/main/java/com/example/gateway/auth/IdpProperties.java`
- Modify: `src/main/java/com/example/gateway/auth/UserDirectory.java`

- [ ] **Step 1: 创建 `IdpProperties.java`**

```java
package com.example.gateway.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Component
@ConfigurationProperties(prefix = "saicmotor.idp")
public class IdpProperties {

    private String provider = "feishu";
    private Feishu feishu = new Feishu();
    private long stateTtlSeconds = 300;

    public static class Feishu {
        private String baseUrl = "https://open.feishu.cn";
        private String appId = "";
        private String appSecret = "";

        public String getBaseUrl() { return baseUrl; }
        public void setBaseUrl(String v) { this.baseUrl = v; }
        public String getAppId() { return appId; }
        public void setAppId(String v) { this.appId = v; }
        public String getAppSecret() { return appSecret; }
        public void setAppSecret(String v) { this.appSecret = v; }
    }

    public String getProvider() { return provider; }
    public void setProvider(String v) { this.provider = v; }
    public Feishu getFeishu() { return feishu; }
    public void setFeishu(Feishu v) { this.feishu = v; }
    public long getStateTtlSeconds() { return stateTtlSeconds; }
    public void setStateTtlSeconds(long v) { this.stateTtlSeconds = v; }
}
```

- [ ] **Step 2: `UserDirectory` 增加 email 字段与 findByEmail**

在 `User` 内增加：

```java
        private String email;
        public String getEmail() { return email; }
        public void setEmail(String email) { this.email = email; }
```

在类中增加方法：

```java
    public User findByEmail(String email) {
        if (users == null || email == null) return null;
        return users.stream().filter(u -> email.equalsIgnoreCase(u.getEmail())).findFirst().orElse(null);
    }
```

- [ ] **Step 3: 更新 `application.yml`**

```yaml
server:
  port: 8081

gateway:
  api-backend: http://localhost:8080
  users:
    - { username: zhangsan, password: "123456", user-id: zhangsan, email: "zhangsan@saicmotor.com" }
    - { username: lisi,     password: "123456", user-id: lisi,     email: "lisi@saicmotor.com" }

saicmotor:
  idp:
    provider: feishu
    state-ttl-seconds: 300
    feishu:
      base-url: https://open.feishu.cn
      app-id: ${FEISHU_APP_ID:}
      app-secret: ${FEISHU_APP_SECRET:}
```

- [ ] **Step 4: 编译确认**

Run（网关仓库目录）：`./mvnw -q compile`
Expected: BUILD 成功无输出

- [ ] **Step 5: 提交**

```bash
git add src/main/resources/application.yml src/main/java/com/example/gateway/auth/IdpProperties.java src/main/java/com/example/gateway/auth/UserDirectory.java
git commit -m "feat(gateway): IdP 配置属性与用户 email 目录"
```

---

## Task 7: 网关 state 存储

**Files:**
- Create: `src/main/java/com/example/gateway/auth/StateStore.java`
- Test: `src/test/java/com/example/gateway/auth/StateStoreTest.java`

- [ ] **Step 1: 写失败测试**

```java
package com.example.gateway.auth;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class StateStoreTest {

    private final StateStore store = new StateStore(1);

    @Test
    void validatesAndConsumesStateOnce() throws Exception {
        String state = store.create("http://localhost:3000/callback");
        assertTrue(store.validate(state, "http://localhost:3000/callback"));
        assertFalse(store.validate(state, "http://localhost:3000/callback")); // 已消费
    }

    @Test
    void rejectsWrongRedirect() {
        String state = store.create("http://localhost:3000/callback");
        assertFalse(store.validate(state, "http://localhost:3001/callback"));
    }

    @Test
    void rejectsExpired() throws Exception {
        StateStore tiny = new StateStore(0);
        String state = tiny.create("http://localhost:3000/callback");
        Thread.sleep(50);
        assertFalse(tiny.validate(state, "http://localhost:3000/callback"));
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `./mvnw -q -Dtest=StateStoreTest test`
Expected: 编译失败（类不存在）

- [ ] **Step 3: 实现 `StateStore.java`**

```java
package com.example.gateway.auth;

import org.springframework.stereotype.Component;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class StateStore {

    private record Entry(String redirectUri, long expiresAt) {}

    private final Map<String, Entry> entries = new ConcurrentHashMap<>();
    private final SecureRandom random = new SecureRandom();
    private final long ttlSeconds;

    public StateStore(IdpProperties props) {
        this.ttlSeconds = props.getStateTtlSeconds();
    }

    private StateStore(long ttlSeconds) {
        this.ttlSeconds = ttlSeconds;
    }

    public String create(String redirectUri) {
        byte[] bytes = new byte[24];
        random.nextBytes(bytes);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        entries.put(state, new Entry(redirectUri, System.currentTimeMillis() + ttlSeconds * 1000));
        return state;
    }

    public boolean validate(String state, String redirectUri) {
        if (state == null) return false;
        Entry e = entries.remove(state); // 单次使用
        if (e == null) return false;
        if (System.currentTimeMillis() > e.expiresAt()) return false;
        return e.redirectUri().equals(redirectUri);
    }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `./mvnw -q -Dtest=StateStoreTest test`
Expected: Tests run: 3, Failures: 0

- [ ] **Step 5: 提交**

```bash
git add src/main/java/com/example/gateway/auth/StateStore.java src/test/java/com/example/gateway/auth/StateStoreTest.java
git commit -m "feat(gateway): 短 TTL 单次使用的 state 存储"
```

---

## Task 8: IdpProvider 抽象与 FeishuIdpProvider

**Files:**
- Create: `src/main/java/com/example/gateway/auth/IdpProvider.java`
- Create: `src/main/java/com/example/gateway/auth/IdpUser.java`
- Create: `src/main/java/com/example/gateway/auth/FeishuIdpProvider.java`
- Test: `src/test/java/com/example/gateway/auth/FeishuIdpProviderTest.java`

- [ ] **Step 1: 写失败测试**

创建 `FeishuIdpProviderTest.java`：

```java
package com.example.gateway.auth;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.junit.jupiter.api.Assertions.*;

class FeishuIdpProviderTest {

    private final RestClient.Builder builder = RestClient.builder().baseUrl("https://open.feishu.cn");
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

    private FeishuIdpProvider provider() {
        IdpProperties props = new IdpProperties();
        props.getFeishu().setAppId("app1");
        props.getFeishu().setAppSecret("sec1");
        return new FeishuIdpProvider(props, builder);
    }

    @Test
    void exchangesCodeForUserEmail() {
        server.expect(requestTo("/open-apis/auth/v3/app_access_token/internal"))
              .andRespond(withSuccess("{\"code\":0,\"app_access_token\":\"app-tok\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("/open-apis/authen/v1/oidc/access_token"))
              .andRespond(withSuccess("{\"code\":0,\"data\":{\"access_token\":\"u-tok\"}}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("/open-apis/authen/v1/user_info"))
              .andRespond(withSuccess("{\"code\":0,\"data\":{\"email\":\"zhangsan@saicmotor.com\",\"name\":\"张三\"}}", MediaType.APPLICATION_JSON));

        IdpUser user = provider().exchangeCode("auth-code", "http://localhost:3000/callback");
        assertEquals("zhangsan@saicmotor.com", user.email());
        assertEquals("张三", user.name());
        server.verify();
    }

    @Test
    void throwsWhenFeishuCodeInvalid() {
        server.expect(requestTo("/open-apis/auth/v3/app_access_token/internal"))
              .andRespond(withSuccess("{\"code\":0,\"app_access_token\":\"app-tok\"}", MediaType.APPLICATION_JSON));
        server.expect(requestTo("/open-apis/authen/v1/oidc/access_token"))
              .andRespond(withSuccess("{\"code\":20036,\"msg\":\"invalid code\"}", MediaType.APPLICATION_JSON));

        assertThrows(RuntimeException.class,
            () -> provider().exchangeCode("bad", "http://localhost:3000/callback"));
    }
}
```

- [ ] **Step 2: 运行确认失败**

Run: `./mvnw -q -Dtest=FeishuIdpProviderTest test`
Expected: 编译失败（类不存在）

- [ ] **Step 3: 创建 `IdpUser.java`**

```java
package com.example.gateway.auth;

public record IdpUser(String email, String name) {}
```

- [ ] **Step 4: 创建 `IdpProvider.java`**

```java
package com.example.gateway.auth;

public interface IdpProvider {
    String buildAuthorizeUrl(String state, String redirectUri);
    IdpUser exchangeCode(String code, String redirectUri);
}
```

- [ ] **Step 5: 创建 `FeishuIdpProvider.java`**

```java
package com.example.gateway.auth;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Component
public class FeishuIdpProvider implements IdpProvider {

    private final IdpProperties props;
    private final RestClient client;

    public FeishuIdpProvider(IdpProperties props, RestClient.Builder clientBuilder) {
        this.props = props;
        this.client = clientBuilder.baseUrl(props.getFeishu().getBaseUrl()).build();
    }

    @Override
    public String buildAuthorizeUrl(String state, String redirectUri) {
        String base = props.getFeishu().getBaseUrl().replace("open.feishu.cn", "accounts.feishu.cn");
        return base + "/open-apis/authen/v1/authorize?app_id=" + enc(props.getFeishu().getAppId())
            + "&redirect_uri=" + enc(redirectUri) + "&state=" + enc(state);
    }

    @Override
    public IdpUser exchangeCode(String code, String redirectUri) {
        String appToken = fetchAppAccessToken();
        JsonNode tokenResp = client.post()
            .uri("/open-apis/authen/v1/oidc/access_token")
            .header("Authorization", "Bearer " + appToken)
            .body(Map.of("grant_type", "authorization_code", "code", code))
            .retrieve().body(JsonNode.class);
        ensureFeishuCode(tokenResp);
        String userAccessToken = tokenResp.path("data").path("access_token").asText();

        JsonNode info = client.get()
            .uri("/open-apis/authen/v1/user_info")
            .header("Authorization", "Bearer " + userAccessToken)
            .retrieve().body(JsonNode.class);
        ensureFeishuCode(info);
        JsonNode data = info.path("data");
        return new IdpUser(data.path("email").asText(null), data.path("name").asText(null));
    }

    private String fetchAppAccessToken() {
        JsonNode resp = client.post()
            .uri("/open-apis/auth/v3/app_access_token/internal")
            .body(Map.of("app_id", props.getFeishu().getAppId(),
                         "app_secret", props.getFeishu().getAppSecret()))
            .retrieve().body(JsonNode.class);
        ensureFeishuCode(resp);
        return resp.path("app_access_token").asText();
    }

    private void ensureFeishuCode(JsonNode node) {
        if (node == null || node.path("code").asInt(-1) != 0) {
            String msg = node == null ? "无响应" : node.path("msg").asText("飞书返回错误");
            throw new RuntimeException("飞书接口错误: " + msg);
        }
    }

    private static String enc(String s) {
        return URLEncoder.encode(s, StandardCharsets.UTF_8);
    }
}
```

- [ ] **Step 6: 运行确认通过**

Run: `./mvnw -q -Dtest=FeishuIdpProviderTest test`
Expected: Tests run: 2, Failures: 0

- [ ] **Step 7: 提交**

```bash
git add src/main/java/com/example/gateway/auth/IdpProvider.java src/main/java/com/example/gateway/auth/IdpUser.java src/main/java/com/example/gateway/auth/FeishuIdpProvider.java src/test/java/com/example/gateway/auth/FeishuIdpProviderTest.java
git commit -m "feat(gateway): IdpProvider 抽象与飞书实现"
```

---

## Task 9: 网关 exchange 接口

**Files:**
- Create: `src/main/java/com/example/gateway/auth/ExchangeController.java`
- Modify: `src/main/java/com/example/gateway/auth/AuthController.java`（无需改动逻辑，仅确认错误信封风格一致）
- Test: `src/test/java/com/example/gateway/auth/ExchangeControllerTest.java`

- [ ] **Step 1: 写失败测试**

```java
package com.example.gateway.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ExchangeControllerTest {

    @Autowired private MockMvc mvc;
    @MockBean private IdpProvider idpProvider;

    @Test
    void startReturnsAuthUrlAndState() throws Exception {
        when(idpProvider.buildAuthorizeUrl(any(), any()))
            .thenReturn("https://accounts.feishu.cn/open-apis/authen/v1/authorize?x=1");

        mvc.perform(get("/auth/exchange/start").param("port", "3000"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(0))
           .andExpect(jsonPath("$.data.authUrl").isNotEmpty())
           .andExpect(jsonPath("$.data.state").isNotEmpty());
    }

    @Test
    void exchangeSuccessIssuesToken() throws Exception {
        when(idpProvider.buildAuthorizeUrl(any(), any())).thenReturn("https://x");
        when(idpProvider.exchangeCode(eq("C1"), any()))
            .thenReturn(new IdpUser("zhangsan@saicmotor.com", "张三"));

        String state = fetchState();
        mvc.perform(post("/auth/exchange")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"C1\",\"state\":\"" + state + "\"}"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(0))
           .andExpect(jsonPath("$.data.token").isNotEmpty());
    }

    @Test
    void exchangeBadStateReturnsError() throws Exception {
        mvc.perform(post("/auth/exchange")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"C1\",\"state\":\"nope\"}"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(4002));
    }

    @Test
    void exchangeUnmappedUserReturnsError() throws Exception {
        when(idpProvider.buildAuthorizeUrl(any(), any())).thenReturn("https://x");
        when(idpProvider.exchangeCode(any(), any()))
            .thenReturn(new IdpUser("ghost@saicmotor.com", "幽灵"));
        String state = fetchState();

        mvc.perform(post("/auth/exchange")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"C1\",\"state\":\"" + state + "\"}"))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$.code").value(4003));
    }

    private String fetchState() throws Exception {
        String json = mvc.perform(get("/auth/exchange/start").param("port", "3000"))
            .andReturn().getResponse().getContentAsString();
        return com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
            .readTree(json).path("data").path("state").asText();
    }
}
```

注意：`IdpProvider` 是接口且 `FeishuIdpProvider` 标注了 `@Component`，`@MockBean` 会在测试上下文里替换它。

- [ ] **Step 2: 运行确认失败**

Run: `./mvnw -q -Dtest=ExchangeControllerTest test`
Expected: 404 / 无映射（测试失败）

- [ ] **Step 3: 实现 `ExchangeController.java`**

```java
package com.example.gateway.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class ExchangeController {

    private static final Logger log = LoggerFactory.getLogger(ExchangeController.class);

    private final StateStore stateStore;
    private final IdpProvider idpProvider;
    private final UserDirectory userDirectory;
    private final TokenService tokenService;

    public ExchangeController(StateStore stateStore, IdpProvider idpProvider,
                              UserDirectory userDirectory, TokenService tokenService) {
        this.stateStore = stateStore;
        this.idpProvider = idpProvider;
        this.userDirectory = userDirectory;
        this.tokenService = tokenService;
    }

    @GetMapping("/auth/exchange/start")
    public Map<String, Object> start(@RequestParam int port) {
        if (port < 1024 || port > 65535) {
            return error(4000, "非法端口");
        }
        String redirectUri = "http://localhost:" + port + "/callback";
        String state = stateStore.create(redirectUri);
        String authUrl = idpProvider.buildAuthorizeUrl(state, redirectUri);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("code", 0);
        resp.put("msg", "ok");
        resp.put("data", Map.of("authUrl", authUrl, "state", state));
        return resp;
    }

    @PostMapping("/auth/exchange")
    public Map<String, Object> exchange(@RequestBody Map<String, String> body) {
        String code = body.get("code");
        String state = body.get("state");
        String redirectUri = "http://localhost:3000/callback";
        if (!stateStore.validate(state, redirectUri)) {
            return error(4002, "state 无效或已过期");
        }
        IdpUser idpUser;
        try {
            idpUser = idpProvider.exchangeCode(code, redirectUri);
        } catch (Exception e) {
            log.warn("code 换取失败", e);
            return error(4004, "SSO code 无效或 IdP 不可达: " + e.getMessage());
        }
        UserDirectory.User user = userDirectory.findByEmail(idpUser.email());
        if (user == null) {
            return error(4003, "未找到对应员工: " + idpUser.email());
        }
        String token = tokenService.issue(user.getUsername(), user.getUserId());
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("code", 0);
        resp.put("msg", "ok");
        resp.put("data", Map.of("token", token));
        return resp;
    }

    private Map<String, Object> error(int code, String msg) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("code", code);
        resp.put("msg", msg);
        resp.put("data", null);
        return resp;
    }
}
```

POC 固定 3000，故 redirectUri 直接取 3000，与 CLI 默认配置一致。

- [ ] **Step 4: 运行确认通过**

Run: `./mvnw -q -Dtest=ExchangeControllerTest test`
Expected: Tests run: 4, Failures: 0

- [ ] **Step 5: 跑全部网关测试**

Run: `./mvnw test`
Expected: 既有 AuthController/TokenService/GatewayFilter 测试 + 新测试全部通过

- [ ] **Step 6: 提交**

```bash
git add src/main/java/com/example/gateway/auth/ExchangeController.java src/test/java/com/example/gateway/auth/ExchangeControllerTest.java
git commit -m "feat(gateway): /auth/exchange start 与 token 签发接口"
```

---

## Task 10: 真实飞书端到端人工验证

**Files:**
- Create（CLI 仓库）: `docs/sprint/sprint-5-sso-manual-verification.md`
- Modify: `docs/sprint/sprint-5-sso-integration.md`

- [ ] **Step 1: 按手册申请飞书应用**

严格照 `howto/FEISHU-OIDC-SETUP.md` 完成：建应用、登记 `http://localhost:3000/callback`、发布、设置 `FEISHU_APP_ID` / `FEISHU_APP_SECRET`。

- [ ] **Step 2: 起网关与业务后端**

```bash
# 网关（端口 8081）
cd /d/work/things/saicmotor-cli-all/saicmotor-cli-mock-gateway
FEISHU_APP_ID=cli_xxx FEISHU_APP_SECRET=xxx ./mvnw spring-boot:run
# 业务后端（端口 8080）
cd /d/work/things/saicmotor-cli-all/saicmotor-cli-mock-services
./mvnw spring-boot:run
```

- [ ] **Step 3: 确保登录飞书账号的邮箱与网关用户对得上**

网关用户 `zhangsan@saicmotor.com`。若你的飞书邮箱不同，在网关 `application.yml` 给某个用户改成你的真实飞书邮箱，重启网关。

- [ ] **Step 4: 执行并记录**

```bash
cd /d/work/things/saicmotor-cli-all/saicmotor-cli
npm run build
node dist/src/cli/index.js auth login
node dist/src/cli/index.js leave balance query
node dist/src/cli/index.js auth status
node dist/src/cli/index.js auth logout
```

创建 `docs/sprint/sprint-5-sso-manual-verification.md`，参照 Sprint 4 验证文档格式，逐条记录：命令、预期、实际结果（截图或文字）、时间。必须覆盖：浏览器自动打开、授权成功页、token 缓存、业务命令成功、登出。

- [ ] **Step 5: 更新 sprint-5 总文档**

把 `docs/sprint/sprint-5-sso-integration.md` 状态改为进行中/完成，填入选型结论（飞书网页授权）与各任务链接。

- [ ] **Step 6: 更新 ARCHITECTURE.md §7**

`exchange` 行状态改为 ✅ 已实现，并补一句 IdpProvider 抽象说明。

- [ ] **Step 7: 提交**

```bash
git add docs/sprint/sprint-5-sso-manual-verification.md docs/sprint/sprint-5-sso-integration.md docs/ARCHITECTURE.md
git commit -m "docs(sprint5): 真实飞书端到端人工验证与文档更新"
```

---

## 验收标准（整体）

1. CLI `npm run build && npm test` 全绿；默认 password 行为与改造前一致。
2. 网关 `./mvnw test` 全绿。
3. 把 CLI 配置改为 `auth.type=exchange` 后，`auth login` 自动开浏览器完成飞书授权，leave/attendance 命令正常工作。
4. 所有环境差异（地址、端口、超时、飞书凭证）均通过配置/环境变量注入，无硬编码、无凭证入库。
