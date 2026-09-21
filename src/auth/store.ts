import fs from "node:fs";
import path from "node:path";
import { saicmotorDir } from "../config";

export interface Credentials {
  username: string;
  password: string;
}

function credentialsFile(): string {
  return path.join(saicmotorDir(), "credentials.json");
}

function tokenFile(): string {
  return path.join(saicmotorDir(), "token.json");
}

export function writeCredentials(creds: Credentials): void {
  fs.mkdirSync(path.dirname(credentialsFile()), { recursive: true });
  fs.writeFileSync(credentialsFile(), JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function readCredentials(): Credentials | undefined {
  const envUser = process.env.SAICMOTOR_USERNAME;
  const envPass = process.env.SAICMOTOR_PASSWORD;
  if (envUser && envPass) return { username: envUser, password: envPass };
  try {
    const raw = JSON.parse(fs.readFileSync(credentialsFile(), "utf8"));
    if (typeof raw.username === "string" && typeof raw.password === "string") {
      return { username: raw.username, password: raw.password };
    }
  } catch {
    /* not found */
  }
  return undefined;
}

export function clearCredentials(): void {
  try { fs.rmSync(credentialsFile(), { force: true }); } catch { /* ignore */ }
}

export function writeToken(token: string): void {
  fs.mkdirSync(path.dirname(tokenFile()), { recursive: true });
  fs.writeFileSync(tokenFile(), JSON.stringify({ token }, null, 2), { mode: 0o600 });
}

export function readToken(): string | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(tokenFile(), "utf8"));
    if (typeof raw.token === "string" && raw.token.length > 0) return raw.token;
  } catch {
    /* not found */
  }
  return undefined;
}

export function clearToken(): void {
  try { fs.rmSync(tokenFile(), { force: true }); } catch { /* ignore */ }
}
