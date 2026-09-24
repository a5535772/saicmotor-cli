"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_CLIENT_SKILL_DIRS = void 0;
exports.registerSkill = registerSkill;
exports.unregisterSkill = unregisterSkill;
exports.registerPluginSkills = registerPluginSkills;
exports.unregisterPluginSkills = unregisterPluginSkills;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const node_os_1 = __importDefault(require("node:os"));
const suite_1 = require("./suite");
const pkg_root_1 = require("../pkg-root");
/** AI 客户端 skills 目录列表（集中常量化） */
exports.AI_CLIENT_SKILL_DIRS = {
    claude: node_path_1.default.join(node_os_1.default.homedir(), ".claude", "skills"),
    agents: node_path_1.default.join(node_os_1.default.homedir(), ".agents", "skills"),
    codebuddy: node_path_1.default.join(node_os_1.default.homedir(), ".codebuddy", "skills"),
};
/**
 * 为单个 skill 目录在各 AI 客户端目录建立 junction（Windows）或符号链接（Unix）。
 * 失败时降级为复制整个 skill 目录。
 */
function registerSkill(skillDir, skillName) {
    const results = [];
    for (const [client, clientSkillsDir] of Object.entries(exports.AI_CLIENT_SKILL_DIRS)) {
        const target = node_path_1.default.join(clientSkillsDir, skillName);
        // 已存在：检查归属
        if (node_fs_1.default.existsSync(target)) {
            results.push({ skillName, client, method: "skipped", reason: "目标已存在" });
            continue;
        }
        // 优先 junction（Windows 上无管理员需求）
        try {
            node_fs_1.default.symlinkSync(skillDir, target, "junction");
            results.push({ skillName, client, method: "junction" });
        }
        catch {
            // 降级为复制
            try {
                copyDirSync(skillDir, target);
                results.push({ skillName, client, method: "copy" });
            }
            catch (e) {
                results.push({ skillName, client, method: "skipped", reason: `复制失败: ${e.message}` });
            }
        }
    }
    return results;
}
/**
 * 注销单个 skill 条目（删除各 AI 客户端目录下的 junction/目录）。
 * 不触碰其他 skill。
 */
function unregisterSkill(skillName) {
    for (const clientSkillsDir of Object.values(exports.AI_CLIENT_SKILL_DIRS)) {
        const target = node_path_1.default.join(clientSkillsDir, skillName);
        if (!node_fs_1.default.existsSync(target))
            continue;
        try {
            const stat = node_fs_1.default.lstatSync(target);
            if (stat.isSymbolicLink() || stat.isDirectory()) {
                node_fs_1.default.rmSync(target, { recursive: true, force: true });
            }
        }
        catch {
            // 删除失败不阻断卸载流程
        }
    }
}
/**
 * 注册插件的全部 skills。
 * 返回每个 skill 在每个客户端的注册结果。
 */
function registerPluginSkills(pkgRoot, skillDirs) {
    const allResults = {};
    for (const skillRel of skillDirs) {
        const skillDir = node_path_1.default.join(pkgRoot, skillRel);
        if (!node_fs_1.default.existsSync(skillDir))
            continue;
        // skill 名取目录最后一段（如 skills/saicmotor-user → saicmotor-user）
        const skillName = node_path_1.default.basename(skillRel);
        const skillMdPath = node_path_1.default.join(skillDir, "SKILL.md");
        if (!node_fs_1.default.existsSync(skillMdPath))
            continue;
        allResults[skillName] = registerSkill(skillDir, skillName);
    }
    // 刷新 suite（基于所有已装插件的 routes 动态生成）
    try {
        const routes = (0, suite_1.buildSuiteRoutes)();
        const suiteMd = (0, suite_1.generateSuiteSkill)(routes);
        const suiteDir = node_path_1.default.join((0, pkg_root_1.findPackageRoot)(), "skills", "saicmotor-suite");
        if (!node_fs_1.default.existsSync(suiteDir))
            node_fs_1.default.mkdirSync(suiteDir, { recursive: true });
        node_fs_1.default.writeFileSync(node_path_1.default.join(suiteDir, "SKILL.md"), suiteMd, "utf8");
        // 同时注册到 AI 客户端
        registerSkill(suiteDir, "saicmotor-suite");
    }
    catch (e) {
        // suite 生成失败不阻断 skills 注册
        console.error(`[saicmotor] suite 路由刷新失败: ${e.message}`);
    }
    return allResults;
}
/**
 * 注销插件的全部 skills。
 */
function unregisterPluginSkills(skillDirs) {
    for (const skillRel of skillDirs) {
        const skillName = node_path_1.default.basename(skillRel);
        unregisterSkill(skillName);
    }
}
/** 递归复制目录（同步版，用于降级） */
function copyDirSync(src, dest) {
    node_fs_1.default.mkdirSync(dest, { recursive: true });
    for (const entry of node_fs_1.default.readdirSync(src, { withFileTypes: true })) {
        const srcPath = node_path_1.default.join(src, entry.name);
        const destPath = node_path_1.default.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        }
        else {
            node_fs_1.default.copyFileSync(srcPath, destPath);
        }
    }
}
//# sourceMappingURL=registrar.js.map