#!/usr/bin/env node
// saicmotor CLI — 入口 shim（对标 feishu-cli scripts/run.js）
// 职责：代理到编译产物 dist/cli/index.js，缺失时自动给出修复指引

const path = require("path");
const fs = require("fs");

const entry = path.join(__dirname, "..", "dist", "cli", "index.js");

if (!fs.existsSync(entry)) {
  console.error(
    [
      "saicmotor CLI 入口缺失。",
      "请重新安装: npm install -g https://github.com/a5535772/saicmotor-cli/tarball/master",
      "或在项目目录运行: npm run build",
    ].join("\n")
  );
  process.exit(1);
}

// 代理到真正的 CLI 入口
require(entry);