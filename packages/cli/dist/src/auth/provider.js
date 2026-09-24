"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAuthProvider = createAuthProvider;
const password_1 = require("./password");
const exchange_1 = require("./exchange");
function createAuthProvider(config) {
    if (config.auth.type === "exchange")
        return new exchange_1.ExchangeProvider(config);
    return new password_1.PasswordProvider(config);
}
//# sourceMappingURL=provider.js.map