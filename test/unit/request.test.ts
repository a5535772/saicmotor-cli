import { describe, it, expect } from "vitest";
import { coerceFields, buildBody, buildUrl } from "../../src/engine/request";
import { loadConfig } from "../../src/config";
import type { Method } from "../../src/schema/catalog";

const config = { ...loadConfig(), gateway: "http://gw" };

describe("request", () => {
  it("builds url from gateway + servicePath + path", () => {
    const m: Method = { id: "b.q", path: "/balance", httpMethod: "GET" };
    expect(buildUrl(config, "/leave", m)).toBe("http://gw/leave/balance");
  });

  it("coerces string and integer fields", () => {
    const fields = {
      start_date: { type: "string" as const, required: true },
      days: { type: "integer" as const },
    };
    expect(coerceFields(fields, { start_date: "2026-09-21", days: "3" })).toEqual({ start_date: "2026-09-21", days: 3 });
  });

  it("throws on missing required field", () => {
    const fields = { start_date: { type: "string" as const, required: true } };
    expect(() => coerceFields(fields, {})).toThrow(/缺少必填参数/);
  });

  it("builds JSON body from requestBody fields", () => {
    const m: Method = {
      id: "a.s", path: "/applications", httpMethod: "POST",
      requestBody: { start_date: { type: "string" }, reason: { type: "string" } },
    };
    expect(buildBody(m, { start_date: "2026-09-21", reason: "年假" })).toBe('{"start_date":"2026-09-21","reason":"年假"}');
  });
});
