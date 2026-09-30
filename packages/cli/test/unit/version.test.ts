import { describe, it, expect } from "vitest";
import { getCoreVersion } from "../../src/version";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("getCoreVersion", () => {
  it("返回 packages/cli/package.json 中的 version 字段", () => {
    const expected = JSON.parse(
      readFileSync(resolve(__dirname, "..", "..", "package.json"), "utf-8")
    ).version;
    expect(getCoreVersion()).toBe(expected);
  });

  it("两次调用返回相同值（缓存生效）", () => {
    expect(getCoreVersion()).toBe(getCoreVersion());
  });
});