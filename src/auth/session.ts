import type { Config } from "../config";
import { SaicmotorError } from "../engine/errors";
import { readToken, readCredentials } from "./store";
import { login } from "./login";

export async function ensureToken(config: Config, opts: { force?: boolean } = {}): Promise<string> {
  const cached = opts.force ? undefined : readToken();
  if (cached) return cached;
  const creds = readCredentials();
  if (!creds) {
    throw new SaicmotorError("auth", "未登录，请先运行: saicmotor auth login --username <工号> --password <密码>");
  }
  return login(config, creds.username, creds.password);
}
