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
        const port = new URL(req.url, "http://x").searchParams.get("port");
        res.end(JSON.stringify({ code: 0, data: { authUrl: `http://127.0.0.1:${port}/callback?code=C1&state=S1`, state: "S1" } }));
      } else {
        res.end(JSON.stringify({ code: 0, data: { token: "gw-tok" } }));
      }
    });
    const base = loadConfig();
    const config: ReturnType<typeof loadConfig> = {
      ...base,
      gateway: gateway.url,
      auth: { ...base.auth, type: "exchange", callbackTimeoutMs: 5000 },
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
    const base = loadConfig();
    const config: ReturnType<typeof loadConfig> = {
      ...base,
      gateway: gateway.url,
      auth: { ...base.auth, type: "exchange", callbackTimeoutMs: 5000 },
    };
    await expect(new ExchangeProvider(config).login()).rejects.toThrow(/state/);
  });
});
