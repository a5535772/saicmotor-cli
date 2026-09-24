#!/usr/bin/env node
// saicmotor CLI — 入口 shim（对标 feishu-cli scripts/run.js）
// 职责：代理到编译产物 dist/src/cli/index.js；缺失时开发环境尝试自动构建，
//       否则给出用新包名重装的指引。

const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const entry = path.join(root, "dist", "src", "cli", "index.js");

function buildIfPossible() {
  // 仅开发环境有 src/ 与 node_modules 的 typescript 才尝试自动构建
  const hasSrc = fs.existsSync(path.join(root, "src"));
  const hasTsc = fs.existsSync(path.join(root, "node_modules", ".bin", "tsc"));
  if (!hasSrc || !hasTsc) return false;
  try {
    require("child_process").execSync("npm run build", { cwd: root, stdio: "inherit" });
    return fs.existsSync(entry);
  } catch {
    return false;
  }
}

if (!fs.existsSync(entry) && !buildIfPossible()) {
  console.error(
    [
      "saicmotor CLI 入口缺失。",
      "请重新安装: npm install -g @saicmotor/cli",
      "或在项目目录运行: npm run build",
    ].join("\n")
  );
  process.exit(1);
}

// 代理到真正的 CLI 入口
require(entry);