// scripts/postinstall.js
const { execSync: nodeExecSync } = require("child_process");

const SKILLS_REPO =
  process.env.SAICMOTOR_SKILLS_REPO || "a5535772/saicmotor-cli";

// Injectable execSync — defaults to Node's built-in, overridable for testing
let _execSync = nodeExecSync;

function __setExecSync(fn) {
  _execSync = fn;
}

function skillsAlreadyInstalled() {
  try {
    const out = _execSync("npx -y skills ls -g", {
      stdio: "pipe",
      timeout: 30000,
    });
    return /^saicmotor-/m.test(out.toString());
  } catch {
    return false;
  }
}

function installSkills({ force = false } = {}) {
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

module.exports = {
  installSkills,
  skillsAlreadyInstalled,
  SKILLS_REPO,
  __setExecSync,
};

if (require.main === module) {
  console.log("\nsaicmotor CLI 安装完成。");
  installSkills();
  console.log("  首次使用前请运行: saicmotor auth login");
  console.log("  探索命令: saicmotor --help\n");
}