import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../src/config";
import { loadCatalog } from "../../src/engine/catalog";
import { runMethod } from "../../src/engine/run";
import { writeCredentials, writeToken, clearToken } from "../../src/auth/store";
import { startServer, MockServer } from "../helpers/server";

describe("leave through gateway end-to-end", () => {
  let tmp: string;
  let server: MockServer | undefined;
  const apps: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-"));
    process.env.SAICMOTOR_HOME = tmp;
    // __dirname points here regardless of vitest --root / CWD
    process.env.SAICMOTOR_CATALOG = path.resolve(__dirname, "..", "..", "catalog", "services");
    writeCredentials({ username: "zhangsan", password: "123456" });
    apps.length = 0;
  });

  afterEach(async () => {
    delete process.env.SAICMOTOR_HOME;
    delete process.env.SAICMOTOR_CATALOG;
    fs.rmSync(tmp, { recursive: true, force: true });
    await server?.close();
  });

  /** 标准 mock gateway：token 固定为 "tok-zhangsan" */
  function mockGateway() {
    return startServer((req, res, ctx) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/auth/login") {
        return res.end(
          JSON.stringify({ code: 0, msg: "ok", data: { token: "tok-zhangsan" } }),
        );
      }
      const auth = req.headers.authorization ?? "";
      if (auth !== "Bearer tok-zhangsan") {
        res.statusCode = 401;
        return res.end(JSON.stringify({ code: 401, msg: "未登录" }));
      }
      if (req.url === "/leave/balance") {
        return res.end(
          JSON.stringify({ code: 0, data: { annual_balance: 5, used: apps.length } }),
        );
      }
      if (req.url === "/leave/applications") {
        const body = JSON.parse(ctx.body || "{}");
        apps.push({ ...body, application_id: "APP-1", status: "PENDING" });
        return res.end(
          JSON.stringify({ code: 0, data: { application_id: "APP-1", status: "PENDING" } }),
        );
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 404, msg: "not found" }));
    });
  }

  it("balance then submit round-trips through gateway", async () => {
    server = await mockGateway();
    const config = { ...loadConfig(), gateway: server!.url };
    const service = loadCatalog().find((s) => s.name === "leave")!;
    const balanceMethod = service.resources.balance.methods.query;
    const submitMethod = service.resources.applications.methods.submit;

    const bal = await runMethod(config, service, "balance", "query", balanceMethod, {});
    expect((bal.data as any).annual_balance).toBe(5);

    const sub = await runMethod(config, service, "applications", "submit", submitMethod, {
      start_date: "2026-09-21",
      end_date: "2026-09-22",
      reason: "年假",
    });
    expect((sub.data as any).application_id).toBe("APP-1");

    expect(server!.requests.filter((r) => r.url === "/auth/login")).toHaveLength(1);
  });

  it("rejects missing required param before sending", async () => {
    server = await mockGateway();
    const config = { ...loadConfig(), gateway: server!.url };
    const service = loadCatalog().find((s) => s.name === "leave")!;
    const submitMethod = service.resources.applications.methods.submit;

    // start_date 是 required，不传直接抛 validation error（不走到 HTTP）
    await expect(
      runMethod(config, service, "applications", "submit", submitMethod, { end_date: "2026-09-22", reason: "年假" }),
    ).rejects.toThrow(/缺少必填参数/);
  });

  it("dry-run shows preview without sending", async () => {
    const config = { ...loadConfig(), gateway: "http://localhost:1" };
    const service = loadCatalog().find((s) => s.name === "leave")!;
    const submitMethod = service.resources.applications.methods.submit;

    const result = await runMethod(
      config, service, "applications", "submit", submitMethod,
      { start_date: "2026-09-21", end_date: "2026-09-22", reason: "年假" },
      { dryRun: true },
    );
    expect((result.data as any).dryRun).toBe(true);
  });

  it("relogs in on 401 and retries successfully", async () => {
    writeToken("stale-tok"); // 预埋过期 token
    let logins = 0;

    server = await startServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/auth/login") {
        logins++;
        return res.end(JSON.stringify({ code: 0, data: { token: `tok-fresh-${logins}` } }));
      }
      const auth = req.headers.authorization ?? "";
      // 只接受新 token（第二次登录后得到的），过期 token → 401
      if (auth === "Bearer tok-fresh-1") {
        if (req.url === "/leave/balance") {
          return res.end(JSON.stringify({ code: 0, data: { annual_balance: 5 } }));
        }
      }
      res.statusCode = 401;
      res.end(JSON.stringify({ code: 401, msg: "未登录" }));
    });

    const config = { ...loadConfig(), gateway: server!.url };
    const service = loadCatalog().find((s) => s.name === "leave")!;
    const balMethod = service.resources.balance.methods.query;

    const bal = await runMethod(config, service, "balance", "query", balMethod, {});
    expect((bal.data as any).annual_balance).toBe(5);
    expect(logins).toBe(1); // 只重登了一次
  });
});