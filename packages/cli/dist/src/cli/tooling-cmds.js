"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerToolingCommands = registerToolingCommands;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const sdk_1 = require("@saicmotor/sdk");
const paths_1 = require("../plugin/paths");
const state_1 = require("../plugin/state");
/** create plugin <name>——生成标准插件工程骨架 */
function createPlugin(name) {
    const cwd = process.cwd();
    const pkgName = `@saicmotor/plugin-${name}`;
    const dir = node_path_1.default.join(cwd, `plugin-${name}`);
    if (node_fs_1.default.existsSync(dir)) {
        console.error(`✗ 目录已存在: ${dir}`);
        process.exit(1);
    }
    node_fs_1.default.mkdirSync(dir, { recursive: true });
    // package.json
    const pkg = {
        name: pkgName,
        version: "0.1.0",
        description: `saicmotor ${name} 插件`,
        type: "commonjs",
        files: ["dist/**/*.js", "skills/**/*.md", "catalog/**/*.json", "saicmotor.plugin.json"],
        scripts: {
            build: "tsc -p tsconfig.json",
            test: "vitest run",
            prepublishOnly: "npm run build && npm test",
        },
        dependencies: { zod: "^3.23.8" },
        devDependencies: {
            "@saicmotor/sdk": "*",
            "@types/node": "^20.14.0",
            typescript: "^5.5.0",
            vitest: "^2.0.0",
        },
    };
    node_fs_1.default.writeFileSync(node_path_1.default.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    // tsconfig.json
    node_fs_1.default.writeFileSync(node_path_1.default.join(dir, "tsconfig.json"), JSON.stringify({
        compilerOptions: {
            target: "ES2022",
            module: "commonjs",
            outDir: "dist",
            rootDir: ".",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
            resolveJsonModule: true,
            declaration: true,
        },
        include: ["src/**/*.ts"],
        exclude: ["node_modules", "dist", "test"],
    }, null, 2) + "\n");
    // saicmotor.plugin.json
    node_fs_1.default.writeFileSync(node_path_1.default.join(dir, "saicmotor.plugin.json"), JSON.stringify({
        name: pkgName,
        engine: "^0.8.0",
        catalog: ["catalog/services/*.json"],
        skills: [`skills/saicmotor-${name}`],
        scripts: "scripts",
    }, null, 2) + "\n");
    // catalog/services/<name>.json
    const catDir = node_path_1.default.join(dir, "catalog", "services");
    node_fs_1.default.mkdirSync(catDir, { recursive: true });
    node_fs_1.default.writeFileSync(node_path_1.default.join(catDir, `${name}.json`), JSON.stringify({
        name: name,
        title: `${name} 服务`,
        servicePath: `/api/${name}`,
        resources: {},
    }, null, 2) + "\n");
    // skills/saicmotor-<name>/SKILL.md
    const skillDir = node_path_1.default.join(dir, "skills", `saicmotor-${name}`);
    node_fs_1.default.mkdirSync(skillDir, { recursive: true });
    node_fs_1.default.writeFileSync(node_path_1.default.join(skillDir, "SKILL.md"), [
        "---",
        `name: saicmotor-${name}`,
        `description: ${name} 业务能力`,
        "---",
        "",
        `# saicmotor-${name}`,
        "",
        `管理 ${name} 相关操作。`,
        "",
        "## 命令",
        "",
        `saicmotor ${name} <resource> <method> [--<param> <value> ...]`,
        "",
        "## 示例",
        "",
        "```bash",
        `saicmotor ${name} list items`,
        "```",
    ].join("\n") + "\n");
    // scripts/ 目录（带说明）
    const scriptsDir = node_path_1.default.join(dir, "scripts");
    node_fs_1.default.mkdirSync(scriptsDir, { recursive: true });
    node_fs_1.default.writeFileSync(node_path_1.default.join(scriptsDir, "README.md"), "只在纯声明式 catalog 无法满足时才在此目录写脚本。\n详见 https://内部文档地址/plugin-scripts\n");
    console.log(`✓ 插件工程已生成: ${dir}`);
    console.log(`  cd plugin-${name}`);
    console.log(`  npm install`);
    console.log(`  编辑 catalog/services/${name}.json 声明服务`);
    console.log(`  npx @saicmotor/cli@latest dev  # 本地联调`);
}
/** validate .——校验当前目录的插件 manifest + catalog */
function validatePlugin(dir) {
    const manifestPath = node_path_1.default.join(dir, "saicmotor.plugin.json");
    if (!node_fs_1.default.existsSync(manifestPath)) {
        console.error(`✗ 未找到 saicmotor.plugin.json: ${dir}`);
        return false;
    }
    let manifest;
    try {
        manifest = JSON.parse(node_fs_1.default.readFileSync(manifestPath, "utf8"));
    }
    catch {
        console.error(`✗ manifest JSON 解析失败: ${manifestPath}`);
        return false;
    }
    try {
        sdk_1.PluginManifestSchema.parse(manifest);
        console.log("✓ manifest 校验通过");
    }
    catch (e) {
        console.error(`✗ manifest 校验失败: ${e.message}`);
        return false;
    }
    // TODO: 后续迭代添加 catalog zod 校验
    console.log("✓ 插件校验通过");
    return true;
}
/** dev——将当前目录 link 到 ~/.saicmotor/plugins/linked/ */
function devPlugin(dir, stop) {
    const manifestPath = node_path_1.default.join(dir, "saicmotor.plugin.json");
    if (!node_fs_1.default.existsSync(manifestPath)) {
        console.error(`✗ 未找到 saicmotor.plugin.json，请在插件工程根目录运行`);
        process.exit(1);
    }
    const manifest = JSON.parse(node_fs_1.default.readFileSync(manifestPath, "utf8"));
    const name = manifest.name;
    const shortName = name.replace("@saicmotor/", ""); // plugin-user
    const target = node_path_1.default.join((0, paths_1.linkedPluginsDir)(), shortName);
    if (stop) {
        if (node_fs_1.default.existsSync(target)) {
            node_fs_1.default.rmSync(target, { recursive: true, force: true });
            const state = (0, state_1.loadState)();
            delete state.plugins[name];
            (0, state_1.saveState)(state);
            console.log(`✓ dev link 已解除: ${target}`);
        }
        else {
            console.log(`（无活跃 dev link）`);
        }
        return;
    }
    // 建立 junction
    if (!node_fs_1.default.existsSync((0, paths_1.linkedPluginsDir)())) {
        node_fs_1.default.mkdirSync((0, paths_1.linkedPluginsDir)(), { recursive: true });
    }
    if (node_fs_1.default.existsSync(target)) {
        node_fs_1.default.rmSync(target, { recursive: true, force: true });
    }
    node_fs_1.default.symlinkSync(node_path_1.default.resolve(dir), target, "junction");
    // 写 state
    const state = (0, state_1.loadState)();
    state.plugins[name] = {
        name,
        version: "dev",
        enabled: true,
        source: "linked",
        linkedPath: node_path_1.default.resolve(dir),
        skills: manifest.skills ?? [],
    };
    (0, state_1.saveState)(state);
    console.log(`✓ dev link 已建立: ${target} → ${node_path_1.default.resolve(dir)}`);
    console.log(`  全局/npx CLI 已加载该插件`);
    console.log(`  解除: saicmotor dev --stop`);
}
function registerToolingCommands(program) {
    // create plugin <name>
    const createCmd = program.command("create");
    createCmd
        .command("plugin <name>")
        .description("生成标准插件工程骨架")
        .action((name) => createPlugin(name));
    // validate <dir>
    program
        .command("validate <dir>")
        .description("校验插件 manifest 与 catalog")
        .action((dir) => {
        const ok = validatePlugin(dir);
        if (!ok)
            process.exit(1);
    });
    // dev
    program
        .command("dev")
        .description("将当前目录 link 为开发插件")
        .option("--stop", "解除 dev link")
        .action((opts) => {
        devPlugin(process.cwd(), !!opts.stop);
    });
}
//# sourceMappingURL=tooling-cmds.js.map