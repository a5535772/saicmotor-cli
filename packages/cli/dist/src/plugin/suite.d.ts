import { type LoadedPlugin } from "./loader";
/** 聚合所有已启用插件的 routes 为 suite 路由表 */
export declare function buildSuiteRoutes(plugins?: LoadedPlugin[]): Record<string, string>;
/** 生成 suite SKILL.md 的 markdown 路由表段落 */
export declare function generateSuiteSkill(routes: Record<string, string>): string;
