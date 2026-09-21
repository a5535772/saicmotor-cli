import fs from "node:fs";
import path from "node:path";
import type { Config } from "../config";
import { scriptsDir } from "../config";
import type { Service, Method } from "../schema/catalog";
import type { RunResult } from "./run";
import { SaicmotorError } from "./errors";

export interface ScriptContext {
  config: Config;
  service: Service;
  method: Method;
  /** coerceFields 已处理过的参数值，脚本不重复解析 */
  values: Record<string, unknown>;
  dryRun: boolean;
  /** 脚本内如需调用其他 API，可自行获取 token */
  ensureToken: () => Promise<string>;
}

export type ScriptFn = (ctx: ScriptContext) => Promise<RunResult>;

export function scriptFileFor(serviceName: string, resourceName: string, methodName: string): string {
  return path.join(scriptsDir(), serviceName, resourceName, `${methodName}.ts`);
}

export function findScript(serviceName: string, resourceName: string, methodName: string): string | null {
  const file = scriptFileFor(serviceName, resourceName, methodName);
  return fs.existsSync(file) ? file : null;
}

export async function executeScript(file: string, ctx: ScriptContext): Promise<RunResult> {
  const mod: unknown = await import(file);
  const fn: unknown = (mod as { default?: unknown }).default ?? mod;
  if (typeof fn !== "function") {
    throw new SaicmotorError("spec", `脚本未默认导出函数: ${file}`);
  }
  return (fn as ScriptFn)(ctx);
}