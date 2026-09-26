import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadState, saveState } from "../../src/plugin/state";

describe("state (load/save)", () => {
  const origHome = process.env.SAICMOTOR_HOME;
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = path.join(os.tmpdir(), `saicmotor-test-state-${Date.now()}`);
    process.env.SAICMOTOR_HOME = tmpBase;
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
    if (origHome === undefined) delete process.env.SAICMOTOR_HOME;
    else process.env.SAICMOTOR_HOME = origHome;
  });

  it("returns empty state when no file exists", () => {
    const state = loadState();
    expect(state).toEqual({ plugins: {} });
  });

  it("saves and loads state with plugins", () => {
    const state = loadState();
    state.plugins["@saicmotor/plugin-leave"] = {
      name: "@saicmotor/plugin-leave",
      version: "0.8.0",
      enabled: true,
      source: "registry",
      skills: ["skills/saicmotor-leave"],
      routes: { "请假": "saicmotor-leave" },
    };
    saveState(state);

    const reloaded = loadState();
    expect(reloaded.plugins["@saicmotor/plugin-leave"].name).toBe("@saicmotor/plugin-leave");
    expect(reloaded.plugins["@saicmotor/plugin-leave"].version).toBe("0.8.0");
    expect(reloaded.plugins["@saicmotor/plugin-leave"].enabled).toBe(true);
    expect(reloaded.plugins["@saicmotor/plugin-leave"].source).toBe("registry");
  });

  it("saves and loads multiple plugins", () => {
    const state = loadState();
    state.plugins["@saicmotor/plugin-leave"] = {
      name: "@saicmotor/plugin-leave",
      version: "0.8.0",
      enabled: true,
      source: "registry",
      skills: ["skills/saicmotor-leave"],
    };
    state.plugins["@saicmotor/plugin-attendance"] = {
      name: "@saicmotor/plugin-attendance",
      version: "0.8.0",
      enabled: false,
      source: "registry",
      skills: ["skills/saicmotor-attendance"],
    };
    saveState(state);

    const reloaded = loadState();
    expect(Object.keys(reloaded.plugins)).toHaveLength(2);
    expect(reloaded.plugins["@saicmotor/plugin-attendance"].enabled).toBe(false);
  });

  it("saves linked plugin with linkedPath", () => {
    const state = loadState();
    state.plugins["@saicmotor/plugin-reimbursement"] = {
      name: "@saicmotor/plugin-reimbursement",
      version: "dev",
      enabled: true,
      source: "linked",
      linkedPath: "/tmp/plugin-reimbursement",
      skills: ["skills/saicmotor-reimbursement"],
    };
    saveState(state);

    const reloaded = loadState();
    expect(reloaded.plugins["@saicmotor/plugin-reimbursement"].source).toBe("linked");
    expect(reloaded.plugins["@saicmotor/plugin-reimbursement"].linkedPath).toBe("/tmp/plugin-reimbursement");
  });

  it("overwrites state on re-save", () => {
    const state = loadState();
    state.plugins["plugin-x"] = { name: "plugin-x", version: "1.0", enabled: true, source: "registry", skills: [] };
    saveState(state);

    const state2 = loadState();
    state2.plugins["plugin-y"] = { name: "plugin-y", version: "2.0", enabled: true, source: "registry", skills: [] };
    saveState(state2);

    const reloaded = loadState();
    expect(Object.keys(reloaded.plugins)).toHaveLength(2);
    expect(reloaded.plugins["plugin-x"]).toBeDefined();
    expect(reloaded.plugins["plugin-y"]).toBeDefined();
  });
});