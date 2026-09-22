import type { Config } from "../config";
import { SaicmotorError } from "../engine/errors";
import { readToken, readCredentials } from "./store";
import { createAuthProvider } from "./provider";

export async function ensureToken(config: Config, opts: { force?: boolean } = {}): Promise<string> {
  const cached = opts.force ? undefined : readToken();
  if (cached) return cached;
  if (config.auth.type === "password" && !readCredentials()) {
    throw new SaicmotorError("auth", "未登录，请先运行: saicmotor auth login --username <工号> --password <密码>");
  }
  return createAuthProvider(config).login();
}
