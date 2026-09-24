import type { Config } from "../config";
import type { AuthProvider } from "./provider-types";
export declare class PasswordProvider implements AuthProvider {
    private readonly config;
    constructor(config: Config);
    login(): Promise<string>;
}
export declare function loginWithPassword(config: Config, username: string, password: string): Promise<string>;
