#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const config_1 = require("../config");
const catalog_1 = require("../engine/catalog");
const run_1 = require("../engine/run");
const output_1 = require("../engine/output");
const auth_1 = require("./auth");
const error_1 = require("./error");
const program = new commander_1.Command();
program.name("saicmotor").description("面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行").version("0.3.0");
const config = (0, config_1.loadConfig)();
const services = (0, catalog_1.loadCatalog)();
for (const service of services) {
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
    const { installSkills } = require("../../scripts/postinstall.js");
    installSkills({ force: opts.force || false });
});
(0, auth_1.registerAuth)(program);
program.parseAsync(process.argv).catch(error_1.handleError);
//# sourceMappingURL=index.js.map