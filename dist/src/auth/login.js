"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
const errors_1 = require("../engine/errors");
const http_1 = require("../engine/http");
const extract_1 = require("../engine/extract");
const store_1 = require("./store");
async function login(config, username, password) {
    const resp = await (0, http_1.send)({
        method: "POST",
        url: config.gateway + config.auth.loginPath,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
    });
    if (resp.status >= 400) {
        throw new errors_1.SaicmotorError("auth", `登录失败 (HTTP ${resp.status})`, { hint: "检查网关地址或账号密码" });
    }
    const body = resp.body;
    if (body && typeof body === "object" && body.code !== 0) {
        throw new errors_1.SaicmotorError("auth", `登录失败: ${body.msg ?? "未知错误"}`, { hint: "检查账号密码" });
    }
    const token = (0, extract_1.getByPath)(body, config.auth.tokenPath);
    if (typeof token !== "string" || token.length === 0) {
        throw new errors_1.SaicmotorError("auth", "登录响应中未找到 token", { hint: `检查 tokenPath 配置: ${config.auth.tokenPath}` });
    }
    (0, store_1.writeToken)(token);
    return token;
}
//# sourceMappingURL=login.js.map