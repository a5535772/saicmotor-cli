"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.send = send;
const errors_1 = require("./errors");
async function send(input, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let status = 0;
    let rawBody = "";
    const headers = {};
    try {
        const res = await fetch(input.url, {
            method: input.method,
            headers: input.headers,
            body: input.body,
            signal: controller.signal,
            redirect: "manual",
        });
        status = res.status;
        res.headers.forEach((v, k) => {
            const key = k.toLowerCase();
            if (key === "set-cookie")
                headers[key] = headers[key] ? headers[key] + "; " + v : v;
            else
                headers[key] = v;
        });
        rawBody = await res.text();
    }
    catch (err) {
        throw new errors_1.SaicmotorError("network", `请求失败: ${input.method} ${input.url} — ${err.message}`);
    }
    finally {
        clearTimeout(timer);
    }
    let body = rawBody;
    if ((headers["content-type"] ?? "").toLowerCase().includes("application/json")) {
        try {
            body = JSON.parse(rawBody);
        }
        catch { /* keep raw */ }
    }
    return { status, headers, body, rawBody };
}
//# sourceMappingURL=http.js.map