import type { Config } from "../config";
import type { Service, Method } from "../schema/catalog";
import type { RunResult } from "./run";
export interface ScriptContext {
    config: Config;
    service: Service;
    method: Method;
    values: Record<string, unknown>;
    dryRun: boolean;
    ensureToken: () => Promise<string>;
}
export type ScriptFn = (ctx: ScriptContext) => Promise<RunResult>;
export declare function scriptFileFor(serviceName: string, resourceName: string, methodName: string): string;
/**
 * 脚本查找顺序：
 * 1. SAICMOTOR_SCRIPTS 显式覆盖（测试/定制）：<dir>/<svc>/<res>/<method>.{js,ts}
 * 2. 编译产物：dist/scripts/<svc>/<res>/<method>.js（安装形态）
 * 3. 源码树：scripts/<svc>/<res>/<method>.ts（本地 tsx 开发）
 */
export declare function findScript(serviceName: string, resourceName: string, methodName: string): string | null;
export declare function executeScript(file: string, ctx: ScriptContext): Promise<RunResult>;
