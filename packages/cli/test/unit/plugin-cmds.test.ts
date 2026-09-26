import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Mock execSync — must use vi.hoisted to avoid hoisting issues
const { execSyncMock } = vi.hoisted(() => ({ execSyncMock: vi.fn() }));
vi.mock("node:child_process", () => ({
  execSync: execSyncMock,
}));

import {
  fullName,
  jsonOut,
  jsonErr,
  installPluginLogic,
  uninstallPluginLogic,
  setPluginEnabledLogic,
  upgradePluginLogic,
} from "../../src/cli/plugin-cmds";
import { loadState, saveState } from "../../src/plugin/state";
import { AI_CLIENT_SKILL_DIRS } from "../../src/plugin/registrar";

// ── 辅助函数 ──

function setupPluginFiles(pkgDir: string, skills: string[]) {
  for (const s of skills) {
    const skillDir = path.join(pkgDir, s);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), `# ${path.basename(s)}\n`, "utf8");
  }
}

// ── fullName ──

describe("fullName", () => {
  it("expands short name to scoped plugin name", () => {
    expect(fullName("leave")).toBe("@saicmotor/plugin-leave");
  });

  it("expands plugin- prefix name", () => {
    expect(fullName("plugin-leave")).toBe("@saicmotor/plugin-leave");
  });

  it("passes through already-scoped name", () => {
    expect(fullName("@saicmotor/plugin-leave")).toBe("@saicmotor/plugin-leave");
  });

  it("handles multi-word names", () => {
    expect(fullName("attendance")).toBe("@saicmotor/plugin-attendance");
    expect(fullName("user")).toBe("@saicmotor/plugin-user");
  });
});

// ── jsonOut / jsonErr ──

describe("jsonOut", () => {
  it("writes ok+data JSON to stdout", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    jsonOut({ hello: "world" });
    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0][0];
    const parsed = JSON.parse(call);
    expect(parsed.ok).toBe(true);
    expect(parsed.data).toEqual({ hello: "world" });
    spy.mockRestore();
  });
});

describe("jsonErr", () => {
  it("writes ok=false JSON to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    jsonErr("something failed");
    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0][0];
    const parsed = JSON.parse(call);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBe("something failed");
    spy.mockRestore();
  });
});

// ── setPluginEnabledLogic ──

describe("setPluginEnabledLogic", () => {
  const origHome = process.env.SAICMOTOR_HOME;
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = path.join(os.tmpdir(), `saicmotor-test-toggle-${Date.now()}`);
    process.env.SAICMOTOR_HOME = tmpBase;
    const state = loadState();
    state.plugins["@saicmotor/plugin-leave"] = {
      name: "@saicmotor/plugin-leave",
      version: "0.8.0",
      enabled: true,
      source: "registry",
      skills: ["skills/saicmotor-leave"],
    };
    saveState(state);
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
    if (origHome === undefined) delete process.env.SAICMOTOR_HOME;
    else process.env.SAICMOTOR_HOME = origHome;
  });

  it("disables an enabled plugin", () => {
    const result = setPluginEnabledLogic("leave", false);
    expect(result.ok).toBe(true);
    expect(result.data!.enabled).toBe(false);

    const state = loadState();
    expect(state.plugins["@saicmotor/plugin-leave"].enabled).toBe(false);
  });

  it("enables a disabled plugin", () => {
    setPluginEnabledLogic("leave", false);
    const result = setPluginEnabledLogic("leave", true);
    expect(result.ok).toBe(true);
    expect(result.data!.enabled).toBe(true);

    const state = loadState();
    expect(state.plugins["@saicmotor/plugin-leave"].enabled).toBe(true);
  });

  it("returns error for unknown plugin", () => {
    const result = setPluginEnabledLogic("nonexistent", true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("未找到插件");
  });

  it("handles scoped name directly", () => {
    const result = setPluginEnabledLogic("@saicmotor/plugin-leave", false);
    expect(result.ok).toBe(true);
    expect(result.data!.name).toBe("@saicmotor/plugin-leave");
  });
});

// ── installPluginLogic ──

describe("installPluginLogic", () => {
  const origHome = process.env.SAICMOTOR_HOME;
  let tmpBase: string;
  let origDirs: Record<string, string>;

  beforeEach(() => {
    tmpBase = path.join(os.tmpdir(), `saicmotor-test-install-${Date.now()}`);
    process.env.SAICMOTOR_HOME = tmpBase;
    origDirs = { ...AI_CLIENT_SKILL_DIRS };

    const tmpClient = path.join(os.tmpdir(), `saicmotor-test-client-${Date.now()}`);
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
    }

    execSyncMock.mockReset();
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
    if (origHome === undefined) delete process.env.SAICMOTOR_HOME;
    else process.env.SAICMOTOR_HOME = origHome;
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
  });

  it("returns error when npm install fails", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("npm install failed");
    });
    const result = installPluginLogic("leave", { registry: "http://localhost:4873" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("npm install failed");
  });

  it("returns error when manifest is missing after npm install", () => {
    execSyncMock.mockImplementation(() => {
      const pluginsDir = path.join(tmpBase, "plugins");
      const pkgDir = path.join(pluginsDir, "node_modules", "@saicmotor/plugin-leave");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "@saicmotor/plugin-leave", version: "0.8.0" }));
      return "";
    });
    const result = installPluginLogic("leave", { registry: "http://localhost:4873" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("manifest 缺失");
  });

  it("installs plugin and registers skills successfully", () => {
    execSyncMock.mockImplementation(() => {
      const pluginsDir = path.join(tmpBase, "plugins");
      const pkgDir = path.join(pluginsDir, "node_modules", "@saicmotor/plugin-leave");
      setupPluginFiles(pkgDir, ["skills/saicmotor-leave"]);
      fs.writeFileSync(
        path.join(pkgDir, "saicmotor.plugin.json"),
        JSON.stringify({ name: "@saicmotor/plugin-leave", engine: "^0.8.0", skills: ["skills/saicmotor-leave"], routes: { "请假": "saicmotor-leave" } }),
      );
      fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify({ name: "@saicmotor/plugin-leave", version: "0.8.0" }));
      return "";
    });
    const result = installPluginLogic("leave", { registry: "http://localhost:4873" });
    expect(result.ok).toBe(true);
    expect(result.data!.name).toBe("@saicmotor/plugin-leave");
    expect(result.data!.version).toBe("0.8.0");
    expect(result.data!.skills).toContain("saicmotor-leave");

    const state = loadState();
    expect(state.plugins["@saicmotor/plugin-leave"]).toBeDefined();
    expect(state.plugins["@saicmotor/plugin-leave"].enabled).toBe(true);
  });
});

// ── uninstallPluginLogic ──

describe("uninstallPluginLogic", () => {
  const origHome = process.env.SAICMOTOR_HOME;
  let tmpBase: string;
  let origDirs: Record<string, string>;

  beforeEach(() => {
    tmpBase = path.join(os.tmpdir(), `saicmotor-test-uninstall-${Date.now()}`);
    process.env.SAICMOTOR_HOME = tmpBase;
    origDirs = { ...AI_CLIENT_SKILL_DIRS };

    const tmpClient = path.join(os.tmpdir(), `saicmotor-test-client-${Date.now()}`);
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
    }

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

    execSyncMock.mockReset();
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
    if (origHome === undefined) delete process.env.SAICMOTOR_HOME;
    else process.env.SAICMOTOR_HOME = origHome;
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
  });

  it("returns error for unknown plugin", () => {
    const result = uninstallPluginLogic("nonexistent");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("未找到插件");
  });

  it("uninstalls plugin and removes from state", () => {
    execSyncMock.mockImplementation(() => "");
    const result = uninstallPluginLogic("leave");
    expect(result.ok).toBe(true);
    expect(result.data!.name).toBe("@saicmotor/plugin-leave");

    const state = loadState();
    expect(state.plugins["@saicmotor/plugin-leave"]).toBeUndefined();
  });

  it("does not fail when npm uninstall errors", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("npm uninstall failed");
    });
    const result = uninstallPluginLogic("leave");
    expect(result.ok).toBe(true);

    const state = loadState();
    expect(state.plugins["@saicmotor/plugin-leave"]).toBeUndefined();
  });
});

// ── upgradePluginLogic ──

describe("upgradePluginLogic", () => {
  const origHome = process.env.SAICMOTOR_HOME;
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = path.join(os.tmpdir(), `saicmotor-test-upgrade-${Date.now()}`);
    process.env.SAICMOTOR_HOME = tmpBase;
    execSyncMock.mockReset();
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
    if (origHome === undefined) delete process.env.SAICMOTOR_HOME;
    else process.env.SAICMOTOR_HOME = origHome;
  });

  it("upgrades plugin successfully", () => {
    execSyncMock.mockImplementation(() => "");
    const result = upgradePluginLogic("leave", { registry: "http://localhost:4873" });
    expect(result.ok).toBe(true);
    expect(result.data!.name).toBe("@saicmotor/plugin-leave");
  });

  it("returns error when npm update fails", () => {
    execSyncMock.mockImplementation(() => {
      throw new Error("404 Not Found");
    });
    const result = upgradePluginLogic("leave", { registry: "http://localhost:4873" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("404");
  });

  it("builds registry flag only when provided", () => {
    execSyncMock.mockImplementation(() => "");
    upgradePluginLogic("leave", {});
    const call = execSyncMock.mock.calls[0][0] as string;
    expect(call).not.toContain("--registry=");
  });
});