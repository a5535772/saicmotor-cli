import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../../src/config";
import { loadCatalog } from "../../src/engine/catalog";
import { runMethod } from "../../src/engine/run";
import { writeCredentials, writeToken, clearToken } from "../../src/auth/store";
import { startServer, MockServer } from "../helpers/server";

describe("attendance through gateway end-to-end", () => {
  let tmp: string;
  let server: MockServer | undefined;
  const corrections: Array<Record<string, unknown>> = [];

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-"));
    process.env.SAICMOTOR_HOME = tmp;
    // __dirname points here regardless of vitest --root / CWD
    process.env.SAICMOTOR_CATALOG = path.resolve(__dirname, "..", "..", "catalog", "services");
    writeCredentials({ username: "zhangsan", password: "123456" });
    corrections.length = 0;
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
      if (req.url === "/attendance/records") {
        return res.end(
          JSON.stringify({ code: 0, data: { work_days: 22, late_days: 1, early_days: 0 } }),
        );
      }
      if (req.url === "/attendance/corrections") {
        const body = JSON.parse(ctx.body || "{}");
        corrections.push({ ...body, correction_id: "COR-1", status: "PENDING" });
        return res.end(
          JSON.stringify({ code: 0, data: { correction_id: "COR-1", status: "PENDING" } }),
        );
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 404, msg: "not found" }));
    });
  }

  it("records then corrections round-trips through gateway", async () => {
    server = await mockGateway();
    const config = { ...loadConfig(), gateway: server!.url };
    const service = loadCatalog().find((s) => s.name === "attendance")!;
    const recordsMethod = service.resources.records.methods.query;
    const submitMethod = service.resources.corrections.methods.submit;

    // 1. 查打卡记录
    const rec = await runMethod(config, service, "records", "query", recordsMethod, {});
    expect((rec.data as any).work_days).toBe(22);
    expect((rec.data as any).late_days).toBe(1);

    // 2. 提交补卡申请
    const sub = await runMethod(config, service, "corrections", "submit", submitMethod, {
      date: "2026-09-21",
      reason: "忘记打卡",
    });
    expect((sub.data as any).correction_id).toBe("COR-1");
    expect((sub.data as any).status).toBe("PENDING");

    // 3. 只登录了一次（token 缓存）
    expect(server!.requests.filter((r) => r.url === "/auth/login")).toHaveLength(1);
  });

  it("rejects missing required param before sending", async () => {
    server = await mockGateway();
    const config = { ...loadConfig(), gateway: server!.url };
    const service = loadCatalog().find((s) => s.name === "attendance")!;
    const submitMethod = service.resources.corrections.methods.submit;

    // date 在 catalog 里是 required — coerceFields 直接抛 validation error
    await expect(
      runMethod(config, service, "corrections", "submit", submitMethod, { reason: "忘记打卡" }),
    ).rejects.toThrow(/缺少必填参数/);
  });

  it("dry-run shows preview without sending", async () => {
    const config = { ...loadConfig(), gateway: "http://localhost:1" };
    const service = loadCatalog().find((s) => s.name === "attendance")!;
    const submitMethod = service.resources.corrections.methods.submit;

    const result = await runMethod(config, service, "corrections", "submit", submitMethod, { date: "2026-09-21", reason: "x" }, { dryRun: true });
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
      // 只接受新 token，旧的 → 401
      if (auth === "Bearer tok-fresh-1") {
        if (req.url === "/attendance/records") {
          return res.end(JSON.stringify({ code: 0, data: { work_days: 22, late_days: 0 } }));
        }
      }
      res.statusCode = 401;
      res.end(JSON.stringify({ code: 401, msg: "未登录" }));
    });

    const config = { ...loadConfig(), gateway: server!.url };
    const service = loadCatalog().find((s) => s.name === "attendance")!;
    const recMethod = service.resources.records.methods.query;

    const rec = await runMethod(config, service, "records", "query", recMethod, {});
    expect((rec.data as any).work_days).toBe(22);
    expect(logins).toBe(1); // 只重登了一次
  });
});