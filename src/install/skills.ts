// src/install/skills.ts
// skills 注册逻辑（postinstall 与 `saicmotor install` 共用）
import { execSync as nodeExecSync } from "node:child_process";
import { packageFile } from "../pkg-root";

export const SKILLS_REPO =
  process.env.SAICMOTOR_SKILLS_REPO ||
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (require(packageFile("saicmotor.config.json")) as { repo: string }).repo;

let _execSync = nodeExecSync;

/** 测试注入点：替换 execSync 实现 */
export function __setExecSync(fn: typeof nodeExecSync): void {
  _execSync = fn;
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1b\[[0-9;]*m/g;

export function skillsAlreadyInstalled(): boolean {
  try {
    const out = _execSync("npx -y skills ls -g", {
      stdio: "pipe",
      timeout: 30000,
    });
    // skills CLI 即使在 pipe 下也输出 ANSI 颜色码，需先剥离再匹配
    return /^saicmotor-/m.test(out.toString().replace(ANSI_RE, ""));
  } catch {
    return false;
  }
}

export function installSkills({ force = false }: { force?: boolean } = {}): void {
  if (!force && skillsAlreadyInstalled()) {
    console.log("AI skills 已安装，跳过");
    return;
  }

  try {
    _execSync(`npx -y skills add ${SKILLS_REPO} --all -g`, {
      stdio: "pipe",
      timeout: 120000,
    });
    console.log("✓ AI skills 已注册");
  } catch {
    console.log(
      `⚠ AI skills 注册失败，稍后可手动运行:\n` +
        `  saicmotor install\n` +
        `  或: npx skills add ${SKILLS_REPO} --all -g`
    );
  }
}

/** npm lifecycle postinstall 入口 */
export function runPostinstall(): void {
  console.log("\nsaicmotor CLI 安装完成。");
  installSkills();
  console.log("  首次使用前请运行: saicmotor auth login");
  console.log("  探索命令: saicmotor --help\n");
}
