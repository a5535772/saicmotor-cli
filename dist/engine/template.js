"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.interpolate = interpolate;
exports.interpolateValue = interpolateValue;
exports.coerceParam = coerceParam;
exports.coerceValues = coerceValues;
const errors_1 = require("./errors");
function interpolate(template, values) {
    return template.replace(/\{\{(\w+)\}\}/g, (full, name) => {
        const v = values[name];
        if (v === undefined)
            throw new errors_1.SaicmotorError("validation", `缺少参数值: ${name}`);
        return String(v);
    });
}
function interpolateValue(value, values) {
    if (typeof value === "string")
        return interpolate(value, values);
    if (Array.isArray(value))
        return value.map((v) => interpolateValue(v, values));
    if (value && typeof value === "object") {
        const out = Object.create(null);
        for (const [k, v] of Object.entries(value)) {
            out[k] = interpolateValue(v, values);
        }
        return out;
    }
    return value;
}
function coerceParam(spec, raw) {
    let value = raw;
    if (value === undefined) {
        if (spec.default !== undefined)
            value = String(spec.default);
        else if (spec.required)
            throw new errors_1.SaicmotorError("validation", `缺少必填参数: ${spec.name}`);
        else
            return "";
    }
    switch (spec.type) {
        case "number": {
            const n = Number(value);
            if (Number.isNaN(n))
                throw new errors_1.SaicmotorError("validation", `参数 ${spec.name} 应为数字，实际: ${value}`);
            return n;
        }
        case "date": {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
                throw new errors_1.SaicmotorError("validation", `参数 ${spec.name} 应为 YYYY-MM-DD，实际: ${value}`);
            return value;
        }
        case "bool":
            return value === "true" || value === "1";
        case "enum": {
            if (spec.values && spec.values[value] !== undefined)
                return spec.values[value];
            return value;
        }
        default:
            return value;
    }
}
function coerceValues(params, raw) {
    const out = {};
    for (const p of params)
        out[p.name] = coerceParam(p, raw[p.name]);
    return out;
}
//# sourceMappingURL=template.js.map