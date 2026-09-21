"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCatalog = loadCatalog;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const catalog_1 = require("../schema/catalog");
const errors_1 = require("./errors");
const config_1 = require("../config");
function loadCatalog() {
    const dir = (0, config_1.catalogDir)();
    let files;
    try {
        files = node_fs_1.default.readdirSync(dir).filter((f) => f.endsWith(".json"));
    }
    catch {
        return [];
    }
    const services = [];
    for (const f of files) {
        const file = node_path_1.default.join(dir, f);
        let raw;
        try {
            raw = JSON.parse(node_fs_1.default.readFileSync(file, "utf8"));
        }
        catch {
            throw new errors_1.SaicmotorError("spec", `无法加载 catalog: ${file}`);
        }
        const result = catalog_1.ServiceSchema.safeParse(raw);
        if (!result.success) {
            const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
            throw new errors_1.SaicmotorError("spec", `catalog 校验失败 (${file}): ${detail}`);
        }
        services.push(result.data);
    }
    return services;
}
//# sourceMappingURL=catalog.js.map