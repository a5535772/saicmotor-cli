import type { Config } from "../config";

export function applyAuth(headers: Record<string, string>, config: Config, token: string): Record<string, string> {
  headers[config.auth.tokenHeader] = `${config.auth.tokenPrefix} ${token}`;
  return headers;
}
