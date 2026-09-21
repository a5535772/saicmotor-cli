import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, saicmotorDir, scriptsDir } from "../../src/config";

describe("config", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-")); process.env.SAICMOTOR_HOME = tmp; });
  afterEach(() => { delete process.env.SAICMOTOR_HOME; delete process.env.SAICMOTOR_GATEWAY; delete process.env.SAICMOTOR_SCRIPTS; fs.rmSync(tmp, { recursive: true, force: true }); });

  it("defaults gateway to localhost:8081", () => {
    expect(loadConfig().gateway).toBe("http://localhost:8081");
  });

  it("overrides gateway from config file", () => {
    fs.writeFileSync(path.join(saicmotorDir(), "config.json"), JSON.stringify({ gateway: "http://gw.example.com" }));
    expect(loadConfig().gateway).toBe("http://gw.example.com");
  });

  it("env var has highest precedence", () => {
    process.env.SAICMOTOR_GATEWAY = "http://env.example.com";
    expect(loadConfig().gateway).toBe("http://env.example.com");
  });

  it("scriptsDir respects SAICMOTOR_SCRIPTS env override", () => {
    process.env.SAICMOTOR_SCRIPTS = "/tmp/scripts";
    expect(scriptsDir()).toBe("/tmp/scripts");
  });
});
