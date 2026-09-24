import { describe, it, expect } from "vitest";
import { SDK_VERSION } from "../src/index";

describe("@saicmotor/sdk", () => {
  it("exports SDK_VERSION", () => {
    expect(SDK_VERSION).toBe("0.1.0");
  });
});