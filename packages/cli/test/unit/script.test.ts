import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findScript, scriptFileFor } from "../../src/engine/script";
import { distRoot } from "../../src/pkg-root";
import { runMethod } from "../../src/engine/run";
import { loadConfig } from "../../src/config";
import { writeCredentials } from "../../src/auth/store";
import { startServer, MockServer } from "../helpers/server";
import type { Service } from "@saicmotor/sdk";
import { loadPlugins, type LoadedPlugin } from "../../src/plugin/loader";

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

  it("scriptFileFor builds dist scripts .js path", () => {
    expect(scriptFileFor("attendance", "corrections", "submit")).toBe(
      path.join(distRoot(), "scripts", "attendance", "corrections", "submit.js"),
    );
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

describe("findScript via plugin dist/scripts (no SAICMOTOR_SCRIPTS)", () => {
  let pluginHome: string;

  beforeEach(() => {
    pluginHome = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-plugin-"));
    process.env.SAICMOTOR_HOME = pluginHome;
    // 刻意不设 SAICMOTOR_SCRIPTS — 验证插件路径自身能命中
    writeCredentials({ username: "zhangsan", password: "123456" });
  });

  afterEach(() => {
    delete process.env.SAICMOTOR_HOME;
    fs.rmSync(pluginHome, { recursive: true, force: true });
  });

  function setupPlugin(pluginName: string, scriptsDir: string, scriptFile: string) {
    const linkedDir = path.join(pluginHome, "plugins", "linked", pluginName);
    fs.mkdirSync(linkedDir, { recursive: true });

    fs.writeFileSync(
      path.join(linkedDir, "saicmotor.plugin.json"),
      JSON.stringify({
        name: `@saicmotor/${pluginName}`,
        engine: "^0.8.0",
        catalog: [],
        skills: [],
        scripts: scriptsDir,
      }),
    );

    const scriptDir = path.join(linkedDir, scriptsDir, "leave", "applications");
    fs.mkdirSync(scriptDir, { recursive: true });
    fs.writeFileSync(
      path.join(scriptDir, scriptFile),
      'module.exports = async function(ctx) { return { ok: true, data: { from: "plugin-script", dryRun: ctx.dryRun } }; };',
    );
  }

  it("finds .js in manifest.scripts directory (dev-link, compiled .js present)", () => {
    setupPlugin("plugin-leave", "scripts", "submit.js");
    const found = findScript("leave", "applications", "submit");
    expect(found).not.toBeNull();
    expect(found!).toContain("scripts");
  });

  it("finds .js in dist/<manifest.scripts> directory (registry install form)", () => {
    setupPlugin("plugin-leave", "scripts", "submit.js");
    // 把 .js 从 scripts/ 挪到 dist/scripts/ 模拟 registry 安装形态
    const distScripts = path.join(pluginHome, "plugins", "linked", "plugin-leave", "dist", "scripts", "leave", "applications");
    fs.mkdirSync(distScripts, { recursive: true });
    fs.writeFileSync(
      path.join(distScripts, "submit.js"),
      'module.exports = async function(ctx) { return { ok: true, data: { from: "dist-script" } }; };',
    );
    // 删掉 scripts/ 下的 .js，只剩 dist/scripts/
    fs.rmSync(path.join(pluginHome, "plugins", "linked", "plugin-leave", "scripts", "leave", "applications", "submit.js"));

    const found = findScript("leave", "applications", "submit");
    expect(found).not.toBeNull();
    expect(found!).toContain("dist");
  });

  it("returns null when neither scripts/ nor dist/scripts/ has .js", () => {
    setupPlugin("plugin-leave", "scripts", "submit.ts");
    // 插件目录下只有 .ts 源码，没有 .js —— dev 下未编译场景
    expect(findScript("leave", "applications", "submit")).toBeNull();
  });
});