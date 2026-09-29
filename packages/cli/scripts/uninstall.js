#!/usr/bin/env node
// preuninstall hook: 卸载 @saicmotor/cli 时清理 saicmotor skills 与本地数据。
// 幂等、永不抛、npx（npm exec）场景直接跳过，绝不阻断 npm uninstall 本身。

const fs = require("fs");
const path = require("path");
const os = require("os");

function saicmotorHome(homedir = os.homedir()) {
  return process.env.SAICMOTOR_HOME ?? path.join(homedir, ".saicmotor");
}

function clientSkillDirs(homedir = os.homedir()) {
  return [
    path.join(homedir, ".claude", "skills"),
    path.join(homedir, ".agents", "skills"),
    path.join(homedir, ".codebuddy", "skills"),
  ];
}

function cleanup({ homedir = os.homedir() } = {}) {
  // 1. 清除 saicmotor-* skills（幂等）
  for (const dir of clientSkillDirs(homedir)) {
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.startsWith("saicmotor-")) continue;
      try {
        const target = path.join(dir, name);
        const st = fs.lstatSync(target);
        if (!st.isSymbolicLink() && !st.isDirectory()) continue;
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
        // 删除失败不阻断
      }
    }
  }

  // 2. 删除本地数据
  try {
    fs.rmSync(saicmotorHome(homedir), { recursive: true, force: true });
  } catch {
    // 删除失败不阻断
  }
}

function isNpx() {
  return process.env.npm_command === "exec";
}

if (require.main === module) {
  if (isNpx()) {
    process.exit(0);
  }
  cleanup();
}

module.exports = { cleanup, isNpx };
