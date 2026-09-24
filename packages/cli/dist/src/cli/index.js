#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const config_1 = require("../config");
const catalog_1 = require("../engine/catalog");
const loader_1 = require("../plugin/loader");
const run_1 = require("../engine/run");
const output_1 = require("../engine/output");
const auth_1 = require("./auth");
const plugin_cmds_1 = require("./plugin-cmds");
const tooling_cmds_1 = require("./tooling-cmds");
const error_1 = require("./error");
const skills_1 = require("../install/skills");
const program = new commander_1.Command();
program.name("saicmotor").description("面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行").version("0.4.0");
const config = (0, config_1.loadConfig)();
// 加载核心 catalog + 插件 catalog
const coreServices = (0, catalog_1.loadCatalog)();
const { plugins, warnings } = (0, loader_1.loadPlugins)(config);
const pluginServices = plugins.flatMap((p) => p.services);
const allServices = [...coreServices, ...pluginServices];
// 打印非致命警告
for (const w of warnings) {
    console.error(`[saicmotor] ${w}`);
}
// 动态注册命令（核心 + 全部插件）
for (const service of allServices) {
    const svc = program.command(service.name).description(service.title ?? service.name);
    for (const [resourceName, resource] of Object.entries(service.resources)) {
        const resCmd = svc.command(resourceName);
        for (const [methodName, method] of Object.entries(resource.methods)) {
            const isWrite = method.httpMethod !== "GET";
            const leaf = resCmd.command(methodName).description(method.description ?? "");
            leaf.option("--format <f>", "输出格式 json|table|pretty", "json");
            leaf.option("--dry-run", "只预览请求不发送");
            if (isWrite)
                leaf.option("--yes", "跳过写操作确认");
            for (const [fieldName, field] of Object.entries(method.requestBody ?? {})) {
                leaf.option(`--${(0, config_1.toKebab)(fieldName)} <value>`, field.description ?? fieldName);
            }
            leaf.action(async (opts) => {
                try {
                    if (isWrite && !opts.dryRun && !opts.yes) {
                        console.error("该命令有副作用，加 --yes 确认，或加 --dry-run 预览");
                        process.exit(1);
                    }
                    const raw = {};
                    for (const fieldName of Object.keys(method.requestBody ?? {})) {
                        raw[fieldName] = opts[(0, config_1.toCamel)((0, config_1.toKebab)(fieldName))];
                    }
                    const result = await (0, run_1.runMethod)(config, service, resourceName, methodName, method, raw, { dryRun: !!opts.dryRun });
                    const fmt = String(opts.format ?? "json");
                    if (fmt === "table")
                        console.log((0, output_1.formatTable)(result.data));
                    else if (fmt === "pretty")
                        console.log((0, output_1.formatJson)(result.data, true));
                    else
                        console.log((0, output_1.formatEnvelope)(true, result.data));
                }
                catch (e) {
                    (0, error_1.handleError)(e);
                }
            });
        }
    }
}
// install command: re-install AI skills to all installed AI tools
program
    .command("install")
    .description("安装/重装 AI skills 到所有已安装的 AI 工具")
    .option("--force", "强制重新安装（即使已安装）")
    .action((opts) => {
    (0, skills_1.installSkills)({ force: opts.force || false });
});
(0, plugin_cmds_1.registerPluginCommands)(program);
(0, tooling_cmds_1.registerToolingCommands)(program);
(0, auth_1.registerAuth)(program);
program.parseAsync(process.argv).catch(error_1.handleError);
//# sourceMappingURL=index.js.map