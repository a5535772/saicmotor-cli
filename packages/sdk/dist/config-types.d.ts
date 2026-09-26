/** 与 packages/cli/src/config.ts 保持一致的接口子集 */
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
