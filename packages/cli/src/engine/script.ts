import fs from "node:fs";
import path from "node:path";
import type { Config } from "../config";
import { loadConfig } from "../config";
import type { Service, Method } from "../schema/catalog";
import type { RunResult } from "./run";
import { SaicmotorError } from "./errors";
import { distRoot, packageFile } from "../pkg-root";
import { loadPlugins } from "../plugin/loader";

export interface ScriptContext {
  config: Config;
  service: Service;
  method: Method;
  values: Record<string, unknown>;
  dryRun: boolean;
  ensureToken: () => Promise<string>;
}

export type ScriptFn = (ctx: ScriptContext) => Promise<RunResult>;

export function scriptFileFor(serviceName: string, resourceName: string, methodName: string): string {
  return path.join(distRoot(), "scripts", serviceName, resourceName, `${methodName}.js`);
}

function firstExisting(files: string[]): string | null {
  for (const file of files) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/**
 * 脚本查找顺序：
 * 1. SAICMOTOR_SCRIPTS 显式覆盖（测试/定制）：<dir>/<svc>/<res>/<method>.{js,ts}
 * 2. 插件 scripts 目录：<plugin-root>/<scripts-dir>/<svc>/<res>/<method>.js
 * 3. 编译产物：dist/scripts/<svc>/<res>/<method>.js（安装形态）
 * 4. 源码树：scripts/<svc>/<res>/<method>.ts（本地 tsx 开发）
 */
export function findScript(serviceName: string, resourceName: string, methodName: string): string | null {
  const rel = path.join(serviceName, resourceName, methodName);

  if (process.env.SAICMOTOR_SCRIPTS) {
    const override = firstExisting([
      path.join(process.env.SAICMOTOR_SCRIPTS, `${rel}.js`),
      path.join(process.env.SAICMOTOR_SCRIPTS, `${rel}.ts`),
    ]);
    if (override) return override;
  }

  // 插件 scripts 目录（延迟加载，避免潜在的循环依赖）
  try {
    const { plugins } = loadPlugins(loadConfig());
    for (const plugin of plugins) {
      if (plugin.manifest.scripts) {
        const pluginScript = path.join(plugin.rootDir, plugin.manifest.scripts, `${rel}.js`);
        if (fs.existsSync(pluginScript)) return pluginScript;
      }
    }
  } catch {
    // 插件不可用时静默跳过
  }

  const compiled = path.join(distRoot(), "scripts", `${rel}.js`);
  if (fs.existsSync(compiled)) return compiled;

  const source = packageFile(path.join("scripts", `${rel}.ts`));
  return fs.existsSync(source) ? source : null;
}

export async function executeScript(file: string, ctx: ScriptContext): Promise<RunResult> {
  const mod: unknown = await import(file);
  const fn: unknown = (mod as { default?: unknown }).default ?? mod;
  if (typeof fn !== "function") {
    throw new SaicmotorError("spec", `脚本未默认导出函数: ${file}`);
  }
  return (fn as ScriptFn)(ctx);
}
