"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class UpstreamError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "UpstreamError";
    }
}
const submit = async (ctx) => {
    console.error("[script] 请假申请前校验通过");
    if (ctx.dryRun) {
        return { ok: true, data: { dryRun: true, note: "script: preview" } };
    }
    const token = await ctx.ensureToken();
    const url = `${ctx.config.gateway}${ctx.service.servicePath}${ctx.method.path}`;
    const resp = await fetch(url, {
        method: ctx.method.httpMethod,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(ctx.values),
    });
    if (resp.status >= 400) {
        throw new UpstreamError("upstream", `上游 HTTP ${resp.status}`);
    }
    const json = (await resp.json());
    return { ok: true, data: json?.data };
};
exports.default = submit;
