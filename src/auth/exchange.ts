import type { Config } from "../config";
import { SaicmotorError } from "../engine/errors";
import { send } from "../engine/http";
import { getByPath } from "../engine/extract";
import { writeToken } from "./store";
import { startCallbackServer } from "./loopback";
import { openBrowser } from "./open";
import type { AuthProvider } from "./provider-types";

interface StartData { authUrl: string; state: string; }

export class ExchangeProvider implements AuthProvider {
  constructor(private readonly config: Config) {}

  async login(): Promise<string> {
    const authCfg = this.config.auth;
    const handle = await startCallbackServer({
      host: authCfg.loopbackHost, port: authCfg.loopbackPort, timeoutMs: authCfg.callbackTimeoutMs,
    });
    let start: StartData | undefined;
    try {
      const startResp = await send({
        method: "GET",
        url: `${this.config.gateway}${authCfg.startPath}?port=${handle.port}`,
      });
      start = getByPath(startResp.body, "data") as StartData | undefined;
      await openBrowser(start?.authUrl ?? "");
    } catch (e) {
      await handle.close();
      throw e;
    }
    if (!start || !start.authUrl || !start.state) {
      await handle.close();
      throw new SaicmotorError("auth", "网关未返回授权地址");
    }

    let cb;
    try {
      cb = await handle.result;
    } finally {
      await handle.close();
    }
    if (cb.state !== start.state) {
      throw new SaicmotorError("auth", "回调 state 不匹配，请重新登录");
    }

    const exResp = await send({
      method: "POST",
      url: `${this.config.gateway}${authCfg.exchangePath}`,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: cb.code, state: cb.state }),
    });
    const body = exResp.body as Record<string, unknown> | undefined;
    if (body && typeof body === "object" && Number(body.code) !== 0) {
      throw new SaicmotorError("auth", `SSO 登录失败: ${body.msg ?? "未知错误"}`);
    }
    const token = getByPath(body, authCfg.tokenPath);
    if (typeof token !== "string" || token.length === 0) {
      throw new SaicmotorError("auth", "exchange 响应中未找到 token");
    }
    writeToken(token);
    return token;
  }
}
