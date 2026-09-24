// saicmotor-cli/test/scripts/postinstall.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { installSkills, skillsAlreadyInstalled, runPostinstall } from "../../src/install/skills";
import { AI_CLIENT_SKILL_DIRS } from "../../src/plugin/registrar";

const origDirs: Record<string, string> = { ...AI_CLIENT_SKILL_DIRS };

describe("installSkills (filesystem-based registrar)", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let tmpClient: string;

  beforeEach(() => {
    // Restore to original before each test to ensure clean state
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    // Clear any leftover keys from previous tests
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      if (!(k in origDirs)) delete AI_CLIENT_SKILL_DIRS[k];
    }

    tmpClient = path.join(os.tmpdir(), `saicmotor-postinstall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    // Redirect AI_CLIENT_SKILL_DIRS to temp in place
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
    }

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    // Restore original dirs
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    // Clean up temp dirs
    if (fs.existsSync(tmpClient)) fs.rmSync(tmpClient, { recursive: true, force: true });
  });

  it("installs skills when not already installed", () => {
    installSkills();

    // At least one skill should be registered in at least one client dir
    const anySkillInstalled = Object.values(AI_CLIENT_SKILL_DIRS).some((dir) => {
      return (
        fs.existsSync(path.join(dir as string, "saicmotor-suite"))
        || fs.existsSync(path.join(dir as string, "saicmotor-leave"))
        || fs.existsSync(path.join(dir as string, "saicmotor-attendance"))
        || fs.existsSync(path.join(dir as string, "saicmotor-shared"))
      );
    });
    expect(anySkillInstalled).toBe(true);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("个 AI skills 已注册"));
  });

  it("skips when already installed", () => {
    // Pre-create a skill entry to simulate "already installed"
    const skillName = "saicmotor-suite";
    for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS)) {
      const target = path.join(clientSkillsDir as string, skillName);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "SKILL.md"), "# test\n");
    }

    expect(skillsAlreadyInstalled()).toBe(true);
    installSkills();
    expect(consoleLogSpy).toHaveBeenCalledWith("AI skills 已安装，跳过");
  });

  it("force reinstalls even if already installed", () => {
    const skillName = "saicmotor-suite";
    for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS)) {
      const target = path.join(clientSkillsDir as string, skillName);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(path.join(target, "SKILL.md"), "# test\n");
    }

    expect(skillsAlreadyInstalled()).toBe(true);
    installSkills({ force: true });

    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("个 AI skills 已注册"));
  });

  it("skillsAlreadyInstalled returns false when nothing registered", () => {
    expect(skillsAlreadyInstalled()).toBe(false);
  });

  it("skillsAlreadyInstalled returns true when at least one skill exists in any client dir", () => {
    const firstDir = Object.values(AI_CLIENT_SKILL_DIRS)[0] as string;
    const target = path.join(firstDir, "saicmotor-suite");
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "SKILL.md"), "# test\n");

    expect(skillsAlreadyInstalled()).toBe(true);
  });

  it("runPostinstall skips skill registration under npx", () => {
    vi.stubEnv("npm_command", "exec");

    runPostinstall();

    expect(consoleLogSpy).toHaveBeenCalledWith("npx 模式，跳过 skills 自动注册");
    const allClean = Object.values(AI_CLIENT_SKILL_DIRS).every((dir) => {
      const dirStr = dir as string;
      return (
        !fs.existsSync(path.join(dirStr, "saicmotor-suite"))
        && !fs.existsSync(path.join(dirStr, "saicmotor-leave"))
        && !fs.existsSync(path.join(dirStr, "saicmotor-attendance"))
        && !fs.existsSync(path.join(dirStr, "saicmotor-shared"))
      );
    });
    expect(allClean).toBe(true);

    vi.unstubAllEnvs();
  });

  it("runPostinstall runs registration when not npx", () => {
    vi.stubEnv("npm_command", "install");

    runPostinstall();

    const hasCompletionMsg = consoleLogSpy.mock.calls.some(
      (call) =>
        typeof call[0] === "string"
        && call[0].includes("saicmotor CLI 安装完成")
    );
    expect(hasCompletionMsg).toBe(true);

    vi.unstubAllEnvs();
  });
});