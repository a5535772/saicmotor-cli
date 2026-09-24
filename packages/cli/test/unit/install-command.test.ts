// saicmotor-cli/test/unit/install-command.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { installSkills, skillsAlreadyInstalled } from "../../src/install/skills";
import { AI_CLIENT_SKILL_DIRS } from "../../src/plugin/registrar";

const origDirs: Record<string, string> = { ...AI_CLIENT_SKILL_DIRS };

describe("installSkills export (filesystem-based)", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let tmpClient: string;

  beforeEach(() => {
    // Restore to original before each test
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      if (!(k in origDirs)) delete AI_CLIENT_SKILL_DIRS[k];
    }

    tmpClient = path.join(os.tmpdir(), `saicmotor-install-cmd-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Redirect AI_CLIENT_SKILL_DIRS to temp in place
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
    }

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    if (fs.existsSync(tmpClient)) fs.rmSync(tmpClient, { recursive: true, force: true });
  });

  // ── installSkills signature ──────────────────────────────────────────

  it("installSkills accepts optional { force } parameter", () => {
    expect(() => installSkills()).not.toThrow();
    expect(() => installSkills({ force: false })).not.toThrow();
    expect(() => installSkills({ force: true })).not.toThrow();
  });

  it("installSkills with force=false skips when already installed", () => {
    const skillName = "saicmotor-suite";
    for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS)) {
      const target = path.join(clientSkillsDir as string, skillName);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "SKILL.md"), "# test\n");
    }

    installSkills({ force: false });
    expect(consoleLogSpy).toHaveBeenCalledWith("AI skills 已安装，跳过");
  });

  it("installSkills with force=true always runs registration", () => {
    const skillName = "saicmotor-suite";
    for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS)) {
      const target = path.join(clientSkillsDir as string, skillName);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "SKILL.md"), "# test\n");
    }

    installSkills({ force: true });
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("个 AI skills 已注册"));
  });

  // ── skillsAlreadyInstalled ───────────────────────────────────────────

  it("skillsAlreadyInstalled returns boolean", () => {
    const result = skillsAlreadyInstalled();
    expect(typeof result).toBe("boolean");
  });

  it("skillsAlreadyInstalled returns false when nothing registered", () => {
    expect(skillsAlreadyInstalled()).toBe(false);
  });

  it("skillsAlreadyInstalled returns true when a skill exists", () => {
    const firstDir = Object.values(AI_CLIENT_SKILL_DIRS)[0] as string;
    const target = path.join(firstDir, "saicmotor-suite");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), "# test\n");

    expect(skillsAlreadyInstalled()).toBe(true);
  });
});