// src/pkg-root.ts
// 统一包根定位：源码位于 src/、编译产物位于 dist/src/，两种形态下都能找到包根
import fs from "node:fs";
import path from "node:path";

const PACKAGE_MARKER = "saicmotor.config.json";

export function findPackageRoot(start: string = __dirname): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, PACKAGE_MARKER))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // 兜底：src/ 或 dist/src/ 下两级即包根
  return path.resolve(start, "..", "..");
}

export function packageFile(rel: string): string {
  return path.join(findPackageRoot(), rel);
}

export function distRoot(): string {
  return path.join(findPackageRoot(), "dist");
}
