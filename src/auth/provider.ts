import type { Config } from "../config";
import { PasswordProvider } from "./password";
import { ExchangeProvider } from "./exchange";
import type { AuthProvider } from "./provider-types";

export type { AuthProvider } from "./provider-types";

export function createAuthProvider(config: Config): AuthProvider {
  if (config.auth.type === "exchange") return new ExchangeProvider(config);
  return new PasswordProvider(config);
}
