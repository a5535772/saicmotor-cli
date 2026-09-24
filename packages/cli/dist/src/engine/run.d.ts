import type { Config } from "../config";
import type { Service, Method } from "../schema/catalog";
export interface RunResult {
    ok: true;
    data: unknown;
}
export declare function runMethod(config: Config, service: Service, resourceName: string, methodName: string, method: Method, raw: Record<string, string | undefined>, opts?: {
    dryRun?: boolean;
}): Promise<RunResult>;
