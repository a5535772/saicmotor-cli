import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../src/config";
import { loginWithPassword as login } from "../../src/auth/password";
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
