import fs from "node:fs";
import path from "node:path";

export function readTokenFromHome(home: string): string | undefined {
  try {
    return (JSON.parse(fs.readFileSync(path.join(home, "token.json"), "utf8")) as { token?: string }).token;
  } catch { return undefined; }
}
