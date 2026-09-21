"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaicmotorError = exports.EXIT_CODES = void 0;
exports.EXIT_CODES = {
    validation: 2,
    auth: 3,
    network: 4,
    upstream: 5,
    spec: 6,
};
class SaicmotorError extends Error {
    category;
    hint;
    upstream;
    constructor(category, message, opts = {}) {
        super(message);
        this.name = "SaicmotorError";
        this.category = category;
        this.hint = opts.hint;
        this.upstream = opts.upstream;
    }
    get exitCode() {
        return exports.EXIT_CODES[this.category];
    }
}
exports.SaicmotorError = SaicmotorError;
//# sourceMappingURL=errors.js.map