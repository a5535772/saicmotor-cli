import type { Command } from "commander";
import { loadConfig } from "../config";
import { writeCredentials, clearCredentials, clearToken, readToken } from "../auth/store";
import { loginWithPassword } from "../auth/password";
import { handleError } from "./error";

export function registerAuth(program: Command): void {
  const authCmd = program.command("auth").description("登录认证");

  authCmd.command("login")
    .requiredOption("--username <u>", "工号")
    .requiredOption("--password <p>", "密码")
    .action(async (opts: { username: string; password: string }) => {
      try {
        const config = loadConfig();
        writeCredentials({ username: opts.username, password: opts.password });
        const token = await loginWithPassword(config, opts.username, opts.password);
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
