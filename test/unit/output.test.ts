import { describe, it, expect } from "vitest";
import { formatTable, formatEnvelope, toTableRows } from "../../src/engine/output";

describe("toTableRows", () => {
  it("extracts data.list", () => {
    expect(toTableRows({ data: { list: [{ a: 1 }] } })).toEqual([{ a: 1 }]);
  });
  it("accepts direct array", () => {
    expect(toTableRows([{ a: 1 }])).toEqual([{ a: 1 }]);
  });
  it("throws on non-array", () => {
    expect(() => toTableRows({ a: 1 })).toThrow();
  });
});

describe("formatTable", () => {
  it("renders header and rows", () => {
    const out = formatTable([{ name: "张三", days: 1 }]);
    expect(out).toContain("name");
    expect(out).toContain("张三");
  });
});

describe("formatEnvelope", () => {
  it("renders ok envelope", () => {
    const j = JSON.parse(formatEnvelope(true, { x: 1 }));
    expect(j.ok).toBe(true);
    expect(j.data).toEqual({ x: 1 });
  });
  it("renders error envelope", () => {
    const j = JSON.parse(formatEnvelope(false, undefined, { type: "auth", message: "m" }));
    expect(j.ok).toBe(false);
    expect(j.error.type).toBe("auth");
  });
});
