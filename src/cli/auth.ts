import type { Command } from "commander";
import { loadConfig } from "../config";
import { writeCredentials, clearCredentials, clearToken, readToken } from "../auth/store";
import { createAuthProvider } from "../auth/provider";
import { SaicmotorError } from "../engine/errors";
import { handleError } from "./error";

export function registerAuth(program: Command): void {
  const authCmd = program.command("auth").description("登录认证");

  authCmd.command("login")
    .option("--username <u>", "工号（仅 password 模式需要）")
    .option("--password <p>", "密码（仅 password 模式需要）")
    .action(async (opts: { username?: string; password?: string }) => {
      try {
        const config = loadConfig();
        clearToken();
        if (config.auth.type === "password") {
          if (!opts.username || !opts.password) {
            throw new SaicmotorError("validation", "password 模式需要 --username 和 --password");
          }
          writeCredentials({ username: opts.username, password: opts.password });
        }
        const token = await createAuthProvider(config).login();
        console.log(`已登录，token 已缓存（${token.slice(0, 8)}…）`);
      } catch (e) { handleError(e); }
    });

  authCmd.command("logout").action(() => {
    try {
      clearToken();
      clearCredentials();
      console.log("已登出");
    } catch (e) { handleError(e); }
  });

  authCmd.command("status").action(() => {
    try {
      console.log(readToken() ? "已登录" : "未登录");
    } catch (e) { handleError(e); }
  });
}
