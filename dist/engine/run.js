"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMethod = runMethod;
const errors_1 = require("./errors");
const http_1 = require("./http");
const session_1 = require("../auth/session");
const transport_1 = require("../auth/transport");
const store_1 = require("../auth/store");
const request_1 = require("./request");
const script_1 = require("./script");
function extractMessage(body) {
    if (body && typeof body === "object")
        return String(body.msg ?? "");
    return undefined;
}
function checkEnvelope(resp) {
    if (resp.status >= 400) {
        throw new errors_1.SaicmotorError("upstream", `上游返回 HTTP ${resp.status}`, { upstream: { message: extractMessage(resp.body) } });
    }
    const body = resp.body;
    if (body && typeof body === "object" && body.code !== 0) {
        throw new errors_1.SaicmotorError("upstream", `上游业务错误: ${body.msg ?? ""}`, { upstream: { code: body.code, message: extractMessage(body) } });
    }
}
async function execute(config, servicePath, method, token, values) {
    const url = (0, request_1.buildUrl)(config, servicePath, method);
    const headers = {};
    const body = (0, request_1.buildBody)(method, values);
    if (body !== undefined)
        headers["Content-Type"] = "application/json";
    (0, transport_1.applyAuth)(headers, config, token);
    return (0, http_1.send)({ method: method.httpMethod, url, headers, body });
}
async function runMethod(config, service, resourceName, methodName, method, raw, opts = {}) {
    const values = (0, request_1.coerceFields)(method.requestBody ?? {}, raw);
    // 脚本覆盖：检测到同名脚本 → 走脚本（脚本内部自行处理 dryRun 与 token）
    const scriptFile = (0, script_1.findScript)(service.name, resourceName, methodName);
    if (scriptFile) {
        return (0, script_1.executeScript)(scriptFile, {
            config,
            service,
            method,
            values,
            dryRun: !!opts.dryRun,
            ensureToken: () => (0, session_1.ensureToken)(config),
        });
    }
    if (opts.dryRun) {
        return {
            ok: true,
            data: {
                dryRun: true,
                request: { method: method.httpMethod, url: (0, request_1.buildUrl)(config, service.servicePath, method), body: (0, request_1.buildBody)(method, values) },
            },
        };
    }
    let token = await (0, session_1.ensureToken)(config);
    let resp = await execute(config, service.servicePath, method, token, values);
    if (resp.status === 401) {
        (0, store_1.clearToken)();
        token = await (0, session_1.ensureToken)(config, { force: true });
        resp = await execute(config, service.servicePath, method, token, values);
    }
    checkEnvelope(resp);
    return { ok: true, data: resp.body?.data };
}
//# sourceMappingURL=run.js.map