"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleError = handleError;
const errors_1 = require("../engine/errors");
const output_1 = require("../engine/output");
function handleError(e) {
    if (e instanceof errors_1.SaicmotorError) {
        console.error((0, output_1.formatEnvelope)(false, undefined, { type: e.category, message: e.message, hint: e.hint, upstream: e.upstream }));
        process.exit(e.exitCode);
    }
    console.error(String(e));
    process.exit(1);
}
//# sourceMappingURL=error.js.map