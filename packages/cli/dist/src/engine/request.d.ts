import type { Config } from "../config";
import type { Method, Field } from "../schema/catalog";
export declare function buildUrl(config: Config, servicePath: string, method: Method): string;
export declare function coerceFields(fields: Record<string, Field>, raw: Record<string, string | undefined>): Record<string, unknown>;
export declare function buildBody(method: Method, values: Record<string, unknown>): string | undefined;
