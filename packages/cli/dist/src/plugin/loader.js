"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPlugins = loadPlugins;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const semver_1 = __importDefault(require("semver"));
const sdk_1 = require("@saicmotor/sdk");
const catalog_1 = require("../schema/catalog");
const paths_1 = require("./paths");
const state_1 = require("./state");
/**
 * 扫描目录下的插件候选。
 * - linked/ 下插件直接以 plugin-* 目录存在
 * - node_modules/ 下需要进入 @saicmotor/ 找到 plugin-*
 * 返回 [pkgRoot, pkgRoot] 以便统一迭代。
 */
function scanEntries(root) {
    const result = [];
    let entries;
    try {
        entries = node_fs_1.default.readdirSync(root, { withFileTypes: true });
    }
    catch {
        return result;
    }
    for (const e of entries) {
        if (!e.isDirectory())
            continue;
        if (e.name.startsWith("plugin-")) {
            // linked/ 直接即是插件目录
            result.push([e.name, node_path_1.default.join(root, e.name)]);
        }
        else if (e.name.startsWith("@")) {
            // npm 安装的 scoped 目录，进入找 plugin-*
            const scopeDir = node_path_1.default.join(root, e.name);
            let scopeEntries;
            try {
                scopeEntries = node_fs_1.default.readdirSync(scopeDir, { withFileTypes: true });
            }
            catch {
                continue;
            }
            for (const se of scopeEntries) {
                if (se.isDirectory() && se.name.startsWith("plugin-")) {
                    result.push([se.name, node_path_1.default.join(scopeDir, se.name)]);
                }
            }
        }
    }
    return result;
}
const CORE_VERSION = "0.8.0";
/**
 * 双根扫描并加载所有兼容插件。
 * 不做全局副作用（不写 state，不注册 skills）。
 */
function loadPlugins(_config) {
    const warnings = [];
    const loaded = [];
    const state = (0, state_1.loadState)();
    // 双根：linked/ 优先（dev 时覆盖已装版本）
    for (const root of [(0, paths_1.linkedPluginsDir)(), (0, paths_1.installedPluginsDir)()]) {
        if (!node_fs_1.default.existsSync(root))
            continue;
        const scopes = scanEntries(root);
        for (const [pkgName, pkgRoot] of scopes) {
            // linked/ 里插件名即为目录名；installed 里在 @saicmotor/ 下
            const entryName = node_path_1.default.basename(pkgRoot);
            if (!entryName.startsWith("plugin-"))
                continue;
            const manifestPath = node_path_1.default.join(pkgRoot, "saicmotor.plugin.json");
            if (!node_fs_1.default.existsSync(manifestPath)) {
                warnings.push(`插件 ${entryName} 缺少 saicmotor.plugin.json，跳过`);
                continue;
            }
            let manifest;
            try {
                const raw = JSON.parse(node_fs_1.default.readFileSync(manifestPath, "utf8"));
                manifest = sdk_1.PluginManifestSchema.parse(raw);
            }
            catch (e) {
                warnings.push(`插件 ${entryName} manifest 解析失败: ${e.message}`);
                continue;
            }
            // 同名去重：linked/ 已加载同名插件则跳过 installed/
            if (loaded.some((p) => p.manifest.name === manifest.name)) {
                continue;
            }
            // engine 兼容检查
            if (!semver_1.default.satisfies(CORE_VERSION, manifest.engine)) {
                warnings.push(`插件 ${manifest.name} 与当前核心版本不兼容（需要 ${manifest.engine}，当前 ${CORE_VERSION}），已禁用`);
                continue;
            }
            // 冲突检测：同 service.name 拒绝后加载者
            const services = loadPluginServices(pkgRoot, manifest);
            for (const svc of services) {
                const existing = loaded.find((p) => p.services.some((s) => s.name === svc.name));
                if (existing) {
                    warnings.push(`service "${svc.name}" 冲突：${manifest.name} 与 ${existing.manifest.name} 均提供，请用 plugin disable 处理`);
                }
            }
            // 过滤掉冲突 service 后的 service 列表
            const conflictFree = services.filter((svc) => {
                const conflict = loaded.some((p) => p.services.some((s) => s.name === svc.name));
                if (conflict)
                    return false;
                return true;
            });
            const stateEntry = state.plugins[manifest.name] ?? {
                name: manifest.name,
                version: "unknown",
                enabled: true,
                source: root === (0, paths_1.linkedPluginsDir)() ? "linked" : "registry",
                skills: manifest.skills ?? [],
            };
            if (!stateEntry.enabled) {
                // disabled 插件不加载
                continue;
            }
            loaded.push({
                manifest,
                entry: stateEntry,
                rootDir: pkgRoot,
                services: conflictFree,
            });
        }
    }
    // 字母序确保可预测
    loaded.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));
    return { plugins: loaded, warnings };
}
function loadPluginServices(pkgRoot, manifest) {
    const services = [];
    const catalogGlobs = manifest.catalog ?? ["catalog/services/*.json"];
    for (const glob of catalogGlobs) {
        // 简化实现：只支持 catalog/services/ 下的 *.json
        if (!glob.includes("services"))
            continue;
        const servicesDir = node_path_1.default.join(pkgRoot, "catalog", "services");
        if (!node_fs_1.default.existsSync(servicesDir))
            continue;
        let files;
        try {
            files = node_fs_1.default.readdirSync(servicesDir).filter((f) => f.endsWith(".json"));
        }
        catch {
            continue;
        }
        for (const file of files) {
            try {
                const raw = JSON.parse(node_fs_1.default.readFileSync(node_path_1.default.join(servicesDir, file), "utf8"));
                const svc = catalog_1.ServiceSchema.parse(raw);
                services.push(svc);
            }
            catch (_e) {
                // 单文件坏不影响其他 service
                // 这个警告由调用方处理
            }
        }
    }
    return services;
}
//# sourceMappingURL=loader.js.map