import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCatalog } from "../../src/engine/catalog";

describe("loadCatalog", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-")); process.env.SAICMOTOR_CATALOG = tmp; });
  afterEach(() => { delete process.env.SAICMOTOR_CATALOG; fs.rmSync(tmp, { recursive: true, force: true }); });

  it("loads valid services", () => {
    fs.writeFileSync(path.join(tmp, "leave.json"), JSON.stringify({
      name: "leave", servicePath: "/leave",
      resources: { balance: { methods: { query: { id: "balance.query", path: "/balance", httpMethod: "GET" } } } },
    }));
    const services = loadCatalog();
    expect(services).toHaveLength(1);
    expect(services[0].name).toBe("leave");
  });

  it("throws on invalid catalog", () => {
    fs.writeFileSync(path.join(tmp, "bad.json"), JSON.stringify({ name: "bad" }));
    expect(() => loadCatalog()).toThrow(/catalog 校验失败/);
  });

  it("returns empty when dir missing", () => {
    fs.rmSync(tmp, { recursive: true, force: true });
    expect(loadCatalog()).toEqual([]);
  });
});
