import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptPath = fileURLToPath(new URL("../../scripts/uninstall.js", import.meta.url));
const { cleanup, isNpx, isGlobalUninstall } = require("../../scripts/uninstall.js") as {
  cleanup: (opts?: { homedir?: string }) => void;
  isNpx: () => boolean;
  isGlobalUninstall: () => boolean;
};

describe("preuninstall script: cleanup", () => {
  let tmpHome: string;
  const origHome = process.env.SAICMOTOR_HOME;

  beforeEach(() => {
    tmpHome = path.join(os.tmpdir(), `saicmotor-preuninstall-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    process.env.SAICMOTOR_HOME = path.join(tmpHome, ".saicmotor");
  });

  afterEach(() => {
    if (fs.existsSync(tmpHome)) fs.rmSync(tmpHome, { recursive: true, force: true });
    if (origHome === undefined) delete process.env.SAICMOTOR_HOME;
    else process.env.SAICMOTOR_HOME = origHome;
  });

  it("removes saicmotor-* skills and .saicmotor data, keeps others", () => {
    const claudeSkills = path.join(tmpHome, ".claude", "skills");
    const agentsSkills = path.join(tmpHome, ".agents", "skills");
    fs.mkdirSync(claudeSkills, { recursive: true });
    fs.mkdirSync(agentsSkills, { recursive: true });
    fs.mkdirSync(path.join(claudeSkills, "saicmotor-suite"), { recursive: true });
    fs.mkdirSync(path.join(agentsSkills, "saicmotor-user"), { recursive: true });
    fs.mkdirSync(path.join(claudeSkills, "other-skill"), { recursive: true });
    fs.mkdirSync(path.join(tmpHome, ".saicmotor"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, ".saicmotor", "config.json"), "{}", "utf8");

    cleanup({ homedir: tmpHome });

    expect(fs.existsSync(path.join(claudeSkills, "saicmotor-suite"))).toBe(false);
    expect(fs.existsSync(path.join(agentsSkills, "saicmotor-user"))).toBe(false);
    expect(fs.existsSync(path.join(claudeSkills, "other-skill"))).toBe(true);
    expect(fs.existsSync(path.join(tmpHome, ".saicmotor"))).toBe(false);
  });

  it("is idempotent and never throws on missing dirs", () => {
    expect(() => cleanup({ homedir: tmpHome })).not.toThrow();
    expect(() => cleanup({ homedir: tmpHome })).not.toThrow();
  });
});

describe("preuninstall script: npx guard", () => {
  const origNpmCommand = process.env.npm_command;

  afterEach(() => {
    if (origNpmCommand === undefined) delete process.env.npm_command;
    else process.env.npm_command = origNpmCommand;
  });

  it("isNpx returns true under npm exec", () => {
    process.env.npm_command = "exec";
    expect(isNpx()).toBe(true);
    delete process.env.npm_command;
    expect(isNpx()).toBe(false);
  });

  it("script exits without cleaning when npm_command=exec", () => {
    const tmpHome = path.join(os.tmpdir(), `saicmotor-preuninstall-npx-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.writeFileSync(path.join(tmpHome, "config.json"), "{}", "utf8");

    const res = spawnSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        npm_command: "exec",
        SAICMOTOR_HOME: tmpHome,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
      },
      encoding: "utf8",
    });

    try {
      expect(res.status).toBe(0);
      expect(fs.existsSync(tmpHome)).toBe(true); // 未被删
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});

describe("preuninstall script: global-only guard", () => {
  const origGlobal = process.env.npm_config_global;

  afterEach(() => {
    if (origGlobal === undefined) delete process.env.npm_config_global;
    else process.env.npm_config_global = origGlobal;
  });

  it("isGlobalUninstall returns true only when npm_config_global=true", () => {
    delete process.env.npm_config_global;
    expect(isGlobalUninstall()).toBe(false);
    process.env.npm_config_global = "true";
    expect(isGlobalUninstall()).toBe(true);
  });

  it("script exits without cleaning on local (non-global) uninstall", () => {
    const tmpHome = path.join(os.tmpdir(), `saicmotor-preuninstall-local-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(path.join(tmpHome, ".claude", "skills", "saicmotor-suite"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, "config.json"), "{}", "utf8");

    const res = spawnSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        npm_command: "uninstall",
        npm_config_global: "false",
        SAICMOTOR_HOME: tmpHome,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
      },
      encoding: "utf8",
    });

    try {
      expect(res.status).toBe(0);
      expect(fs.existsSync(tmpHome)).toBe(true); // 本地卸载不清全局数据
      expect(fs.existsSync(path.join(tmpHome, ".claude", "skills", "saicmotor-suite"))).toBe(true);
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it("script cleans on global uninstall (npm_config_global=true)", () => {
    const tmpHome = path.join(os.tmpdir(), `saicmotor-preuninstall-global-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(path.join(tmpHome, ".claude", "skills", "saicmotor-suite"), { recursive: true });
    fs.writeFileSync(path.join(tmpHome, "config.json"), "{}", "utf8");

    const res = spawnSync(process.execPath, [scriptPath], {
      env: {
        ...process.env,
        npm_command: "uninstall",
        npm_config_global: "true",
        SAICMOTOR_HOME: tmpHome,
        HOME: tmpHome,
        USERPROFILE: tmpHome,
      },
      encoding: "utf8",
    });

    try {
      expect(res.status).toBe(0);
      expect(fs.existsSync(tmpHome)).toBe(false); // 全局卸载清干净
    } finally {
      fs.rmSync(tmpHome, { recursive: true, force: true });
    }
  });
});
