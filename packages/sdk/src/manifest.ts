import { z } from "zod";

/** saicmotor.plugin.json 的完整 schema */
export const PluginManifestSchema = z.object({
  /** 插件包名，必须与 package.json name 一致 */
  name: z.string().min(1),
  /** semver 范围，声明兼容的核心版本（如 "^1.0.0"） */
  engine: z.string().min(1),
  /** catalog 文件 glob 列表 */
  catalog: z.array(z.string()).optional(),
  /** skill 目录列表，每项对应一个 skills/<name>/SKILL.md */
  skills: z.array(z.string()).optional(),
  /** scripts 根目录 */
  scripts: z.string().optional(),
  /** 可选：suite 意图路由 */
  routes: z
    .record(z.string(), z.string())
    .optional(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** 校验 manifest 对象，返回 parsed 或 zod error */
export function validateManifest(raw: unknown): PluginManifest {
  return PluginManifestSchema.parse(raw);
}

/** 类型安全的 manifest 构造助手 */
export function definePlugin(m: PluginManifest): PluginManifest {
  return PluginManifestSchema.parse(m);
}