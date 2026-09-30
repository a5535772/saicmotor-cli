import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config";
import type { Service, Method, ScriptContext, ScriptFn, RunResult } from "@saicmotor/sdk";
import { SaicmotorError } from "@saicmotor/sdk";
import { distRoot, packageFile } from "../pkg-root";
import { loadPlugins } from "../plugin/loader";

/** 仅供测试使用的路径构建器，生产脚本解析走 findScript() */
export function scriptFileFor(serviceName: string, resourceName: string, methodName: string): string {
  return path.join(distRoot(), "scripts", serviceName, resourceName, `${methodName}.js`);
}

function firstExisting(files: string[]): string | null {
  for (const file of files) {
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** 校验 candidate 是否仍在 base 目录内，阻断 `..` 路径穿越 */
function within(base: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(base), path.resolve(candidate));
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
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
    const base = process.env.SAICMOTOR_SCRIPTS;
    const candidates = [path.join(base, `${rel}.js`), path.join(base, `${rel}.ts`)].filter((candidate) =>
      within(base, candidate),
    );
    const override = firstExisting(candidates);
    if (override) return override;
  }

  // 插件 scripts 目录（延迟加载，避免潜在的循环依赖）
  try {
    const { plugins } = loadPlugins(loadConfig());
    for (const plugin of plugins) {
      if (plugin.manifest.scripts) {
        const bases = [
          path.join(plugin.rootDir, plugin.manifest.scripts),
          path.join(plugin.rootDir, "dist", plugin.manifest.scripts),
        ];
        const candidates = bases
          .map((base) => path.join(base, `${rel}.js`))
          .filter((candidate, index) => within(bases[index], candidate));
        const pluginScript = firstExisting(candidates);
        if (pluginScript) return pluginScript;
      }
    }
  } catch {
    // 插件不可用时静默跳过
  }

  const compiledBase = path.join(distRoot(), "scripts");
  const compiled = path.join(compiledBase, `${rel}.js`);
  if (within(compiledBase, compiled) && fs.existsSync(compiled)) return compiled;

  const sourceBase = packageFile("scripts");
  const source = path.join(sourceBase, `${rel}.ts`);
  return within(sourceBase, source) && fs.existsSync(source) ? source : null;
}

export async function executeScript(file: string, ctx: ScriptContext): Promise<RunResult> {
  const mod: unknown = await import(file);
  const fn: unknown = (mod as { default?: unknown }).default ?? mod;
  if (typeof fn !== "function") {
    throw new SaicmotorError("spec", `脚本未默认导出函数: ${file}`);
  }
  return (fn as ScriptFn)(ctx);
}
