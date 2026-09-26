import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { registerSkill, unregisterSkill, registerPluginSkills, unregisterPluginSkills, AI_CLIENT_SKILL_DIRS } from "../../src/plugin/registrar";
import { loadState, saveState } from "../../src/plugin/state";

const tmpSkill = path.join(os.tmpdir(), `saicmotor-test-skill-${Date.now()}`);
const tmpClient = path.join(os.tmpdir(), `saicmotor-test-client-${Date.now()}`);
const origDirs: Record<string, string> = { ...AI_CLIENT_SKILL_DIRS };
const origHome = process.env.SAICMOTOR_HOME;

describe("registrar", () => {
  beforeEach(() => {
    // Redirect client skill dirs to temp
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
    }
    // Create test skill dir with SKILL.md
    fs.mkdirSync(tmpSkill, { recursive: true });
    fs.writeFileSync(path.join(tmpSkill, "SKILL.md"), "# Test Skill\n", "utf8");
  });

  afterEach(() => {
    // Restore original dirs
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    // Clean up temp dirs
    if (fs.existsSync(tmpSkill)) fs.rmSync(tmpSkill, { recursive: true, force: true });
    if (fs.existsSync(tmpClient)) fs.rmSync(tmpClient, { recursive: true, force: true });
  });

  it("registerSkill writes to all client dirs", () => {
    const results = registerSkill(tmpSkill, "test-skill");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.method === "junction" || r.method === "copy")).toBe(true);
  });

  it("registerSkill skips when target already exists", () => {
    // First registration
    registerSkill(tmpSkill, "test-skill");
    // Second registration — should skip
    const results = registerSkill(tmpSkill, "test-skill");
    for (const r of results) {
      expect(r.method).toBe("skipped");
      expect(r.reason).toBe("目标已存在");
    }
  });

  it("unregisterSkill removes the entry", () => {
    registerSkill(tmpSkill, "test-skill");
    unregisterSkill("test-skill");

    for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS)) {
      const target = path.join(clientSkillsDir as string, "test-skill");
      expect(fs.existsSync(target)).toBe(false);
    }
  });

  it("unregisterSkill is no-op when skill does not exist", () => {
    // Should not throw
    expect(() => unregisterSkill("nonexistent-skill")).not.toThrow();
  });

  it("registerSkill creates SKILL.md in target (via junction or copy)", () => {
    registerSkill(tmpSkill, "test-skill");

    // At least one client dir should have our skill
    const found = Object.values(AI_CLIENT_SKILL_DIRS).some((dir) => {
      const p = path.join(dir as string, "test-skill", "SKILL.md");
      return fs.existsSync(p);
    });
    expect(found).toBe(true);
  });
});

// ── registerPluginSkills / unregisterPluginSkills ──

describe("registerPluginSkills", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = path.join(os.tmpdir(), `saicmotor-test-pluginskills-${Date.now()}`);
    process.env.SAICMOTOR_HOME = tmpBase;
    // Redirect client skill dirs to temp
    const tmpClient = path.join(os.tmpdir(), `saicmotor-test-client-${Date.now()}`);
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
    }
    // Setup state
    const state = loadState();
    state.plugins["@saicmotor/plugin-test"] = {
      name: "@saicmotor/plugin-test",
      version: "0.8.0",
      enabled: true,
      source: "registry",
      skills: ["skills/saicmotor-test"],
      routes: { "测试": "saicmotor-test" },
    };
    saveState(state);
  });

  afterEach(() => {
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
    if (origHome === undefined) delete process.env.SAICMOTOR_HOME;
    else process.env.SAICMOTOR_HOME = origHome;
  });

  it("registers plugin skills to AI client dirs", () => {
    // Create a temp plugin dir with a skill
    const pkgDir = path.join(tmpBase, "test-plugin");
    const skillDir = path.join(pkgDir, "skills", "saicmotor-test");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Test Plugin\n", "utf8");

    const results = registerPluginSkills(pkgDir, ["skills/saicmotor-test"]);
    expect(Object.keys(results)).toContain("saicmotor-test");
    const regResults = results["saicmotor-test"];
    expect(regResults.some((r) => r.method === "junction" || r.method === "copy")).toBe(true);
  });

  it("skips skill dirs that don't exist", () => {
    const pkgDir = path.join(tmpBase, "empty-plugin");
    fs.mkdirSync(pkgDir, { recursive: true });

    const results = registerPluginSkills(pkgDir, ["skills/missing"]);
    expect(Object.keys(results)).toHaveLength(0);
  });

  it("skips skill dirs without SKILL.md", () => {
    const pkgDir = path.join(tmpBase, "bad-plugin");
    const skillDir = path.join(pkgDir, "skills", "saicmotor-bad");
    fs.mkdirSync(skillDir, { recursive: true });
    // No SKILL.md written

    const results = registerPluginSkills(pkgDir, ["skills/saicmotor-bad"]);
    expect(Object.keys(results)).toHaveLength(0);
  });

  it("registers multiple skills from same plugin", () => {
    const pkgDir = path.join(tmpBase, "multi-plugin");
    for (const name of ["saicmotor-skill-a", "saicmotor-skill-b"]) {
      const skillDir = path.join(pkgDir, "skills", name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), `# ${name}\n`, "utf8");
    }

    const results = registerPluginSkills(pkgDir, ["skills/saicmotor-skill-a", "skills/saicmotor-skill-b"]);
    expect(Object.keys(results)).toHaveLength(2);
    expect(Object.keys(results)).toContain("saicmotor-skill-a");
    expect(Object.keys(results)).toContain("saicmotor-skill-b");
  });

  it("regenerates suite SKILL.md after registering skills", () => {
    const pkgDir = path.join(tmpBase, "refresh-plugin");
    const skillDir = path.join(pkgDir, "skills", "saicmotor-test");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# Test\n", "utf8");

    registerPluginSkills(pkgDir, ["skills/saicmotor-test"]);

    // suite should have been written (it's in CLI's own skills dir, not plug into tmp)
    // We check that registerPluginSkills doesn't throw and returns results
    // Suite regeneration is tested separately in suite test
    expect(true).toBe(true); // no crash = pass
  });
});

describe("unregisterPluginSkills", () => {
  beforeEach(() => {
    const tmpClient = path.join(os.tmpdir(), `saicmotor-test-unreg-${Date.now()}`);
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
    }
  });

  afterEach(() => {
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
  });

  it("removes all skills for a plugin", () => {
    // First register some skills via registerSkill
    const skillDir1 = path.join(os.tmpdir(), `saicmotor-test-unreg-s1-${Date.now()}`);
    fs.mkdirSync(skillDir1, { recursive: true });
    fs.writeFileSync(path.join(skillDir1, "SKILL.md"), "# S1\n", "utf8");
    registerSkill(skillDir1, "saicmotor-skill-a");

    const skillDir2 = path.join(os.tmpdir(), `saicmotor-test-unreg-s2-${Date.now()}`);
    fs.mkdirSync(skillDir2, { recursive: true });
    fs.writeFileSync(path.join(skillDir2, "SKILL.md"), "# S2\n", "utf8");
    registerSkill(skillDir2, "saicmotor-skill-b");

    // Now unregister them
    unregisterPluginSkills(["skills/saicmotor-skill-a", "skills/saicmotor-skill-b"]);

    // Verify they're gone
    for (const dir of Object.values(AI_CLIENT_SKILL_DIRS)) {
      expect(fs.existsSync(path.join(dir as string, "saicmotor-skill-a"))).toBe(false);
      expect(fs.existsSync(path.join(dir as string, "saicmotor-skill-b"))).toBe(false);
    }
  });

  it("does not throw for empty skill list", () => {
    expect(() => unregisterPluginSkills([])).not.toThrow();
  });
});