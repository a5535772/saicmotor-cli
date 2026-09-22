"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerAuth = registerAuth;
const config_1 = require("../config");
const store_1 = require("../auth/store");
const login_1 = require("../auth/login");
const error_1 = require("./error");
function registerAuth(program) {
    const authCmd = program.command("auth").description("登录认证");
    authCmd.command("login")
        .requiredOption("--username <u>", "工号")
        .requiredOption("--password <p>", "密码")
        .action(async (opts) => {
        try {
            const config = (0, config_1.loadConfig)();
            (0, store_1.writeCredentials)({ username: opts.username, password: opts.password });
            const token = await (0, login_1.login)(config, opts.username, opts.password);
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