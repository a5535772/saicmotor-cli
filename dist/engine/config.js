"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.saicmotorDir = saicmotorDir;
exports.skillPath = skillPath;
exports.skillMdPath = skillMdPath;
exports.credentialPath = credentialPath;
exports.listSystems = listSystems;
exports.toKebab = toKebab;
exports.toCamel = toCamel;
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
function saicmotorDir() {
    return process.env.SAICMOTOR_HOME ?? node_path_1.default.join(node_os_1.default.homedir(), ".saicmotor");
}
function skillPath(system) {
    return node_path_1.default.join(saicmotorDir(), "skills", system, "skill.json");
}
function skillMdPath(system) {
    return node_path_1.default.join(saicmotorDir(), "skills", system, "skill.md");
}
function credentialPath(system) {
    return node_path_1.default.join(saicmotorDir(), "credentials", `${system}.json`);
}
function listSystems() {
    const dir = node_path_1.default.join(saicmotorDir(), "skills");
    try {
        return node_fs_1.default.readdirSync(dir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
    }
    catch {
        return [];
    }
}
function toKebab(s) {
    return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}
function toCamel(s) {
    return s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
//# sourceMappingURL=config.js.map