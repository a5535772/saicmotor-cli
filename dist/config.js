"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CONFIG = void 0;
exports.saicmotorDir = saicmotorDir;
exports.configPath = configPath;
exports.loadConfig = loadConfig;
exports.catalogDir = catalogDir;
exports.scriptsDir = scriptsDir;
exports.toKebab = toKebab;
exports.toCamel = toCamel;
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
function loadPackageConfig() {
    try {
        return JSON.parse(node_fs_1.default.readFileSync(node_path_1.default.join(__dirname, "..", "saicmotor.config.json"), "utf8"));
    }
    catch {
        return {};
    }
}
const pkgConfig = loadPackageConfig();
exports.DEFAULT_CONFIG = {
    gateway: pkgConfig.defaults?.gateway ?? "http://localhost:8081",
    auth: {
        type: "password",
        loginPath: "/auth/login",
        tokenPath: "data.token",
        tokenHeader: "Authorization",
        tokenPrefix: "Bearer",
    },
};
function saicmotorDir() {
    return process.env.SAICMOTOR_HOME ?? node_path_1.default.join(node_os_1.default.homedir(), ".saicmotor");
}
function configPath() {
    return node_path_1.default.join(saicmotorDir(), "config.json");
}
function loadConfig() {
    let user = {};
    try {
        user = JSON.parse(node_fs_1.default.readFileSync(configPath(), "utf8"));
    }
    catch {
        /* use defaults */
    }
    const gateway = process.env.SAICMOTOR_GATEWAY ?? user.gateway ?? exports.DEFAULT_CONFIG.gateway;
    const auth = { ...exports.DEFAULT_CONFIG.auth, ...(user.auth ?? {}) };
    return { gateway, auth };
}
function catalogDir() {
    return process.env.SAICMOTOR_CATALOG ?? node_path_1.default.join(__dirname, "..", "catalog", "services");
}
function scriptsDir() {
    return process.env.SAICMOTOR_SCRIPTS ?? node_path_1.default.join(__dirname, "..", "scripts");
}
function toKebab(s) {
    return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/_/g, "-");
}
function toCamel(s) {
    return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
//# sourceMappingURL=config.js.map