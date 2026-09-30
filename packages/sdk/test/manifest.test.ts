import { describe, it, expect } from "vitest";
import { validateManifest, PluginManifestSchema } from "../src/manifest";

describe("PluginManifestSchema", () => {
  const validManifest = {
    name: "@saicmotor/plugin-test",
    engine: "^1.0.0",
    catalog: ["catalog/services/*.json"],
    skills: ["skills/saicmotor-test"],
    scripts: "scripts",
    routes: { "查询假期": "saicmotor-leave" },
  };

  it("accepts a complete manifest", () => {
    expect(() => validateManifest(validManifest)).not.toThrow();
  });

  it("accepts a minimal manifest (only name + engine)", () => {
    expect(() => validateManifest({ name: "@saicmotor/plugin-min", engine: ">=1.0.0" })).not.toThrow();
  });

  it("rejects missing name", () => {
    expect(() => validateManifest({ engine: "^1.0.0" })).toThrow();
  });

  it("rejects missing engine", () => {
    expect(() => validateManifest({ name: "@saicmotor/plugin-x" })).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => validateManifest({ name: "", engine: "^1.0.0" })).toThrow();
  });
});