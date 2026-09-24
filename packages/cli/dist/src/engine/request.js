"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildUrl = buildUrl;
exports.coerceFields = coerceFields;
exports.buildBody = buildBody;
const errors_1 = require("./errors");
function buildUrl(config, servicePath, method) {
    return config.gateway + servicePath + method.path;
}
function coerceFields(fields, raw) {
    const out = {};
    for (const [name, field] of Object.entries(fields)) {
        const value = raw[name];
        if (value === undefined) {
            if (field.required)
                throw new errors_1.SaicmotorError("validation", `缺少必填参数: ${name}`);
            continue;
        }
        switch (field.type) {
            case "integer": {
                const n = Number(value);
                if (!Number.isInteger(n))
                    throw new errors_1.SaicmotorError("validation", `参数 ${name} 应为整数，实际: ${value}`);
                out[name] = n;
                break;
            }
            case "number": {
                const n = Number(value);
                if (Number.isNaN(n))
                    throw new errors_1.SaicmotorError("validation", `参数 ${name} 应为数字，实际: ${value}`);
                out[name] = n;
                break;
            }
            case "boolean":
                out[name] = value === "true" || value === "1";
                break;
            default:
                out[name] = value;
        }
    }
    return out;
}
function buildBody(method, values) {
    if (!method.requestBody)
        return undefined;
    const body = {};
    for (const name of Object.keys(method.requestBody)) {
        if (values[name] !== undefined)
            body[name] = values[name];
    }
    return JSON.stringify(body);
}
//# sourceMappingURL=request.js.map