// saicmotor-cli/test/scripts/postinstall.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  installSkills,
  __setExecSync,
} from "../../src/install/skills";

describe("installSkills", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let execSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    execSyncMock = vi.fn();
    __setExecSync(execSyncMock);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("installs skills when not already installed", () => {
    // skillsAlreadyInstalled: skills ls fails → not installed
    execSyncMock
      .mockImplementationOnce(() => {
        throw new Error("command failed"); // skills ls fails
      })
      .mockReturnValueOnce(Buffer.from("")); // skills add succeeds

    installSkills();

    expect(execSyncMock).toHaveBeenNthCalledWith(
      1,
      "npx -y skills ls -g",
      { stdio: "pipe", timeout: 30000 }
    );
    expect(execSyncMock).toHaveBeenNthCalledWith(
      2,
      "npx -y skills add a5535772/saicmotor-cli --all -g",
      { stdio: "pipe", timeout: 120000 }
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("✓ AI skills 已注册");
  });

  it("skips when already installed", () => {
    execSyncMock.mockReturnValueOnce(
      Buffer.from("saicmotor-suite\nsaicmotor-leave\n")
    );

    installSkills();

    expect(consoleLogSpy).toHaveBeenCalledWith("AI skills 已安装，跳过");
    // 只调用了 skills ls，没有调用 skills add
    expect(execSyncMock).toHaveBeenCalledTimes(1);
    expect(execSyncMock).toHaveBeenCalledWith(
      "npx -y skills ls -g",
      { stdio: "pipe", timeout: 30000 }
    );
  });

  it("detects installed skills despite ANSI color codes", () => {
    // skills CLI 即便 stdio=pipe 也输出颜色码，行首带转义序列
    execSyncMock.mockReturnValueOnce(
      Buffer.from("\x1b[36msaicmotor-suite\x1b[0m\n\x1b[36msaicmotor-leave\x1b[0m\n")
    );

    installSkills();

    expect(consoleLogSpy).toHaveBeenCalledWith("AI skills 已安装，跳过");
    expect(execSyncMock).toHaveBeenCalledTimes(1);
  });

  it("force reinstalls even if already installed", () => {
    execSyncMock
      .mockReturnValueOnce(Buffer.from("saicmotor-suite\n")); // skills ls

    installSkills({ force: true });

    // force=true 跳过 skillsAlreadyInstalled 检查，直接 add
    expect(execSyncMock).toHaveBeenNthCalledWith(
      1,
      "npx -y skills add a5535772/saicmotor-cli --all -g",
      { stdio: "pipe", timeout: 120000 }
    );
    expect(consoleLogSpy).toHaveBeenCalledWith("✓ AI skills 已注册");
  });

  it("handles install failure gracefully", () => {
    execSyncMock
      .mockImplementationOnce(() => {
        throw new Error("command failed"); // skills ls fails
      })
      .mockImplementationOnce(() => {
        throw new Error("network error"); // skills add fails
      });

    installSkills();

    expect(consoleLogSpy).toHaveBeenCalledWith(
      "⚠ AI skills 注册失败，稍后可手动运行:\n" +
        "  saicmotor install\n" +
        "  或: npx skills add a5535772/saicmotor-cli --all -g"
    );
  });

  it("respects SAICMOTOR_SKILLS_REPO env var for custom repo", async () => {
    vi.stubEnv("SAICMOTOR_SKILLS_REPO", "my-org/private-repo");
    execSyncMock
      .mockImplementationOnce(() => {
        throw new Error("command failed"); // ls fails → not installed
      })
      .mockReturnValueOnce(Buffer.from(""));

    // 重新加载模块以读取新 env（SKILLS_REPO 在模块求值时确定）
    vi.resetModules();
    const fresh = await import("../../src/install/skills");
    fresh.__setExecSync(execSyncMock);
    fresh.installSkills();

    expect(execSyncMock).toHaveBeenCalledWith(
      "npx -y skills add my-org/private-repo --all -g",
      { stdio: "pipe", timeout: 120000 }
    );
  });
});