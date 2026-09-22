"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureToken = ensureToken;
const errors_1 = require("../engine/errors");
const store_1 = require("./store");
const login_1 = require("./login");
async function ensureToken(config, opts = {}) {
    const cached = opts.force ? undefined : (0, store_1.readToken)();
    if (cached)
        return cached;
    const creds = (0, store_1.readCredentials)();
    if (!creds) {
        throw new errors_1.SaicmotorError("auth", "未登录，请先运行: saicmotor auth login --username <工号> --password <密码>");
    }
    return (0, login_1.login)(config, creds.username, creds.password);
}
//# sourceMappingURL=session.js.map