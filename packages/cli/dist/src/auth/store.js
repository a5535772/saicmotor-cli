"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeCredentials = writeCredentials;
exports.readCredentials = readCredentials;
exports.clearCredentials = clearCredentials;
exports.writeToken = writeToken;
exports.readToken = readToken;
exports.clearToken = clearToken;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config");
function credentialsFile() {
    return node_path_1.default.join((0, config_1.saicmotorDir)(), "credentials.json");
}
function tokenFile() {
    return node_path_1.default.join((0, config_1.saicmotorDir)(), "token.json");
}
function writeCredentials(creds) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(credentialsFile()), { recursive: true });
    node_fs_1.default.writeFileSync(credentialsFile(), JSON.stringify(creds, null, 2), { mode: 0o600 });
}
function readCredentials() {
    const envUser = process.env.SAICMOTOR_USERNAME;
    const envPass = process.env.SAICMOTOR_PASSWORD;
    if (envUser && envPass)
        return { username: envUser, password: envPass };
    try {
        const raw = JSON.parse(node_fs_1.default.readFileSync(credentialsFile(), "utf8"));
        if (typeof raw.username === "string" && typeof raw.password === "string") {
            return { username: raw.username, password: raw.password };
        }
    }
    catch {
        /* not found */
    }
    return undefined;
}
function clearCredentials() {
    try {
        node_fs_1.default.rmSync(credentialsFile(), { force: true });
    }
    catch { /* ignore */ }
}
function writeToken(token) {
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(tokenFile()), { recursive: true });
    node_fs_1.default.writeFileSync(tokenFile(), JSON.stringify({ token }, null, 2), { mode: 0o600 });
}
function readToken() {
    try {
        const raw = JSON.parse(node_fs_1.default.readFileSync(tokenFile(), "utf8"));
        if (typeof raw.token === "string" && raw.token.length > 0)
            return raw.token;
    }
    catch {
        /* not found */
    }
    return undefined;
}
function clearToken() {
    try {
        node_fs_1.default.rmSync(tokenFile(), { force: true });
    }
    catch { /* ignore */ }
}
//# sourceMappingURL=store.js.map