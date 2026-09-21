import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMethod } from "../../src/engine/run";
import { loadConfig } from "../../src/config";
import { writeCredentials, writeToken } from "../../src/auth/store";
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
    const result = await runMethod(config, service, "balance", "query", method, {});
    expect(result.data).toEqual({ annual_balance: 5 });
    const bal = server!.requests.find((r) => r.url === "/leave/balance")!;
    expect(bal.headers["authorization"]).toBe("Bearer tok");
  });

  it("relogs in on 401 and retries", async () => {
    writeToken("stale");
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
    const result = await runMethod(config, service, "balance", "query", method, {});
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
    await expect(runMethod(config, service, "balance", "query", method, {})).rejects.toThrow(/年假余额不足/);
  });

  it("dry-run returns request without sending", async () => {
    const config = { ...loadConfig(), gateway: "http://localhost:1" };
    const result = await runMethod(config, service, "balance", "query", method, {}, { dryRun: true });
    expect((result.data as any).dryRun).toBe(true);
  });
});
