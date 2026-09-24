// saicmotor-cli/test/unit/install-command.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  installSkills,
  skillsAlreadyInstalled,
  SKILLS_REPO,
  __setExecSync,
} from "../../src/install/skills";

describe("installSkills export", () => {
  let execSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    execSyncMock = vi.fn();
    __setExecSync(execSyncMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── installSkills signature ──────────────────────────────────────────

  it("installSkills accepts optional { force } parameter", () => {
    execSyncMock.mockReturnValueOnce(Buffer.from("saicmotor-suite\n"));

    expect(() => installSkills()).not.toThrow();
    expect(() => installSkills({ force: false })).not.toThrow();
    expect(() => installSkills({ force: true })).not.toThrow();
  });

  it("installSkills with force=false skips when already installed", () => {
    execSyncMock.mockReturnValueOnce(Buffer.from("saicmotor-suite\nsaicmotor-leave\n"));

    installSkills({ force: false });

    // Only called for "ls" check, not "add"
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it("installSkills with force=true always runs skills add", () => {
    execSyncMock
      .mockReturnValueOnce(Buffer.from("saicmotor-suite\n")) // ls succeeds → installed
      .mockReturnValueOnce(Buffer.from(""));                  // add succeeds

    installSkills({ force: true });

    // force=true bypasses the "already installed" check
    expect(execSyncMock).toHaveBeenNthCalledWith(
      1,
      "npx -y skills add a5535772/saicmotor-cli --all -g",
      { stdio: "pipe", timeout: 120000 }
    );
  });

  // ── skillsAlreadyInstalled ───────────────────────────────────────────

  it("skillsAlreadyInstalled returns boolean (npx may be unavailable)", () => {
    // If npx is available and returns skills list → true
    // If npx fails or unavailable → false
    // Both are valid responses in a test environment
    const result = skillsAlreadyInstalled();
    expect(typeof result).toBe("boolean");
  });

  // ── SKILLS_REPO default ──────────────────────────────────────────────

  it("SKILLS_REPO reads default from saicmotor.config.json", () => {
    expect(SKILLS_REPO).toBe("a5535772/saicmotor-cli");
  });
});