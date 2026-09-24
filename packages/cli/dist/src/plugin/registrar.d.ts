/** AI 客户端 skills 目录列表（集中常量化） */
export declare const AI_CLIENT_SKILL_DIRS: Record<string, string>;
export interface SkillRegResult {
    skillName: string;
    client: string;
    method: "junction" | "copy" | "skipped";
    reason?: string;
}
/**
 * 为单个 skill 目录在各 AI 客户端目录建立 junction（Windows）或符号链接（Unix）。
 * 失败时降级为复制整个 skill 目录。
 */
export declare function registerSkill(skillDir: string, skillName: string): SkillRegResult[];
/**
 * 注销单个 skill 条目（删除各 AI 客户端目录下的 junction/目录）。
 * 不触碰其他 skill。
 */
export declare function unregisterSkill(skillName: string): void;
/**
 * 注册插件的全部 skills。
 * 返回每个 skill 在每个客户端的注册结果。
 */
export declare function registerPluginSkills(pkgRoot: string, skillDirs: string[]): Record<string, SkillRegResult[]>;
/**
 * 注销插件的全部 skills。
 */
export declare function unregisterPluginSkills(skillDirs: string[]): void;
