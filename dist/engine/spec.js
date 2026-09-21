"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSkill = loadSkill;
const node_fs_1 = __importDefault(require("node:fs"));
const skill_1 = require("../schema/skill");
const errors_1 = require("./errors");
const config_1 = require("./config");
function loadSkill(system) {
    const file = (0, config_1.skillPath)(system);
    let raw;
    try {
        raw = JSON.parse(node_fs_1.default.readFileSync(file, "utf8"));
    }
    catch {
        throw new errors_1.SaicmotorError("spec", `无法加载 skill.json: ${file}`);
    }
    const result = skill_1.SkillSchema.safeParse(raw);
    if (!result.success) {
        const detail = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        throw new errors_1.SaicmotorError("spec", `skill.json 校验失败 (${file}): ${detail}`);
    }
    return result.data;
}
//# sourceMappingURL=spec.js.map