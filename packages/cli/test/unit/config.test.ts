import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig, saicmotorDir, scriptsDir } from "../../src/config";

describe("config", () => {
  let tmp: string;
  beforeEach(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), "saicmotor-")); process.env.SAICMOTOR_HOME = tmp; });
  afterEach(() => { delete process.env.SAICMOTOR_HOME; delete process.env.SAICMOTOR_GATEWAY; delete process.env.SAICMOTOR_SCRIPTS; if (process.env.SAICMOTOR_AUTH_TYPE_RESTORE) { process.env.SAICMOTOR_AUTH_TYPE = process.env.SAICMOTOR_AUTH_TYPE_RESTORE; delete process.env.SAICMOTOR_AUTH_TYPE_RESTORE; } fs.rmSync(tmp, { recursive: true, force: true }); });

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

  it("supports exchange auth defaults via user config", () => {
    // vitest env defaults to password; temporarily unset so user config.json can supply exchange
    if (process.env.SAICMOTOR_AUTH_TYPE) {
      process.env.SAICMOTOR_AUTH_TYPE_RESTORE = process.env.SAICMOTOR_AUTH_TYPE;
      delete process.env.SAICMOTOR_AUTH_TYPE;
    }
    fs.writeFileSync(
      path.join(process.env.SAICMOTOR_HOME!, "config.json"),
      JSON.stringify({ auth: { type: "exchange", loopbackPort: 3000, callbackTimeoutMs: 90000 } })
    );
    const cfg = loadConfig();
    expect(cfg.auth.type).toBe("exchange");
    expect(cfg.auth.startPath).toBe("/auth/exchange/start");
    expect(cfg.auth.exchangePath).toBe("/auth/exchange");
    expect(cfg.auth.loopbackPort).toBe(3000);
    expect(cfg.auth.callbackTimeoutMs).toBe(90000);
  });
});
