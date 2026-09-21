"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearSession = clearSession;
exports.ensureSession = ensureSession;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const errors_1 = require("./errors");
const request_1 = require("./request");
const http_1 = require("./http");
const store_1 = require("../auth/store");
const config_1 = require("./config");
function sessionCachePath(system) {
    return node_path_1.default.join((0, config_1.saicmotorDir)(), "sessions", `${system}.json`);
}
function readCachedSession(system) {
    try {
        const raw = JSON.parse(node_fs_1.default.readFileSync(sessionCachePath(system), "utf8"));
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
            const okCookie = typeof raw.cookie === "string" && raw.cookie.length > 0;
            const okHeader = raw.header && typeof raw.header === "object" && typeof raw.header.name === "string" && typeof raw.header.value === "string";
            if (okCookie || okHeader)
                return raw;
        }
    }
    catch { /* no cache */ }
    return undefined;
}
function writeCachedSession(system, session) {
    const file = sessionCachePath(system);
    node_fs_1.default.mkdirSync(node_path_1.default.dirname(file), { recursive: true });
    node_fs_1.default.writeFileSync(file, JSON.stringify(session), { mode: 0o600 });
}
function clearSession(system) {
    try {
        node_fs_1.default.rmSync(sessionCachePath(system), { force: true });
    }
    catch { /* ignore */ }
}
function getHeaderInsensitive(headers, name) {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(headers))
        if (k.toLowerCase() === lower)
            return v;
    return undefined;
}
async function ensureSession(skill, opts = {}) {
    const cached = opts.force ? undefined : readCachedSession(skill.name);
    if (cached)
        return cached;
    const loginSpec = skill.requests[skill.auth.loginRequest];
    if (!loginSpec)
        throw new errors_1.SaicmotorError("spec", `auth.loginRequest 引用了未定义的请求: ${skill.auth.loginRequest}`);
    const creds = (0, store_1.readCredentials)(skill.name);
    const req = (0, request_1.buildRequest)(skill, loginSpec, { username: creds.username, password: creds.password });
    const resp = await (0, http_1.send)(req);
    if (resp.status >= 400)
        throw new errors_1.SaicmotorError("auth", `登录失败 (HTTP ${resp.status})`, { hint: "检查账号密码" });
    let session;
    if (skill.auth.sessionFrom === "cookie") {
        const setCookie = resp.headers["set-cookie"];
        if (setCookie) {
            const m = new RegExp(`(?:^|;\\s*)${skill.auth.sessionKey}=([^;]*)`).exec(setCookie);
            if (m)
                session = { cookie: `${skill.auth.sessionKey}=${m[1]}` };
        }
    }
    else {
        const v = getHeaderInsensitive(resp.headers, skill.auth.sessionKey);
        if (v)
            session = { header: { name: skill.auth.sessionKey, value: v } };
    }
    if (!session)
        throw new errors_1.SaicmotorError("auth", `登录响应中未找到会话 (${skill.auth.sessionKey})`);
    writeCachedSession(skill.name, session);
    return session;
}
//# sourceMappingURL=session.js.map