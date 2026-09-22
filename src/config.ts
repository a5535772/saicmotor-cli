import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { packageFile } from "./pkg-root";

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

function loadPackageConfig(): { defaults?: { gateway?: string } } {
  try {
    return JSON.parse(fs.readFileSync(packageFile("saicmotor.config.json"), "utf8"));
  } catch {
    return {};
  }
}

const pkgConfig = loadPackageConfig();

export const DEFAULT_CONFIG: Config = {
  gateway: pkgConfig.defaults?.gateway ?? "http://localhost:8081",
  auth: {
    type: "password",
    loginPath: "/auth/login",
    tokenPath: "data.token",
    tokenHeader: "Authorization",
    tokenPrefix: "Bearer",
    startPath: "/auth/exchange/start",
    exchangePath: "/auth/exchange",
    loopbackHost: "127.0.0.1",
    loopbackPort: 3000,
    callbackTimeoutMs: 120000,
  },
};

export function saicmotorDir(): string {
  return process.env.SAICMOTOR_HOME ?? path.join(os.homedir(), ".saicmotor");
}

export function configPath(): string {
  return path.join(saicmotorDir(), "config.json");
}

export function loadConfig(): Config {
  let user: Partial<Config> = {};
  try {
    user = JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    /* use defaults */
  }
  const gateway = process.env.SAICMOTOR_GATEWAY ?? user.gateway ?? DEFAULT_CONFIG.gateway;
  const auth = { ...DEFAULT_CONFIG.auth, ...(user.auth ?? {}) };
  return { gateway, auth };
}

export function catalogDir(): string {
  return process.env.SAICMOTOR_CATALOG ?? packageFile(path.join("catalog", "services"));
}

export function scriptsDir(): string {
  return process.env.SAICMOTOR_SCRIPTS ?? packageFile("scripts");
}

export function toKebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()).replace(/_/g, "-");
}

export function toCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
