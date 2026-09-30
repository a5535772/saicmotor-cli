import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

let cached: string | null = null;

function findPackageJson(dir: string): string | null {
  // vitest (source TS):  src/    → resolve(..)    = packages/cli/package.json
  // compiled (dist JS):  dist/src/ → resolve(../..) = packages/cli/package.json
  const candidates = [
    resolve(dir, "..", "package.json"),
    resolve(dir, "..", "..", "package.json"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function getCoreVersion(): string {
  if (cached !== null) return cached;
  try {
    const pkgPath = findPackageJson(__dirname);
    if (!pkgPath) throw new Error("package.json not found");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
      version?: string;
    };
    cached = pkg.version ?? "0.0.0";
  } catch {
    cached = "0.0.0";
  }
  return cached;
}