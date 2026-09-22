#!/usr/bin/env node
// scripts/postinstall.js — npm lifecycle 薄壳
// 核心逻辑在 src/install/skills.ts（编译后 dist/src/install/skills.js）
const path = require("path");
const fs = require("fs");

const entry = path.join(__dirname, "..", "dist", "src", "install", "skills.js");

if (!fs.existsSync(entry)) {
  console.warn("⚠ 未找到编译产物 dist/，跳过 skills 自动注册。请先运行 npm run build");
  process.exit(0);
}

require(entry).runPostinstall();
