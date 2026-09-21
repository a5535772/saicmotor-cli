"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAuth = applyAuth;
function applyAuth(headers, config, token) {
    headers[config.auth.tokenHeader] = `${config.auth.tokenPrefix} ${token}`;
    return headers;
}
//# sourceMappingURL=transport.js.map