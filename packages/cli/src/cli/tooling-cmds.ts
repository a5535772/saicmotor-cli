import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { PluginManifestSchema } from "@saicmotor/sdk";
import { linkedPluginsDir } from "../plugin/paths";
import { loadState, saveState } from "../plugin/state";

/** create plugin <name>——生成标准插件工程骨架 */
function createPlugin(name: string): void {
  const cwd = process.cwd();
  const pkgName = `@saicmotor/plugin-${name}`;
  const dir = path.join(cwd, `plugin-${name}`);

  if (fs.existsSync(dir)) {
    console.error(`✗ 目录已存在: ${dir}`);
    process.exit(1);
  }

  fs.mkdirSync(dir, { recursive: true });

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
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2) + "\n");

  // tsconfig.json
  fs.writeFileSync(
    path.join(dir, "tsconfig.json"),
    JSON.stringify(
      {
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
      },
      null,
      2,
    ) + "\n",
  );

  // saicmotor.plugin.json
  fs.writeFileSync(
    path.join(dir, "saicmotor.plugin.json"),
    JSON.stringify(
      {
        name: pkgName,
        engine: "^0.8.0",
        catalog: ["catalog/services/*.json"],
        skills: [`skills/saicmotor-${name}`],
        scripts: "scripts",
      },
      null,
      2,
    ) + "\n",
  );

  // catalog/services/<name>.json
  const catDir = path.join(dir, "catalog", "services");
  fs.mkdirSync(catDir, { recursive: true });
  fs.writeFileSync(
    path.join(catDir, `${name}.json`),
    JSON.stringify(
      {
        name: name,
        title: `${name} 服务`,
        servicePath: `/api/${name}`,
        resources: {},
      },
      null,
      2,
    ) + "\n",
  );

  // skills/saicmotor-<name>/SKILL.md
  const skillDir = path.join(dir, "skills", `saicmotor-${name}`);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, "SKILL.md"),
    [
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
    ].join("\n") + "\n",
  );

  // scripts/ 目录（带说明）
  const scriptsDir = path.join(dir, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(
    path.join(scriptsDir, "README.md"),
    "只在纯声明式 catalog 无法满足时才在此目录写脚本。\n详见 https://内部文档地址/plugin-scripts\n",
  );

  console.log(`✓ 插件工程已生成: ${dir}`);
  console.log(`  cd plugin-${name}`);
  console.log(`  npm install`);
  console.log(`  编辑 catalog/services/${name}.json 声明服务`);
  console.log(`  npx @saicmotor/cli@latest dev  # 本地联调`);
}

/** validate .——校验当前目录的插件 manifest + catalog */
function validatePlugin(dir: string): boolean {
  const manifestPath = path.join(dir, "saicmotor.plugin.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`✗ 未找到 saicmotor.plugin.json: ${dir}`);
    return false;
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    console.error(`✗ manifest JSON 解析失败: ${manifestPath}`);
    return false;
  }

  try {
    PluginManifestSchema.parse(manifest);
    console.log("✓ manifest 校验通过");
  } catch (e: any) {
    console.error(`✗ manifest 校验失败: ${e.message}`);
    return false;
  }

  // TODO: 后续迭代添加 catalog zod 校验
  console.log("✓ 插件校验通过");
  return true;
}

/** dev——将当前目录 link 到 ~/.saicmotor/plugins/linked/ */
function devPlugin(dir: string, stop: boolean): void {
  const manifestPath = path.join(dir, "saicmotor.plugin.json");
  if (!fs.existsSync(manifestPath)) {
    console.error(`✗ 未找到 saicmotor.plugin.json，请在插件工程根目录运行`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const name = manifest.name;
  const shortName = name.replace("@saicmotor/", ""); // plugin-user
  const target = path.join(linkedPluginsDir(), shortName);

  if (stop) {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      const state = loadState();
      delete state.plugins[name];
      saveState(state);
      console.log(`✓ dev link 已解除: ${target}`);
    } else {
      console.log(`（无活跃 dev link）`);
    }
    return;
  }

  // 建立 junction
  if (!fs.existsSync(linkedPluginsDir())) {
    fs.mkdirSync(linkedPluginsDir(), { recursive: true });
  }
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.symlinkSync(path.resolve(dir), target, "junction");

  // 写 state
  const state = loadState();
  state.plugins[name] = {
    name,
    version: "dev",
    enabled: true,
    source: "linked",
    linkedPath: path.resolve(dir),
    skills: manifest.skills ?? [],
  };
  saveState(state);

  console.log(`✓ dev link 已建立: ${target} → ${path.resolve(dir)}`);
  console.log(`  全局/npx CLI 已加载该插件`);
  console.log(`  解除: saicmotor dev --stop`);
}

export function registerToolingCommands(program: Command): void {
  // create plugin <name>
  const createCmd = program.command("create");
  createCmd
    .command("plugin <name>")
    .description("生成标准插件工程骨架")
    .action((name: string) => createPlugin(name));

  // validate <dir>
  program
    .command("validate <dir>")
    .description("校验插件 manifest 与 catalog")
    .action((dir: string) => {
      const ok = validatePlugin(dir);
      if (!ok) process.exit(1);
    });

  // dev
  program
    .command("dev")
    .description("将当前目录 link 为开发插件")
    .option("--stop", "解除 dev link")
    .action((opts: { stop?: boolean }) => {
      devPlugin(process.cwd(), !!opts.stop);
    });
}
