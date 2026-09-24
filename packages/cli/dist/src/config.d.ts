export interface AuthConfig {
    type: "password" | "exchange";
    loginPath: string;
    tokenPath: string;
    tokenHeader: string;
    tokenPrefix: string;
    startPath: string;
    exchangePath: string;
    loopbackHost: string;
    loopbackPort: number;
    callbackTimeoutMs: number;
}
export interface Config {
    gateway: string;
    auth: AuthConfig;
}
export declare const DEFAULT_CONFIG: Config;
export declare function saicmotorDir(): string;
export declare function configPath(): string;
export declare function loadConfig(): Config;
export declare function catalogDir(): string;
export declare function scriptsDir(): string;
export declare function toKebab(s: string): string;
export declare function toCamel(s: string): string;
