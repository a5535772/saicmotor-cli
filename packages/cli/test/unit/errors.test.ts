import { describe, it, expect } from "vitest";
import { isSaicmotorError } from "../../src/cli/error";

describe("isSaicmotorError", () => {
  it("recognizes a structurally-similar error from another SDK copy", () => {
    const alien = { name: "SaicmotorError", message: "x", category: "upstream", exitCode: 5 } as unknown;
    expect(isSaicmotorError(alien)).toBe(true);
  });
  it("rejects a plain Error", () => {
    expect(isSaicmotorError(new Error("boom"))).toBe(false);
  });
  it("rejects an object missing category or exitCode", () => {
    expect(isSaicmotorError({ message: "x", category: "upstream" })).toBe(false);
  });
});
