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

// ── 工具函数 ──

export function jsonOut(data: unknown): void {
  console.log(JSON.stringify({ ok: true, data }, null, 2));
}

export function jsonErr(error: string): void {
  console.error(JSON.stringify({ ok: false, error }, null, 2));
}

/**
 * 短名展开："reimbursement" → "@saicmotor/plugin-reimbursement"
 */
export function fullName(input: string): string {
  if (input.startsWith("@saicmotor/plugin-")) return input;
  if (input.startsWith("plugin-")) return `@saicmotor/${input}`;
  return `@saicmotor/plugin-${input}`;
}

/** 刷新 suite 文件并重新注册 */
export function refreshSuite(): void {
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

// ── 提取的命令逻辑（可测试，无 console 输出）──

export interface PluginInstallResult {
  ok: boolean;
  error?: string;
  data?: {
    name: string;
    version: string;
    skills: string[];
  };
}

/**
 * 插件安装核心逻辑。
 * 执行 npm install + manifest 解析 + skills 注册 + state 更新 + suite 刷新。
 */
export function installPluginLogic(
  pkg: string,
  opts: { registry?: string },
): PluginInstallResult {
  const name = fullName(pkg);
  const prefixDir = pluginsDir();
  if (!fs.existsSync(prefixDir)) fs.mkdirSync(prefixDir, { recursive: true });

  const pkgJsonPath = path.join(prefixDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    fs.writeFileSync(pkgJsonPath, JSON.stringify({ private: true }, null, 2));
  }

  const registryFlag = opts.registry ? ` --registry=${opts.registry}` : "";
  try {
    execSync(
      `npm install ${name} --prefix "${prefixDir}" --legacy-peer-deps${registryFlag}`,
      { stdio: "pipe", cwd: prefixDir },
    );
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  const pkgDir = path.join(prefixDir, "node_modules", name);
  const manifestPath = path.join(pkgDir, "saicmotor.plugin.json");
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: `manifest 缺失: ${manifestPath}` };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const skillDirs: string[] = manifest.skills ?? [];

  const skillResults = registerPluginSkills(pkgDir, skillDirs);

  const state = loadState();
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(pkgDir, "package.json"), "utf8"),
  );
  state.plugins[name] = {
    name,
    version: pkgJson.version ?? "unknown",
    enabled: true,
    source: "registry",
    skills: skillDirs,
    routes: manifest.routes,
  };
  saveState(state);

  refreshSuite();

  return {
    ok: true,
    data: {
      name,
      version: pkgJson.version,
      skills: Object.keys(skillResults),
    },
  };
}

export interface PluginUninstallResult {
  ok: boolean;
  error?: string;
  data?: { name: string };
}

/**
 * 插件卸载核心逻辑。
 * 注销 skills → npm uninstall → 清理 state → 刷新 suite。
 */
export function uninstallPluginLogic(name: string): PluginUninstallResult {
  const full = fullName(name);
  const state = loadState();
  const entry = state.plugins[full];
  if (!entry) {
    return { ok: false, error: `未找到插件: ${full}` };
  }

  unregisterPluginSkills(entry.skills ?? []);

  try {
    execSync(`npm uninstall ${full} --prefix "${pluginsDir()}"`, {
      stdio: "pipe",
    });
  } catch {
    // npm 卸载失败不阻断后续清理
  }

  delete state.plugins[full];
  saveState(state);

  refreshSuite();

  return { ok: true, data: { name: full } };
}

export interface PluginToggleResult {
  ok: boolean;
  error?: string;
  data?: { name: string; enabled: boolean };
}

/**
 * 插件启用/禁用核心逻辑。
 * 只切换 state，不操作 skills 或 suite。
 */
export function setPluginEnabledLogic(
  name: string,
  enabled: boolean,
): PluginToggleResult {
  const full = fullName(name);
  const state = loadState();
  if (!state.plugins[full]) {
    return { ok: false, error: `未找到插件: ${full}` };
  }
  state.plugins[full].enabled = enabled;
  saveState(state);
  return { ok: true, data: { name: full, enabled } };
}

export interface PluginUpgradeResult {
  ok: boolean;
  error?: string;
  data?: { name: string };
}

/**
 * 插件升级核心逻辑。
 * 执行 npm update。
 */
export function upgradePluginLogic(
  name: string,
  opts: { registry?: string },
): PluginUpgradeResult {
  const full = fullName(name);
  const prefixDir = pluginsDir();
  const registryFlag = opts.registry ? ` --registry=${opts.registry}` : "";
  try {
    execSync(
      `npm update ${full} --prefix "${prefixDir}" --legacy-peer-deps${registryFlag}`,
      { stdio: "pipe" },
    );
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  return { ok: true, data: { name: full } };
}

// ── Commander 注册（薄壳：调提取函数 + 格式化输出）──

export function registerPluginCommands(program: Command): void {
  const plugin = program
    .command("plugin")
    .description(
      "插件管理（install / uninstall / list / enable / disable / upgrade）",
    );

  // plugin install <pkg>
  plugin
    .command("install <pkg>")
    .description("安装插件（短名自动展开为 @saicmotor/plugin-<name>）")
    .option("--json", "JSON 输出")
    .option("--registry <url>", "npm registry 地址")
    .action((pkg: string, opts: { json?: boolean; registry?: string }) => {
      const result = installPluginLogic(pkg, opts);
      if (opts.json) {
        if (result.ok && result.data) {
          jsonOut({
            installed: result.data.name,
            version: result.data.version,
            skills: result.data.skills,
          });
        } else {
          jsonErr(result.error ?? "安装失败");
        }
      } else {
        if (result.ok && result.data) {
          console.log(
            `✓ ${result.data.name} 安装完成，${result.data.skills.length} 个 skills 已注册`,
          );
        } else {
          console.error(`✗ 安装失败: ${result.error}`);
        }
      }
    });

  // plugin uninstall <name>
  plugin
    .command("uninstall <name>")
    .description("卸载插件")
    .option("--json", "JSON 输出")
    .action((name: string, opts: { json?: boolean }) => {
      const result = uninstallPluginLogic(name);
      if (opts.json) {
        if (result.ok && result.data) {
          jsonOut({ uninstalled: result.data.name });
        } else {
          jsonErr(result.error ?? "卸载失败");
        }
      } else {
        if (result.ok && result.data) {
          console.log(`✓ ${result.data.name} 已卸载`);
        } else {
          console.error(`✗ 未找到插件: ${result.error?.split(": ").pop()}`);
        }
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
        jsonOut({
          plugins: list,
          warnings: warnings.length > 0 ? warnings : undefined,
        });
      } else {
        if (list.length === 0) {
          console.log("（无已安装插件）");
        } else {
          for (const p of list) {
            const src =
              p.source === "linked"
                ? `linked → ${p.linkedPath}`
                : "registry";
            console.log(
              `  ${p.name}@${p.version}  ${src}  ${p.enabled ? "✓" : "✗"}`,
            );
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
        const result = setPluginEnabledLogic(name, action === "enable");
        if (opts.json) {
          if (result.ok && result.data) {
            jsonOut({
              name: result.data.name,
              enabled: result.data.enabled,
            });
          } else {
            jsonErr(result.error ?? `${action} 失败`);
          }
        } else {
          if (result.ok && result.data) {
            console.log(
              `✓ ${result.data.name} ${action === "enable" ? "已启用" : "已禁用"}`,
            );
          } else {
            console.error(`✗ 未找到插件: ${fullName(name)}`);
          }
        }
      });
  }

  // plugin upgrade <name>
  plugin
    .command("upgrade <name>")
    .description("升级插件到 latest")
    .option("--json", "JSON 输出")
    .option("--registry <url>", "npm registry 地址")
    .action(
      (name: string, opts: { json?: boolean; registry?: string }) => {
        const result = upgradePluginLogic(name, opts);
        if (opts.json) {
          if (result.ok && result.data) {
            jsonOut({ upgraded: result.data.name });
          } else {
            jsonErr(result.error ?? "升级失败");
          }
        } else {
          if (result.ok && result.data) {
            console.log(`✓ ${result.data.name} 已升级`);
          } else {
            console.error(`✗ 升级失败: ${result.error}`);
          }
        }
      },
    );
}