import { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { PluginManifestSchema } from "@saicmotor/sdk";
import { linkedPluginsDir } from "../plugin/paths";
import { loadState, saveState } from "../plugin/state";

// ── 提取的命令逻辑（可测试，无 console 输出）──

export interface CreatePluginResult {
  ok: boolean;
  error?: string;
  data?: { dir: string; pkgName: string };
}

/**
 * 生成标准插件工程骨架。
 * @param name 插件短名（如 "reimbursement"）
 * @param outputDir 输出到哪个目录（默认 cwd）
 */
export function createPluginLogic(name: string, outputDir?: string): CreatePluginResult {
  const cwd = outputDir ?? process.cwd();
  const pkgName = `@saicmotor/plugin-${name}`;
  const dir = path.join(cwd, `plugin-${name}`);

  if (fs.existsSync(dir)) {
    return { ok: false, error: `目录已存在: ${dir}` };
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

  return { ok: true, data: { dir, pkgName } };
}

export interface ValidatePluginResult {
  ok: boolean;
  error?: string;
}

/**
 * 校验插件目录的 manifest。
 */
export function validatePluginLogic(dir: string): ValidatePluginResult {
  const manifestPath = path.join(dir, "saicmotor.plugin.json");
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: `未找到 saicmotor.plugin.json: ${dir}` };
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return { ok: false, error: `manifest JSON 解析失败: ${manifestPath}` };
  }

  try {
    PluginManifestSchema.parse(manifest);
  } catch (e: any) {
    return { ok: false, error: `manifest 校验失败: ${e.message}` };
  }

  return { ok: true };
}

export interface DevPluginResult {
  ok: boolean;
  error?: string;
  data?: { target: string; shortName: string; action: "link" | "unlink" };
}

/**
 * dev link/unlink 核心逻辑。
 * @param dir 插件工程目录
 * @param stop true 解除 dev link
 */
export function devPluginLogic(dir: string, stop: boolean): DevPluginResult {
  const manifestPath = path.join(dir, "saicmotor.plugin.json");
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: "未找到 saicmotor.plugin.json，请在插件工程根目录运行" };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const name = manifest.name;
  const shortName = name.replace("@saicmotor/", "");
  const target = path.join(linkedPluginsDir(), shortName);

  if (stop) {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      const state = loadState();
      delete state.plugins[name];
      saveState(state);
      return { ok: true, data: { target, shortName, action: "unlink" } };
    }
    return { ok: true, data: { target, shortName, action: "unlink" } };
  }

  if (!fs.existsSync(linkedPluginsDir())) {
    fs.mkdirSync(linkedPluginsDir(), { recursive: true });
  }
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
  fs.symlinkSync(path.resolve(dir), target, "junction");

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

  return { ok: true, data: { target, shortName, action: "link" } };
}

// ── Commander 注册（薄壳：调提取函数 + 格式化输出）──

export function registerToolingCommands(program: Command): void {
  // create plugin <name>
  const createCmd = program.command("create");
  createCmd
    .command("plugin <name>")
    .description("生成标准插件工程骨架")
    .action((name: string) => {
      const result = createPluginLogic(name);
      if (result.ok && result.data) {
        console.log(`✓ 插件工程已生成: ${result.data.dir}`);
        console.log(`  cd plugin-${name}`);
        console.log(`  npm install`);
        console.log(`  编辑 catalog/services/${name}.json 声明服务`);
        console.log(`  npx @saicmotor/cli@latest dev  # 本地联调`);
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });

  // validate <dir>
  program
    .command("validate <dir>")
    .description("校验插件 manifest 与 catalog")
    .action((dir: string) => {
      const result = validatePluginLogic(dir);
      if (result.ok) {
        console.log("✓ manifest 校验通过");
        console.log("✓ 插件校验通过");
      } else {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
    });

  // dev
  program
    .command("dev")
    .description("将当前目录 link 为开发插件")
    .option("--stop", "解除 dev link")
    .action((opts: { stop?: boolean }) => {
      const result = devPluginLogic(process.cwd(), !!opts.stop);
      if (!result.ok) {
        console.error(`✗ ${result.error}`);
        process.exit(1);
      }
      if (result.data?.action === "unlink") {
        // unlink 成功时 target 已被逻辑层删除，此处仅打印
        console.log(`✓ dev link 已解除: ${result.data.target}`);
      } else if (result.data?.action === "link") {
        console.log(`✓ dev link 已建立: ${result.data.target} → ${path.resolve(process.cwd())}`);
        console.log(`  全局/npx CLI 已加载该插件`);
        console.log(`  解除: saicmotor dev --stop`);
      }
    });
}