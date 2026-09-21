import { describe, it, expect } from "vitest";
import { getByPath } from "../../src/engine/extract";

describe("getByPath", () => {
  it("walks nested objects", () => {
    expect(getByPath({ data: { token: "t1" } }, "data.token")).toBe("t1");
  });
  it("returns whole object on empty path", () => {
    expect(getByPath({ a: 1 }, "")).toEqual({ a: 1 });
  });
  it("returns an array value", () => {
    expect(getByPath({ data: { list: [1, 2] } }, "data.list")).toEqual([1, 2]);
  });
  it("returns undefined on missing key", () => {
    expect(getByPath({ a: 1 }, "a.b.c")).toBeUndefined();
    expect(getByPath(null, "a")).toBeUndefined();
  });
});