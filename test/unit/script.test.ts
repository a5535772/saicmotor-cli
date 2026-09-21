import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findScript, scriptFileFor, executeScript, type ScriptFn } from "../../src/engine/script";
import { runMethod } from "../../src/engine/run";
import { loadConfig } from "../../src/config";
import { writeCredentials } from "../../src/auth/store";
import { startServer, MockServer } from "../helpers/server";
import type { Service } from "../../src/schema/catalog";

const service: Service = {
  name: "attendance",
  servicePath: "/attendance",
  resources: {
    corrections: {
      methods: {
        submit: {
          id: "corrections.submit",
          path: "/corrections",
          httpMethod: "POST",
          requestBody: { date: { type: "string", required: true }, reason: { type: "string", required: true } },
        },
      },
    },
  },
};

describe("script scheduling", () => {
  let tmp: string;
  let server: MockServer | undefined;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-scripts-"));
    process.env.SAICMOTOR_HOME = tmp;
    process.env.SAICMOTOR_SCRIPTS = tmp;
    writeCredentials({ username: "zhangsan", password: "123456" });
  });

  afterEach(async () => {
    delete process.env.SAICMOTOR_HOME;
    delete process.env.SAICMOTOR_SCRIPTS;
    fs.rmSync(tmp, { recursive: true, force: true });
    await server?.close();
  });

  it("scriptFileFor builds system/resource/method path", () => {
    expect(scriptFileFor("attendance", "corrections", "submit")).toBe(path.join(tmp, "attendance", "corrections", "submit.ts"));
  });

  it("findScript returns path when file exists, null otherwise", () => {
    const dir = path.join(tmp, "attendance", "corrections");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "submit.ts"), "export default async function(){}");
    expect(findScript("attendance", "corrections", "submit")).toBe(path.join(dir, "submit.ts"));
    expect(findScript("attendance", "corrections", "nope")).toBeNull();
  });

  it("runMethod dispatches to script and skips HTTP", async () => {
    const dir = path.join(tmp, "attendance", "corrections");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "submit.ts"),
      'export default async function (ctx) { return { ok: true, data: { from: "script", values: ctx.values } }; }',
    );

    // 网关指向不可达地址——若走 HTTP 会失败
    const config = { ...loadConfig(), gateway: "http://127.0.0.1:1" };
    const method = service.resources.corrections.methods.submit;
    const result = await runMethod(config, service, "corrections", "submit", method, { date: "2026-09-21", reason: "忘记打卡" });

    expect((result.data as any).from).toBe("script");
    expect((result.data as any).values).toEqual({ date: "2026-09-21", reason: "忘记打卡" });
  });

  it("falls back to HTTP when no script", async () => {
    server = await startServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/auth/login") return res.end(JSON.stringify({ code: 0, data: { token: "tok" } }));
      res.end(JSON.stringify({ code: 0, data: { ok: true } }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    const method = service.resources.corrections.methods.submit;
    const result = await runMethod(config, service, "corrections", "submit", method, { date: "2026-09-21", reason: "x" });
    expect(result.data).toEqual({ ok: true });
  });

  it("passes dryRun true and ensureToken into script context", async () => {
    const dir = path.join(tmp, "attendance", "corrections");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "submit.ts"),
      'export default async function (ctx) { const t = await ctx.ensureToken(); return { ok: true, data: { dryRun: ctx.dryRun, token: typeof t } }; }',
    );

    server = await startServer((_req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ code: 0, data: { token: "tok-abc" } }));
    });
    const config = { ...loadConfig(), gateway: server!.url };
    const method = service.resources.corrections.methods.submit;
    const result = await runMethod(config, service, "corrections", "submit", method, { date: "2026-09-21", reason: "x" }, { dryRun: true });

    expect((result.data as any).dryRun).toBe(true);
    expect((result.data as any).token).toBe("string");
  });
});