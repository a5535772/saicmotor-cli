#!/usr/bin/env node
// preuninstall hook: 卸载 @saicmotor/cli 时清理 saicmotor skills 与本地数据。
// 幂等、永不抛、绝不阻断 npm uninstall 本身；仅在「全局卸载」「非 npx」时清理
// （npx 临时缓存回收、项目内本地依赖卸载都不应动用户的全局 ~/.saicmotor 与 skills）。

const fs = require("fs");
const path = require("path");
const os = require("os");

function saicmotorHome(homedir = os.homedir()) {
  return process.env.SAICMOTOR_HOME ?? path.join(homedir, ".saicmotor");
}

// 注意：与 src/plugin/registrar.ts 的 AI_CLIENT_SKILL_DIRS 保持一致（新增客户端需两处同步）
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

// npm 对 `-g` 卸载会在 lifecycle 环境注入 npm_config_global=true；
// 项目内本地 `npm uninstall`（无 -g）也会触发 preuninstall，此时绝不能清全局数据。
function isGlobalUninstall() {
  return process.env.npm_config_global === "true";
}

if (require.main === module) {
  if (isNpx() || !isGlobalUninstall()) {
    process.exit(0);
  }
  cleanup();
}

module.exports = { cleanup, isNpx, isGlobalUninstall };
