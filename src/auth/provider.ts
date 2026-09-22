import type { Config } from "../config";
import { PasswordProvider } from "./password";

export interface AuthProvider {
  /** 完成认证，返回网关 token */
  login(): Promise<string>;
}

export function createAuthProvider(config: Config): AuthProvider {
  if (config.auth.type === "exchange") {
    throw new Error("exchange provider 尚未实现");
  }
  return new PasswordProvider(config);
}
