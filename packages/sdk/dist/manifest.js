"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginManifestSchema = void 0;
exports.validateManifest = validateManifest;
exports.definePlugin = definePlugin;
const zod_1 = require("zod");
/** saicmotor.plugin.json 的完整 schema */
exports.PluginManifestSchema = zod_1.z.object({
    /** 插件包名，必须与 package.json name 一致 */
    name: zod_1.z.string().min(1),
    /** semver 范围，声明兼容的核心版本（如 "^1.0.0"） */
    engine: zod_1.z.string().min(1),
    /** catalog 文件 glob 列表 */
    catalog: zod_1.z.array(zod_1.z.string()).optional(),
    /** skill 目录列表，每项对应一个 skills/<name>/SKILL.md */
    skills: zod_1.z.array(zod_1.z.string()).optional(),
    /** scripts 根目录 */
    scripts: zod_1.z.string().optional(),
    /** 可选：suite 意图路由 */
    routes: zod_1.z
        .record(zod_1.z.string(), zod_1.z.string())
        .optional(),
});
/** 校验 manifest 对象，返回 parsed 或 zod error */
function validateManifest(raw) {
    return exports.PluginManifestSchema.parse(raw);
}
/** 类型安全的 manifest 构造助手 */
function definePlugin(m) {
    return exports.PluginManifestSchema.parse(m);
}
