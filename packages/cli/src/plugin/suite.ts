import { loadPlugins, type LoadedPlugin } from "./loader";
import { loadConfig } from "../config";

/** 聚合所有已启用插件的 routes 为 suite 路由表 */
export function buildSuiteRoutes(plugins?: LoadedPlugin[]): Record<string, string> {
  const list = plugins ?? loadPlugins(loadConfig()).plugins;
  const routes: Record<string, string> = {};

  for (const plugin of list) {
    if (plugin.manifest.routes) {
      Object.assign(routes, plugin.manifest.routes);
    }
  }

  return routes;
}

/** 生成 suite SKILL.md 的 markdown 路由表段落 */
export function generateSuiteSkill(routes: Record<string, string>): string {
  const routeTable = Object.entries(routes)
    .map(([intent, skill]) => `| ${intent} | ${skill} |`)
    .join("\n");

  return [
    "---",
    "name: saicmotor-suite",
    "version: 1.0.0",
    'description: "saicmotor 统一入口 skill——AI Agent 通过此 skill 发现并路由到具体业务能力"',
    "metadata:",
    "  requires:",
    '    bins: ["saicmotor"]',
    "---",
    "",
    "# saicmotor-suite",
    "",
    "saicmotor 统一入口 skill。以下为当前已装插件提供的意图路由：",
    "",
    "| 意图 | 入口 Skill |",
    "|------|------------|",
    routeTable,
    "",
    "> 此文件由 saicmotor 注册器自动生成，请勿手动编辑。",
  ].join("\n");
}