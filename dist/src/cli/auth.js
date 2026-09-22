"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuth = registerAuth;
const config_1 = require("../config");
const store_1 = require("../auth/store");
const provider_1 = require("../auth/provider");
const errors_1 = require("../engine/errors");
const error_1 = require("./error");
function registerAuth(program) {
    const authCmd = program.command("auth").description("登录认证");
    authCmd.command("login")
        .option("--username <u>", "工号（仅 password 模式需要）")
        .option("--password <p>", "密码（仅 password 模式需要）")
        .action(async (opts) => {
        try {
            const config = (0, config_1.loadConfig)();
            (0, store_1.clearToken)();
            if (config.auth.type === "password") {
                if (!opts.username || !opts.password) {
                    throw new errors_1.SaicmotorError("validation", "password 模式需要 --username 和 --password");
                }
                (0, store_1.writeCredentials)({ username: opts.username, password: opts.password });
            }
            const token = await (0, provider_1.createAuthProvider)(config).login();
            console.log(`已登录，token 已缓存（${token.slice(0, 8)}…）`);
        }
        catch (e) {
            (0, error_1.handleError)(e);
        }
    });
    authCmd.command("logout").action(() => {
        try {
            (0, store_1.clearToken)();
            (0, store_1.clearCredentials)();
            console.log("已登出");
        }
        catch (e) {
            (0, error_1.handleError)(e);
        }
    });
    authCmd.command("status").action(() => {
        try {
            console.log((0, store_1.readToken)() ? "已登录" : "未登录");
        }
        catch (e) {
            (0, error_1.handleError)(e);
        }
    });
}
//# sourceMappingURL=auth.js.map