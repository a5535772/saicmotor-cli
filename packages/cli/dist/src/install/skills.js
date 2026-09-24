"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.skillsAlreadyInstalled = skillsAlreadyInstalled;
exports.installSkills = installSkills;
exports.runPostinstall = runPostinstall;
// src/install/skills.ts
// skills 注册逻辑（postinstall 与 `saicmotor install` 共用）
// S8：收回核心"注册器"，不再依赖外部 skills CLI / GitHub repo
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const pkg_root_1 = require("../pkg-root");
const registrar_1 = require("../plugin/registrar");
const PACKAGE_SKILLS_DIR = node_path_1.default.join((0, pkg_root_1.findPackageRoot)(), "skills");
/** 列出核心包内置的所有 skill 目录 */
function listCoreSkills() {
    const skillsRoot = PACKAGE_SKILLS_DIR;
    if (!node_fs_1.default.existsSync(skillsRoot))
        return [];
    return node_fs_1.default
        .readdirSync(skillsRoot, { withFileTypes: true })
        .filter((d) => d.isDirectory() && node_fs_1.default.existsSync(node_path_1.default.join(skillsRoot, d.name, "SKILL.md")))
        .map((d) => d.name);
}
/** 确保各 AI 客户端 skills 目录存在 */
function ensureClientDirs() {
    for (const dir of Object.values(registrar_1.AI_CLIENT_SKILL_DIRS)) {
        if (!node_fs_1.default.existsSync(dir))
            node_fs_1.default.mkdirSync(dir, { recursive: true });
    }
}
/** 检查任意客户端是否已有本包的 skill 条目 */
function skillsAlreadyInstalled() {
    const coreSkills = listCoreSkills();
    for (const [client, clientSkillsDir] of Object.entries(registrar_1.AI_CLIENT_SKILL_DIRS)) {
        for (const skillName of coreSkills) {
            if (node_fs_1.default.existsSync(node_path_1.default.join(clientSkillsDir, skillName)))
                return true;
        }
    }
    return false;
}
/** 注册核心包内置的全部 skills */
function installSkills({ force = false } = {}) {
    ensureClientDirs();
    const coreSkills = listCoreSkills();
    if (coreSkills.length === 0) {
        console.log("未找到内置 skills");
        return;
    }
    if (!force && skillsAlreadyInstalled()) {
        console.log("AI skills 已安装，跳过");
        return;
    }
    let registered = 0;
    for (const skillName of coreSkills) {
        const skillDir = node_path_1.default.join(PACKAGE_SKILLS_DIR, skillName);
        const results = (0, registrar_1.registerSkill)(skillDir, skillName);
        const okCount = results.filter((r) => r.method !== "skipped" || r.reason === "目标已存在").length;
        if (okCount > 0)
            registered++;
    }
    if (registered > 0) {
        console.log(`✓ ${registered} 个 AI skills 已注册`);
    }
    else {
        console.log("⚠ AI skills 注册失败，稍后可手动运行: saicmotor install");
    }
}
/** npm lifecycle postinstall 入口 */
function runPostinstall() {
    if (process.env.npm_command === "exec") {
        console.log("npx 模式，跳过 skills 自动注册");
        return;
    }
    console.log("\nsaicmotor CLI 安装完成。");
    installSkills();
    console.log("  首次使用前请运行: saicmotor auth login");
    console.log("  探索命令: saicmotor --help\n");
}
//# sourceMappingURL=skills.js.map