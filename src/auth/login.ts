import type { Config } from "../config";
import { SaicmotorError } from "../engine/errors";
import { send } from "../engine/http";
import { getByPath } from "../engine/extract";
import { writeToken } from "./store";

export async function login(config: Config, username: string, password: string): Promise<string> {
  const resp = await send({
    method: "POST",
    url: config.gateway + config.auth.loginPath,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (resp.status >= 400) {
    throw new SaicmotorError("auth", `登录失败 (HTTP ${resp.status})`, { hint: "检查网关地址或账号密码" });
  }
  const body = resp.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object" && body.code !== 0) {
    throw new SaicmotorError("auth", `登录失败: ${body.msg ?? "未知错误"}`, { hint: "检查账号密码" });
  }
  const token = getByPath(body, config.auth.tokenPath);
  if (typeof token !== "string" || token.length === 0) {
    throw new SaicmotorError("auth", "登录响应中未找到 token", { hint: `检查 tokenPath 配置: ${config.auth.tokenPath}` });
  }
  writeToken(token);
  return token;
}
