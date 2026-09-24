"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerPluginCommands = registerPluginCommands;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const state_1 = require("../plugin/state");
const paths_1 = require("../plugin/paths");
const loader_1 = require("../plugin/loader");
const config_1 = require("../config");
const registrar_1 = require("../plugin/registrar");
const suite_1 = require("../plugin/suite");
const pkg_root_1 = require("../pkg-root");
function jsonOut(data) {
    console.log(JSON.stringify({ ok: true, data }, null, 2));
}
function jsonErr(error) {
    console.error(JSON.stringify({ ok: false, error }, null, 2));
}
/**
 * 短名展开："reimbursement" → "@saicmotor/plugin-reimbursement"
 */
function fullName(input) {
    if (input.startsWith("@saicmotor/plugin-"))
        return input;
    if (input.startsWith("plugin-"))
        return `@saicmotor/${input}`;
    return `@saicmotor/plugin-${input}`;
}
/** 刷新 suite 文件并重新注册 */
function refreshSuite() {
    try {
        const routes = (0, suite_1.buildSuiteRoutes)();
        const md = (0, suite_1.generateSuiteSkill)(routes);
        const suiteDir = node_path_1.default.join((0, pkg_root_1.findPackageRoot)(), "skills", "saicmotor-suite");
        if (!node_fs_1.default.existsSync(suiteDir))
            node_fs_1.default.mkdirSync(suiteDir, { recursive: true });
        node_fs_1.default.writeFileSync(node_path_1.default.join(suiteDir, "SKILL.md"), md, "utf8");
        (0, registrar_1.registerSkill)(suiteDir, "saicmotor-suite");
    }
    catch (e) {
        console.error(`[saicmotor] suite 路由刷新失败: ${e.message}`);
    }
}
function registerPluginCommands(program) {
    const plugin = program
        .command("plugin")
        .description("插件管理（install / uninstall / list / enable / disable / upgrade）");
    // plugin install <pkg>
    plugin
        .command("install <pkg>")
        .description("安装插件（短名自动展开为 @saicmotor/plugin-<name>）")
        .option("--json", "JSON 输出")
        .action(async (pkg, opts) => {
        try {
            const name = fullName(pkg);
            const dir = (0, paths_1.installedPluginsDir)();
            if (!node_fs_1.default.existsSync(dir))
                node_fs_1.default.mkdirSync(dir, { recursive: true });
            console.error(`安装 ${name} ...`);
            (0, node_child_process_1.execSync)(`npm install ${name} --prefix "${dir}" --legacy-peer-deps --no-save`, {
                stdio: "inherit",
                cwd: dir,
            });
            // 读取 manifest 并注册 skills
            const pkgDir = node_path_1.default.join(dir, "node_modules", name.replace("@saicmotor/", ""));
            const manifestPath = node_path_1.default.join(pkgDir, "saicmotor.plugin.json");
            if (node_fs_1.default.existsSync(manifestPath)) {
                const manifest = JSON.parse(node_fs_1.default.readFileSync(manifestPath, "utf8"));
                const skillDirs = manifest.skills ?? [];
                // 注册 skills
                const skillResults = (0, registrar_1.registerPluginSkills)(pkgDir, skillDirs);
                // 更新 state
                const state = (0, state_1.loadState)();
                const pkgJson = JSON.parse(node_fs_1.default.readFileSync(node_path_1.default.join(pkgDir, "package.json"), "utf8"));
                state.plugins[name] = {
                    name,
                    version: pkgJson.version ?? "unknown",
                    enabled: true,
                    source: "registry",
                    skills: skillDirs,
                    routes: manifest.routes,
                };
                (0, state_1.saveState)(state);
                // 刷新 suite
                refreshSuite();
                if (opts.json) {
                    jsonOut({ installed: name, version: pkgJson.version, skills: Object.keys(skillResults) });
                }
                else {
                    console.log(`✓ ${name} 安装完成，${Object.keys(skillResults).length} 个 skills 已注册`);
                }
            }
            else {
                if (opts.json)
                    jsonErr(`manifest 缺失: ${manifestPath}`);
                else
                    console.error(`✗ manifest 缺失: ${manifestPath}`);
            }
        }
        catch (e) {
            if (opts.json)
                jsonErr(e.message);
            else
                console.error(`✗ 安装失败: ${e.message}`);
        }
    });
    // plugin uninstall <name>
    plugin
        .command("uninstall <name>")
        .description("卸载插件")
        .option("--json", "JSON 输出")
        .action((name, opts) => {
        try {
            const full = fullName(name);
            const state = (0, state_1.loadState)();
            const entry = state.plugins[full];
            if (!entry) {
                if (opts.json)
                    jsonErr(`未找到插件: ${full}`);
                else
                    console.error(`✗ 未找到插件: ${full}`);
                return;
            }
            // 注销 skills
            (0, registrar_1.unregisterPluginSkills)(entry.skills ?? []);
            // npm 卸载
            try {
                (0, node_child_process_1.execSync)(`npm uninstall ${full} --prefix "${(0, paths_1.installedPluginsDir)()}"`, { stdio: "pipe" });
            }
            catch {
                // npm 卸载失败不阻断后续清理
            }
            // 清理 state
            delete state.plugins[full];
            (0, state_1.saveState)(state);
            // 刷新 suite
            refreshSuite();
            if (opts.json)
                jsonOut({ uninstalled: full });
            else
                console.log(`✓ ${full} 已卸载`);
        }
        catch (e) {
            if (opts.json)
                jsonErr(e.message);
            else
                console.error(`✗ 卸载失败: ${e.message}`);
        }
    });
    // plugin list
    plugin
        .command("list")
        .description("列出已安装插件")
        .option("--json", "JSON 输出")
        .action((opts) => {
        const { plugins, warnings } = (0, loader_1.loadPlugins)((0, config_1.loadConfig)());
        const list = plugins.map((p) => ({
            name: p.manifest.name,
            version: p.entry.version,
            enabled: p.entry.enabled,
            source: p.entry.source,
            linkedPath: p.entry.linkedPath,
            skills: p.manifest.skills ?? [],
            compatible: true,
        }));
        if (opts.json) {
            jsonOut({ plugins: list, warnings: warnings.length > 0 ? warnings : undefined });
        }
        else {
            if (list.length === 0) {
                console.log("（无已安装插件）");
            }
            else {
                for (const p of list) {
                    const src = p.source === "linked" ? `linked → ${p.linkedPath}` : "registry";
                    console.log(`  ${p.name}@${p.version}  ${src}  ${p.enabled ? "✓" : "✗"}`);
                }
            }
            for (const w of warnings) {
                console.error(`  ⚠ ${w}`);
            }
        }
    });
    // plugin enable / disable
    for (const action of ["enable", "disable"]) {
        plugin
            .command(`${action} <name>`)
            .description(`${action === "enable" ? "启用" : "禁用"}插件`)
            .option("--json", "JSON 输出")
            .action((name, opts) => {
            const full = fullName(name);
            const state = (0, state_1.loadState)();
            if (!state.plugins[full]) {
                if (opts.json)
                    jsonErr(`未找到插件: ${full}`);
                else
                    console.error(`✗ 未找到插件: ${full}`);
                return;
            }
            state.plugins[full].enabled = action === "enable";
            (0, state_1.saveState)(state);
            if (opts.json)
                jsonOut({ name: full, enabled: action === "enable" });
            else
                console.log(`✓ ${full} ${action === "enable" ? "已启用" : "已禁用"}`);
        });
    }
    // plugin upgrade <name>
    plugin
        .command("upgrade <name>")
        .description("升级插件到 latest")
        .option("--json", "JSON 输出")
        .action((name, opts) => {
        try {
            const full = fullName(name);
            const dir = (0, paths_1.installedPluginsDir)();
            (0, node_child_process_1.execSync)(`npm update ${full} --prefix "${dir}" --legacy-peer-deps`, { stdio: "inherit" });
            if (opts.json)
                jsonOut({ upgraded: full });
            else
                console.log(`✓ ${full} 已升级`);
        }
        catch (e) {
            if (opts.json)
                jsonErr(e.message);
            else
                console.error(`✗ 升级失败: ${e.message}`);
        }
    });
}
//# sourceMappingURL=plugin-cmds.js.map