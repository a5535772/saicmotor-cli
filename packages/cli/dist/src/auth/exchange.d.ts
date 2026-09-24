import type { Config } from "../config";
import type { AuthProvider } from "./provider-types";
export declare class ExchangeProvider implements AuthProvider {
    private readonly config;
    constructor(config: Config);
    login(): Promise<string>;
}
