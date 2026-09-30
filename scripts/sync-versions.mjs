import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const cliPkg = JSON.parse(
  readFileSync(resolve(root, "packages", "cli", "package.json"), "utf-8")
);
const sdkPkgPath = resolve(root, "packages", "sdk", "package.json");
const sdkPkg = JSON.parse(readFileSync(sdkPkgPath, "utf-8"));

if (sdkPkg.version === cliPkg.version) {
  console.log(`SDK version already ${cliPkg.version}, no sync needed`);
  process.exit(0);
}

sdkPkg.version = cliPkg.version;
writeFileSync(sdkPkgPath, JSON.stringify(sdkPkg, null, 2) + "\n");
console.log(`Synced SDK version → ${cliPkg.version}`);