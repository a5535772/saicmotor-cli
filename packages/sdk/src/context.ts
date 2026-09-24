import type { Config } from "./config-types";
import type { Service, Method } from "./catalog-types";

/**
 * 插件 script 执行上下文。
 * 运行时由 CLI 引擎构造并注入，插件只需消费类型。
 */
export interface ScriptContext {
  config: Config;
  service: Service;
  method: Method;
  values: Record<string, unknown>;
  dryRun: boolean;
  ensureToken: () => Promise<string>;
}

/** script 默认导出函数签名 */
export type ScriptFn = (ctx: ScriptContext) => Promise<RunResult>;

/** 引擎 runMethod 返回值 */
export interface RunResult {
  ok: true;
  data: unknown;
}