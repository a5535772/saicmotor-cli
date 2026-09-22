"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = submit;
const request_1 = require("../../../src/engine/request");
const transport_1 = require("../../../src/auth/transport");
const http_1 = require("../../../src/engine/http");
const errors_1 = require("../../../src/engine/errors");
async function submit(ctx) {
    console.error("[script] 补卡申请前校验通过");
    if (ctx.dryRun) {
        return { ok: true, data: { dryRun: true, note: "script: preview" } };
    }
    const token = await ctx.ensureToken();
    const url = (0, request_1.buildUrl)(ctx.config, ctx.service.servicePath, ctx.method);
    const headers = { "Content-Type": "application/json" };
    (0, transport_1.applyAuth)(headers, ctx.config, token);
    const resp = await (0, http_1.send)({
        method: ctx.method.httpMethod,
        url,
        headers,
        body: (0, request_1.buildBody)(ctx.method, ctx.values),
    });
    if (resp.status >= 400) {
        throw new errors_1.SaicmotorError("upstream", `上游 HTTP ${resp.status}`);
    }
    return { ok: true, data: resp.body?.data };
}
//# sourceMappingURL=submit.js.map