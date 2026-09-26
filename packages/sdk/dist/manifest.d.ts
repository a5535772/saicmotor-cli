import { z } from "zod";
/** saicmotor.plugin.json 的完整 schema */
export declare const PluginManifestSchema: z.ZodObject<{
    /** 插件包名，必须与 package.json name 一致 */
    name: z.ZodString;
    /** semver 范围，声明兼容的核心版本（如 "^1.0.0"） */
    engine: z.ZodString;
    /** catalog 文件 glob 列表 */
    catalog: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** skill 目录列表，每项对应一个 skills/<name>/SKILL.md */
    skills: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    /** scripts 根目录 */
    scripts: z.ZodOptional<z.ZodString>;
    /** 可选：suite 意图路由 */
    routes: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    engine: string;
    catalog?: string[] | undefined;
    skills?: string[] | undefined;
    scripts?: string | undefined;
    routes?: Record<string, string> | undefined;
}, {
    name: string;
    engine: string;
    catalog?: string[] | undefined;
    skills?: string[] | undefined;
    scripts?: string | undefined;
    routes?: Record<string, string> | undefined;
}>;
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
/** 校验 manifest 对象，返回 parsed 或 zod error */
export declare function validateManifest(raw: unknown): PluginManifest;
/** 类型安全的 manifest 构造助手 */
export declare function definePlugin(m: PluginManifest): PluginManifest;
