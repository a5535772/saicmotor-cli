import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { registerSkill, unregisterSkill, AI_CLIENT_SKILL_DIRS } from "../../src/plugin/registrar";

const tmpSkill = path.join(os.tmpdir(), `saicmotor-test-skill-${Date.now()}`);
const tmpClient = path.join(os.tmpdir(), `saicmotor-test-client-${Date.now()}`);
const origDirs: Record<string, string> = { ...AI_CLIENT_SKILL_DIRS };

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