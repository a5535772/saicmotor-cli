"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExchangeProvider = void 0;
const errors_1 = require("../engine/errors");
const http_1 = require("../engine/http");
const extract_1 = require("../engine/extract");
const store_1 = require("./store");
const loopback_1 = require("./loopback");
const open_1 = require("./open");
class ExchangeProvider {
    config;
    constructor(config) {
        this.config = config;
    }
    async login() {
        const authCfg = this.config.auth;
        const handle = await (0, loopback_1.startCallbackServer)({
            host: authCfg.loopbackHost, port: authCfg.loopbackPort, timeoutMs: authCfg.callbackTimeoutMs,
        });
        let start;
        try {
            const startResp = await (0, http_1.send)({
                method: "GET",
                url: `${this.config.gateway}${authCfg.startPath}?port=${handle.port}`,
            });
            start = (0, extract_1.getByPath)(startResp.body, "data");
            await (0, open_1.openBrowser)(start?.authUrl ?? "");
        }
        catch (e) {
            await handle.close();
            throw e;
        }
        if (!start || !start.authUrl || !start.state) {
            await handle.close();
            throw new errors_1.SaicmotorError("auth", "网关未返回授权地址");
        }
        let cb;
        try {
            cb = await handle.result;
        }
        finally {
            await handle.close();
        }
        if (cb.state !== start.state) {
            throw new errors_1.SaicmotorError("auth", "回调 state 不匹配，请重新登录");
        }
        const exResp = await (0, http_1.send)({
            method: "POST",
            url: `${this.config.gateway}${authCfg.exchangePath}`,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: cb.code, state: cb.state }),
        });
        const body = exResp.body;
        if (body && typeof body === "object" && Number(body.code) !== 0) {
            throw new errors_1.SaicmotorError("auth", `SSO 登录失败: ${body.msg ?? "未知错误"}`);
        }
        const token = (0, extract_1.getByPath)(body, authCfg.tokenPath);
        if (typeof token !== "string" || token.length === 0) {
            throw new errors_1.SaicmotorError("auth", "exchange 响应中未找到 token");
        }
        (0, store_1.writeToken)(token);
        return token;
    }
}
exports.ExchangeProvider = ExchangeProvider;
//# sourceMappingURL=exchange.js.map