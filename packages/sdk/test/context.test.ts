import { describe, it, expect } from "vitest";
import type { ScriptContext, ScriptFn, RunResult } from "../src/context";

describe("ScriptContext types", () => {
  it("ScriptContext shape is assignable at type level", () => {
    // Compile-time smoke test: instantiate an object matching the interface
    const ctx: ScriptContext = {
      config: {
        gateway: "https://api.example.com",
        auth: {
          type: "password",
          loginPath: "/auth/login",
          tokenPath: "/auth/token",
          tokenHeader: "Authorization",
          tokenPrefix: "Bearer ",
          startPath: "/auth/start",
          exchangePath: "/auth/exchange",
          loopbackHost: "127.0.0.1",
          loopbackPort: 8080,
          callbackTimeoutMs: 60_000,
        },
      },
      service: {
        name: "test-svc",
        servicePath: "/api/test",
        resources: {},
      },
      method: {
        id: "getData",
        path: "/api/test/data",
        httpMethod: "GET",
      },
      values: {},
      dryRun: false,
      ensureToken: async () => "mock-token",
    };

    expect(ctx.config.gateway).toBe("https://api.example.com");
    expect(ctx.service.name).toBe("test-svc");
    expect(ctx.method.httpMethod).toBe("GET");
    expect(ctx.dryRun).toBe(false);
  });

  it("ScriptFn type accepts async function", async () => {
    const handler: ScriptFn = async (ctx) => {
      return { ok: true as const, data: ctx.values };
    };

    const result = await handler({
      config: {
        gateway: "https://api.example.com",
        auth: {
          type: "password",
          loginPath: "/auth/login",
          tokenPath: "/auth/token",
          tokenHeader: "Authorization",
          tokenPrefix: "Bearer ",
          startPath: "/auth/start",
          exchangePath: "/auth/exchange",
          loopbackHost: "127.0.0.1",
          loopbackPort: 8080,
          callbackTimeoutMs: 60_000,
        },
      },
      service: { name: "svc", servicePath: "/", resources: {} },
      method: { id: "m", path: "/", httpMethod: "GET" },
      values: { input: 42 },
      dryRun: true,
      ensureToken: async () => "t",
    });

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ input: 42 });
  });

  it("RunResult ok is always true", () => {
    const r: RunResult = { ok: true, data: null };
    expect(r.ok).toBe(true);
  });
});