import { exec } from "node:child_process";
import { promisify } from "node:util";
import { SaicmotorError } from "../engine/errors";

const execAsync = promisify(exec);

export async function openBrowser(url: string): Promise<void> {
  let u: URL;
  try { u = new URL(url); } catch { throw new SaicmotorError("network", "非法授权地址", { hint: url }); }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new SaicmotorError("network", "授权地址协议不被允许", { hint: url });
  }
  let cmd: string;
  if (process.platform === "win32") cmd = `start "" "${url}"`;
  else if (process.platform === "darwin") cmd = `open "${url}"`;
  else cmd = `xdg-open "${url}"`;
  try {
    await execAsync(cmd, { windowsHide: true });
  } catch {
    throw new SaicmotorError("network", "无法打开浏览器", { hint: `请手动访问: ${url}` });
  }
}
