import { Command } from "commander";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadState, saveState } from "../plugin/state";
import { installedPluginsDir, pluginsDir } from "../plugin/paths";
import { loadPlugins } from "../plugin/loader";
import { loadConfig } from "../config";
import * as registrar from "../plugin/registrar";

// ── 工具函数 ──

/** npm package name 白名单：拒绝含 shell 元字符的输入（防止命令注入） */
const SAFE_PKG_NAME_RE =
  /^@?[a-z0-9][\w\-.]*(\/[a-z0-9][\w\-.]*)?$/i;

export function jsonOut(data: unknown): void {
  console.log(JSON.stringify({ ok: true, data }, null, 2));
}

export function jsonErr(error: string): void {
  console.error(JSON.stringify({ ok: false, error }, null, 2));
}

/**
 * 短名展开："reimbursement" → "@saicmotor/plugin-reimbursement"
 * 拒绝含 shell 元字符的输入，防止命令注入。
 */
export function fullName(input: string): string {
  if (!SAFE_PKG_NAME_RE.test(input) && !SAFE_PKG_NAME_RE.test(`@saicmotor/plugin-${input}`)) {
    throw new Error(`无效的包名: ${input}`);
  }
  if (input.startsWith("@saicmotor/plugin-")) return input;
  if (input.startsWith("plugin-")) return `@saicmotor/${input}`;
  return `@saicmotor/plugin-${input}`;
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
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }

  const pkgDir = path.join(prefixDir, "node_modules", name);
  const manifestPath = path.join(pkgDir, "saicmotor.plugin.json");
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, error: `manifest 缺失: ${manifestPath}` };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const skillDirs: string[] = manifest.skills ?? [];

  const skillResults = registrar.registerPluginSkills(pkgDir, skillDirs);

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

  registrar.writeSuiteRoutes();

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

  registrar.unregisterPluginSkills(entry.skills ?? []);

  let npmUninstallFailed = false;
  try {
    execSync(`npm uninstall ${full} --prefix "${pluginsDir()}"`, {
      stdio: "pipe",
    });
  } catch {
    npmUninstallFailed = true;
  }

  delete state.plugins[full];
  saveState(state);

  registrar.writeSuiteRoutes();

  const result: PluginUninstallResult = { ok: true, data: { name: full } };
  if (npmUninstallFailed) {
    result.error = `state 已清理，但 npm 包自删失败，请手动执行: npm uninstall ${full} --prefix "${pluginsDir()}"`;
  }
  return result;
}

export interface PluginToggleResult {
  ok: boolean;
  error?: string;
  data?: { name: string; enabled: boolean };
}

/** 解析插件包根目录（linked 用工程路径，registry 用 node_modules 下路径） */
function pluginRootOf(entry: {
  source: string;
  linkedPath?: string;
  name: string;
}): string {
  if (entry.source === "linked" && entry.linkedPath) return entry.linkedPath;
  return path.join(installedPluginsDir(), entry.name);
}

/**
 * 插件启用/禁用核心逻辑。
 * 启用/禁用直接改变有效插件集合，会同步 skills 可见性与 suite 路由。
 */
export function setPluginEnabledLogic(
  name: string,
  enabled: boolean,
): PluginToggleResult {
  const full = fullName(name);
  const state = loadState();
  const entry = state.plugins[full];
  if (!entry) {
    return { ok: false, error: `未找到插件: ${full}` };
  }
  entry.enabled = enabled;
  saveState(state);

  // 启用/禁用直接改变有效插件集合，需同步 skills 可见性与 suite 路由
  if (enabled) {
    registrar.registerPluginSkills(pluginRootOf(entry), entry.skills ?? []);
  } else {
    registrar.unregisterPluginSkills(entry.skills ?? []);
  }
  registrar.writeSuiteRoutes();

  return { ok: true, data: { name: full, enabled } };
}

export interface PluginUpgradeResult {
  ok: boolean;
  error?: string;
  data?: { name: string };
}

/**
 * 插件升级核心逻辑。
 * 执行 npm update，随后重新注册 skills（幂等 add-only）、同步 version、刷新 suite。
 * 注意：升级若增删了 skills，请先 uninstall 再 install，勿依赖 upgrade 重建 skill 集。
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
  } catch (e: unknown) {
    return { ok: false, error: (e as Error).message };
  }

  // 幂等重注册 skills（更改的 skill 靠跳过，不改动既有 junction）
  const pkgDir = path.join(installedPluginsDir(), full);
  const manifestPath = path.join(pkgDir, "saicmotor.plugin.json");
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      registrar.registerPluginSkills(pkgDir, manifest.skills ?? []);
    } catch {
      // manifest 读失败不阻断升级结果
    }
  }

  // 回写新的 version 到 state，避免升级后 list 仍显示旧版本
  const state = loadState();
  const entry = state.plugins[full];
  const pkgJsonPath = path.join(pkgDir, "package.json");
  if (entry && fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
      entry.version = pkgJson.version ?? entry.version;
      saveState(state);
    } catch {
      // version 读取失败保留原值
    }
  }

  registrar.writeSuiteRoutes();

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
          const out: Record<string, unknown> = { uninstalled: result.data.name };
          if (result.error) (out as Record<string, unknown>).warning = result.error;
          jsonOut(out);
        } else {
          jsonErr(result.error ?? "卸载失败");
        }
      } else {
        if (result.ok && result.data) {
          console.log(`✓ ${result.data.name} 已卸载`);
          if (result.error) console.error(`⚠ ${result.error}`);
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