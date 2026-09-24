"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.scriptFileFor = scriptFileFor;
exports.findScript = findScript;
exports.executeScript = executeScript;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const config_1 = require("../config");
const errors_1 = require("./errors");
const pkg_root_1 = require("../pkg-root");
const loader_1 = require("../plugin/loader");
function scriptFileFor(serviceName, resourceName, methodName) {
    return node_path_1.default.join((0, pkg_root_1.distRoot)(), "scripts", serviceName, resourceName, `${methodName}.js`);
}
function firstExisting(files) {
    for (const file of files) {
        if (node_fs_1.default.existsSync(file))
            return file;
    }
    return null;
}
/**
 * 脚本查找顺序：
 * 1. SAICMOTOR_SCRIPTS 显式覆盖（测试/定制）：<dir>/<svc>/<res>/<method>.{js,ts}
 * 2. 插件 scripts 目录：<plugin-root>/<scripts-dir>/<svc>/<res>/<method>.js
 * 3. 编译产物：dist/scripts/<svc>/<res>/<method>.js（安装形态）
 * 4. 源码树：scripts/<svc>/<res>/<method>.ts（本地 tsx 开发）
 */
function findScript(serviceName, resourceName, methodName) {
    const rel = node_path_1.default.join(serviceName, resourceName, methodName);
    if (process.env.SAICMOTOR_SCRIPTS) {
        const override = firstExisting([
            node_path_1.default.join(process.env.SAICMOTOR_SCRIPTS, `${rel}.js`),
            node_path_1.default.join(process.env.SAICMOTOR_SCRIPTS, `${rel}.ts`),
        ]);
        if (override)
            return override;
    }
    // 插件 scripts 目录（延迟加载，避免潜在的循环依赖）
    try {
        const { plugins } = (0, loader_1.loadPlugins)((0, config_1.loadConfig)());
        for (const plugin of plugins) {
            if (plugin.manifest.scripts) {
                const pluginScript = node_path_1.default.join(plugin.rootDir, plugin.manifest.scripts, `${rel}.js`);
                if (node_fs_1.default.existsSync(pluginScript))
                    return pluginScript;
            }
        }
    }
    catch {
        // 插件不可用时静默跳过
    }
    const compiled = node_path_1.default.join((0, pkg_root_1.distRoot)(), "scripts", `${rel}.js`);
    if (node_fs_1.default.existsSync(compiled))
        return compiled;
    const source = (0, pkg_root_1.packageFile)(node_path_1.default.join("scripts", `${rel}.ts`));
    return node_fs_1.default.existsSync(source) ? source : null;
}
async function executeScript(file, ctx) {
    const mod = await Promise.resolve(`${file}`).then(s => __importStar(require(s)));
    const fn = mod.default ?? mod;
    if (typeof fn !== "function") {
        throw new errors_1.SaicmotorError("spec", `脚本未默认导出函数: ${file}`);
    }
    return fn(ctx);
}
//# sourceMappingURL=script.js.map