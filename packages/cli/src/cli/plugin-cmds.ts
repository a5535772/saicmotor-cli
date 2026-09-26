import { Command } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadState, saveState } from "../plugin/state";
import { installedPluginsDir, pluginsDir } from "../plugin/paths";
import { loadPlugins } from "../plugin/loader";
import { loadConfig } from "../config";
import {
  registerPluginSkills,
  unregisterPluginSkills,
  registerSkill,
} from "../plugin/registrar";
import { buildSuiteRoutes, generateSuiteSkill } from "../plugin/suite";
import { findPackageRoot } from "../pkg-root";

function jsonOut(data: unknown): void {
  console.log(JSON.stringify({ ok: true, data }, null, 2));
}

function jsonErr(error: string): void {
  console.error(JSON.stringify({ ok: false, error }, null, 2));
}

/**
 * 短名展开："reimbursement" → "@saicmotor/plugin-reimbursement"
 */
function fullName(input: string): string {
  if (input.startsWith("@saicmotor/plugin-")) return input;
  if (input.startsWith("plugin-")) return `@saicmotor/${input}`;
  return `@saicmotor/plugin-${input}`;
}

/** 刷新 suite 文件并重新注册 */
function refreshSuite(): void {
  try {
    const routes = buildSuiteRoutes();
    const md = generateSuiteSkill(routes);
    const suiteDir = path.join(findPackageRoot(), "skills", "saicmotor-suite");
    if (!fs.existsSync(suiteDir)) fs.mkdirSync(suiteDir, { recursive: true });
    fs.writeFileSync(path.join(suiteDir, "SKILL.md"), md, "utf8");
    registerSkill(suiteDir, "saicmotor-suite");
  } catch (e: any) {
    console.error(`[saicmotor] suite 路由刷新失败: ${e.message}`);
  }
}

export function registerPluginCommands(program: Command): void {
  const plugin = program
    .command("plugin")
    .description("插件管理（install / uninstall / list / enable / disable / upgrade）");

  // plugin install <pkg>
  plugin
    .command("install <pkg>")
    .description("安装插件（短名自动展开为 @saicmotor/plugin-<name>）")
    .option("--json", "JSON 输出")
    .option("--registry <url>", "npm registry 地址")
    .action((pkg: string, opts: { json?: boolean; registry?: string }) => {
      try {
        const name = fullName(pkg);
        const prefixDir = pluginsDir();
        if (!fs.existsSync(prefixDir)) fs.mkdirSync(prefixDir, { recursive: true });

        // 确保 prefixDir 下有 package.json，让 npm 能累积安装多个插件
        const pkgJsonPath = path.join(prefixDir, "package.json");
        if (!fs.existsSync(pkgJsonPath)) {
          fs.writeFileSync(pkgJsonPath, JSON.stringify({ private: true }, null, 2));
        }

        const registryFlag = opts.registry ? ` --registry=${opts.registry}` : "";
        console.error(`安装 ${name} ...`);
        execSync(`npm install ${name} --prefix "${prefixDir}" --legacy-peer-deps${registryFlag}`, {
          stdio: "inherit",
          cwd: prefixDir,
        });

        // npm --prefix 在 prefixDir 下创一层 node_modules/@saicmotor/plugin-*
        const pkgDir = path.join(prefixDir, "node_modules", name);
        const manifestPath = path.join(pkgDir, "saicmotor.plugin.json");
        if (fs.existsSync(manifestPath)) {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
          const skillDirs = manifest.skills ?? [];

          // 注册 skills
          const skillResults = registerPluginSkills(pkgDir, skillDirs);

          // 更新 state
          const state = loadState();
          const pkgJson = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"));
          state.plugins[name] = {
            name,
            version: pkgJson.version ?? "unknown",
            enabled: true,
            source: "registry",
            skills: skillDirs,
            routes: manifest.routes,
          };
          saveState(state);

          // 刷新 suite
          refreshSuite();

          if (opts.json) {
            jsonOut({ installed: name, version: pkgJson.version, skills: Object.keys(skillResults) });
          } else {
            console.log(`✓ ${name} 安装完成，${Object.keys(skillResults).length} 个 skills 已注册`);
          }
        } else {
          if (opts.json) jsonErr(`manifest 缺失: ${manifestPath}`);
          else console.error(`✗ manifest 缺失: ${manifestPath}`);
        }
      } catch (e: any) {
        if (opts.json) jsonErr(e.message);
        else console.error(`✗ 安装失败: ${e.message}`);
      }
    });

  // plugin uninstall <name>
  plugin
    .command("uninstall <name>")
    .description("卸载插件")
    .option("--json", "JSON 输出")
    .action((name: string, opts: { json?: boolean }) => {
      try {
        const full = fullName(name);
        const state = loadState();
        const entry = state.plugins[full];
        if (!entry) {
          if (opts.json) jsonErr(`未找到插件: ${full}`);
          else console.error(`✗ 未找到插件: ${full}`);
          return;
        }

        // 注销 skills
        unregisterPluginSkills(entry.skills ?? []);

        // npm 卸载
        try {
          execSync(`npm uninstall ${full} --prefix "${pluginsDir()}"`, { stdio: "pipe" });
        } catch {
          // npm 卸载失败不阻断后续清理
        }

        // 清理 state
        delete state.plugins[full];
        saveState(state);

        // 刷新 suite
        refreshSuite();

        if (opts.json) jsonOut({ uninstalled: full });
        else console.log(`✓ ${full} 已卸载`);
      } catch (e: any) {
        if (opts.json) jsonErr(e.message);
        else console.error(`✗ 卸载失败: ${e.message}`);
      }
    });

  // plugin list
  plugin
    .command("list")
    .description("列出已安装插件")
    .option("--json", "JSON 输出")
    .action((opts: { json?: boolean }) => {
      const { plugins, warnings } = loadPlugins(loadConfig());
      const list = plugins.map((p) => ({
        name: p.manifest.name,
        version: p.entry.version,
        enabled: p.entry.enabled,
        source: p.entry.source,
        linkedPath: p.entry.linkedPath,
        skills: p.manifest.skills ?? [],
        compatible: true,
      }));

      if (opts.json) {
        jsonOut({ plugins: list, warnings: warnings.length > 0 ? warnings : undefined });
      } else {
        if (list.length === 0) {
          console.log("（无已安装插件）");
        } else {
          for (const p of list) {
            const src = p.source === "linked" ? `linked → ${p.linkedPath}` : "registry";
            console.log(`  ${p.name}@${p.version}  ${src}  ${p.enabled ? "✓" : "✗"}`);
          }
        }
        for (const w of warnings) {
          console.error(`  ⚠ ${w}`);
        }
      }
    });

  // plugin enable / disable
  for (const action of ["enable", "disable"] as const) {
    plugin
      .command(`${action} <name>`)
      .description(`${action === "enable" ? "启用" : "禁用"}插件`)
      .option("--json", "JSON 输出")
      .action((name: string, opts: { json?: boolean }) => {
        const full = fullName(name);
        const state = loadState();
        if (!state.plugins[full]) {
          if (opts.json) jsonErr(`未找到插件: ${full}`);
          else console.error(`✗ 未找到插件: ${full}`);
          return;
        }
        state.plugins[full].enabled = action === "enable";
        saveState(state);
        if (opts.json) jsonOut({ name: full, enabled: action === "enable" });
        else console.log(`✓ ${full} ${action === "enable" ? "已启用" : "已禁用"}`);
      });
  }

  // plugin upgrade <name>
  plugin
    .command("upgrade <name>")
    .description("升级插件到 latest")
    .option("--json", "JSON 输出")
    .option("--registry <url>", "npm registry 地址")
    .action((name: string, opts: { json?: boolean; registry?: string }) => {
      try {
        const full = fullName(name);
        const prefixDir = pluginsDir();
        const registryFlag = opts.registry ? ` --registry=${opts.registry}` : "";
        execSync(`npm update ${full} --prefix "${prefixDir}" --legacy-peer-deps${registryFlag}`, { stdio: "inherit" });
        if (opts.json) jsonOut({ upgraded: full });
        else console.log(`✓ ${full} 已升级`);
      } catch (e: any) {
        if (opts.json) jsonErr(e.message);
        else console.error(`✗ 升级失败: ${e.message}`);
      }
    });
}