import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  createPluginLogic,
  validatePluginLogic,
  devPluginLogic,
} from "../../src/cli/tooling-cmds";
import { loadState } from "../../src/plugin/state";

// ── 辅助 ──

function tmpDir(): string {
  return path.join(os.tmpdir(), `saicmotor-test-tooling-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

// ── createPluginLogic ──

describe("createPluginLogic", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = tmpDir();
    fs.mkdirSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
  });

  it("creates plugin skeleton with correct structure", () => {
    const result = createPluginLogic("reimbursement", tmpBase);
    expect(result.ok).toBe(true);
    expect(result.data!.pkgName).toBe("@saicmotor/plugin-reimbursement");

    const pluginDir = path.join(tmpBase, "plugin-reimbursement");
    expect(fs.existsSync(pluginDir)).toBe(true);

    // Verify expected files exist
    expect(fs.existsSync(path.join(pluginDir, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "tsconfig.json"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "saicmotor.plugin.json"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "catalog", "services", "reimbursement.json"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "skills", "saicmotor-reimbursement", "SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(pluginDir, "scripts", "README.md"))).toBe(true);
  });

  it("returns error when directory already exists", () => {
    const pluginDir = path.join(tmpBase, "plugin-reimbursement");
    fs.mkdirSync(pluginDir, { recursive: true });
    const result = createPluginLogic("reimbursement", tmpBase);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("目录已存在");
  });

  it("generates valid package.json structure", () => {
    createPluginLogic("reimbursement", tmpBase);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpBase, "plugin-reimbursement", "package.json"), "utf8"),
    );
    expect(pkg.name).toBe("@saicmotor/plugin-reimbursement");
    expect(pkg.version).toBe("0.1.0");
    expect(pkg.type).toBe("commonjs");
    expect(pkg.devDependencies).toHaveProperty("@saicmotor/sdk");
    // Should NOT have peerDependencies
    expect(pkg.peerDependencies).toBeUndefined();
  });

  it("generates correct engine field in manifest", () => {
    createPluginLogic("reimbursement", tmpBase);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(tmpBase, "plugin-reimbursement", "saicmotor.plugin.json"), "utf8"),
    );
    expect(manifest.name).toBe("@saicmotor/plugin-reimbursement");
    expect(manifest.engine).toBe("^0.8.0");
    expect(manifest.catalog).toEqual(["catalog/services/*.json"]);
    expect(manifest.skills).toEqual(["skills/saicmotor-reimbursement"]);
  });

  it("generates skill SKILL.md with name and description", () => {
    createPluginLogic("reimbursement", tmpBase);
    const md = fs.readFileSync(
      path.join(tmpBase, "plugin-reimbursement", "skills", "saicmotor-reimbursement", "SKILL.md"),
      "utf8",
    );
    expect(md).toContain("name: saicmotor-reimbursement");
    expect(md).toContain("reimbursement 业务能力");
    expect(md).toContain("saicmotor reimbursement");
  });

  it("generates catalog with correct service structure", () => {
    createPluginLogic("reimbursement", tmpBase);
    const cat = JSON.parse(
      fs.readFileSync(
        path.join(tmpBase, "plugin-reimbursement", "catalog", "services", "reimbursement.json"),
        "utf8",
      ),
    );
    expect(cat.name).toBe("reimbursement");
    expect(cat.servicePath).toBe("/api/reimbursement");
    expect(cat.title).toBe("reimbursement 服务");
  });
});

// ── validatePluginLogic ──

describe("validatePluginLogic", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = tmpDir();
    fs.mkdirSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
  });

  it("validates a correct manifest", () => {
    const manifest = {
      name: "@saicmotor/plugin-test",
      engine: "^0.8.0",
      catalog: ["catalog/services/*.json"],
      skills: ["skills/saicmotor-test"],
    };
    fs.writeFileSync(path.join(tmpBase, "saicmotor.plugin.json"), JSON.stringify(manifest));

    const result = validatePluginLogic(tmpBase);
    expect(result.ok).toBe(true);
  });

  it("rejects missing manifest file", () => {
    const result = validatePluginLogic(tmpBase);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("未找到 saicmotor.plugin.json");
  });

  it("rejects invalid JSON", () => {
    fs.writeFileSync(path.join(tmpBase, "saicmotor.plugin.json"), "not json {{{");
    const result = validatePluginLogic(tmpBase);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("JSON 解析失败");
  });

  it("rejects manifest missing required name field", () => {
    fs.writeFileSync(
      path.join(tmpBase, "saicmotor.plugin.json"),
      JSON.stringify({ engine: "^0.8.0" }),
    );
    const result = validatePluginLogic(tmpBase);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("校验失败");
  });

  it("rejects manifest with empty name field", () => {
    fs.writeFileSync(
      path.join(tmpBase, "saicmotor.plugin.json"),
      JSON.stringify({ name: "", engine: "^0.8.0" }),
    );
    const result = validatePluginLogic(tmpBase);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("校验失败");
  });
});

// ── devPluginLogic ──

describe("devPluginLogic", () => {
  const origHome = process.env.SAICMOTOR_HOME;
  let tmpBase: string;
  let tmpPluginDir: string;

  beforeEach(() => {
    tmpBase = path.join(os.tmpdir(), `saicmotor-test-dev-${Date.now()}`);
    process.env.SAICMOTOR_HOME = tmpBase;

    tmpPluginDir = tmpDir();
    fs.mkdirSync(tmpPluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(tmpPluginDir, "saicmotor.plugin.json"),
      JSON.stringify({
        name: "@saicmotor/plugin-reimbursement",
        engine: "^0.8.0",
        skills: ["skills/saicmotor-reimbursement"],
      }),
    );
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
    if (fs.existsSync(tmpPluginDir)) fs.rmSync(tmpPluginDir, { recursive: true });
    if (origHome === undefined) delete process.env.SAICMOTOR_HOME;
    else process.env.SAICMOTOR_HOME = origHome;
  });

  it("rejects when manifest is missing", () => {
    const emptyDir = tmpDir();
    fs.mkdirSync(emptyDir, { recursive: true });
    const result = devPluginLogic(emptyDir, false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("未找到 saicmotor.plugin.json");
  });

  it("establishes dev link (junction)", () => {
    const result = devPluginLogic(tmpPluginDir, false);
    expect(result.ok).toBe(true);
    expect(result.data!.action).toBe("link");
    expect(result.data!.shortName).toBe("plugin-reimbursement");

    // Verify junction was created
    const target = path.join(tmpBase, "plugins", "linked", "plugin-reimbursement");
    expect(fs.existsSync(target)).toBe(true);

    // Verify state was saved
    const state = loadState();
    const entry = state.plugins["@saicmotor/plugin-reimbursement"];
    expect(entry).toBeDefined();
    expect(entry.source).toBe("linked");
    expect(entry.version).toBe("dev");
    expect(entry.enabled).toBe(true);
  });

  it("removes dev link on stop", () => {
    // First link
    devPluginLogic(tmpPluginDir, false);
    // Then stop
    const result = devPluginLogic(tmpPluginDir, true);
    expect(result.ok).toBe(true);
    expect(result.data!.action).toBe("unlink");

    const target = path.join(tmpBase, "plugins", "linked", "plugin-reimbursement");
    expect(fs.existsSync(target)).toBe(false);

    const state = loadState();
    expect(state.plugins["@saicmotor/plugin-reimbursement"]).toBeUndefined();
  });

  it("stop is idempotent when no link exists", () => {
    const result = devPluginLogic(tmpPluginDir, true);
    expect(result.ok).toBe(true);
    expect(result.data!.action).toBe("unlink");
  });
});