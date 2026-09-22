"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCallbackServer = startCallbackServer;
const node_http_1 = __importDefault(require("node:http"));
const errors_1 = require("../engine/errors");
const SUCCESS_HTML = "<html><body><h3>登录成功，可以关闭本页。</h3></body></html>";
const FAIL_HTML = "<html><body><h3>登录失败，请回到终端重新登录。</h3></body></html>";
const ENDED_HTML = "<html><body><h3>登录已结束或超时，请回到终端。</h3></body></html>";
async function startCallbackServer(opts) {
    let resolveFn;
    let rejectFn;
    const result = new Promise((resolve, reject) => { resolveFn = resolve; rejectFn = reject; });
    let settled = false;
    let timer;
    const settleOk = (p) => {
        if (settled)
            return;
        settled = true;
        clearTimeout(timer);
        resolveFn(p);
    };
    const settleErr = (e) => {
        if (settled)
            return;
        settled = true;
        clearTimeout(timer);
        rejectFn(e);
    };
    const server = node_http_1.default.createServer((req, res) => {
        try {
            const u = new URL(req.url ?? "/", `http://${opts.host}`);
            if (u.pathname !== "/callback") {
                res.writeHead(404).end();
                return;
            }
            if (settled) {
                res.writeHead(410, { "Content-Type": "text/html; charset=utf-8" }).end(ENDED_HTML);
                return;
            }
            const code = u.searchParams.get("code") ?? "";
            const state = u.searchParams.get("state") ?? "";
            if (!code) {
                res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" }).end(FAIL_HTML);
                settleErr(new errors_1.SaicmotorError("auth", "回调缺少 code"));
                return;
            }
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(SUCCESS_HTML);
            settleOk({ code, state });
        }
        catch (e) {
            if (!res.headersSent) {
                res.writeHead(500).end();
            }
            else {
                res.end();
            }
            settleErr(e);
        }
    });
    const port = await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(opts.port, opts.host, () => resolve(server.address().port));
    });
    timer = setTimeout(() => {
        if (settled)
            return;
        settled = true;
        rejectFn(new errors_1.SaicmotorError("auth", "等待浏览器回调超时，请重试登录"));
    }, opts.timeoutMs);
    const close = () => new Promise((r) => {
        clearTimeout(timer);
        server.close(() => r());
    });
    return { port, result, close };
}
//# sourceMappingURL=loopback.js.map