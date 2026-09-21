import { describe, it, expect } from "vitest";
import { SaicmotorError } from "../../src/engine/errors";

describe("SaicmotorError", () => {
  it("maps each category to its exit code", () => {
    expect(new SaicmotorError("validation", "x").exitCode).toBe(2);
    expect(new SaicmotorError("auth", "x").exitCode).toBe(3);
    expect(new SaicmotorError("network", "x").exitCode).toBe(4);
    expect(new SaicmotorError("upstream", "x").exitCode).toBe(5);
    expect(new SaicmotorError("spec", "x").exitCode).toBe(6);
  });
  it("carries upstream info and hint", () => {
    const e = new SaicmotorError("upstream", "余额不足", { upstream: { code: 1001, message: "leave balance" }, hint: "h" });
    expect(e.upstream?.code).toBe(1001);
    expect(e.hint).toBe("h");
  });
});