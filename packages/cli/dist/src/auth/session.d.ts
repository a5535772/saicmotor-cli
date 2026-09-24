import type { Config } from "../config";
export declare function ensureToken(config: Config, opts?: {
    force?: boolean;
}): Promise<string>;
