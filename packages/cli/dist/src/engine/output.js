"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toTableRows = toTableRows;
exports.formatTable = formatTable;
exports.formatJson = formatJson;
exports.formatEnvelope = formatEnvelope;
const errors_1 = require("./errors");
function toTableRows(data) {
    if (Array.isArray(data))
        return data;
    if (data && typeof data === "object") {
        const obj = data;
        const inner = obj.data;
        if (inner && Array.isArray(inner.list))
            return inner.list;
        if (Array.isArray(obj.list))
            return obj.list;
    }
    throw new errors_1.SaicmotorError("validation", "表格输出需要数组数据");
}
function formatTable(data) {
    const rows = toTableRows(data);
    if (rows.length === 0)
        return "(空)";
    const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
    const sep = "  |  ";
    const header = keys.join(sep);
    const rule = keys.map((k) => "-".repeat(k.length)).join(sep);
    const bodyRows = rows.map((r) => keys.map((k) => String(r[k] ?? "")).join(sep));
    return [header, rule, ...bodyRows].join("\n");
}
function formatJson(value, pretty = false) {
    return JSON.stringify(value, null, pretty ? 2 : undefined);
}
function formatEnvelope(ok, data, error) {
    return ok
        ? `${JSON.stringify({ ok: true, data: data ?? null })}\n`
        : `${JSON.stringify({ ok: false, error: error ?? null })}\n`;
}
//# sourceMappingURL=output.js.map