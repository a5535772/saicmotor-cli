import type { Config } from "../config";
import type { Method, Field } from "../schema/catalog";
import { SaicmotorError } from "./errors";

export function buildUrl(config: Config, servicePath: string, method: Method): string {
  return config.gateway + servicePath + method.path;
}

export function coerceFields(fields: Record<string, Field>, raw: Record<string, string | undefined>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(fields)) {
    const value = raw[name];
    if (value === undefined) {
      if (field.required) throw new SaicmotorError("validation", `缺少必填参数: ${name}`);
      continue;
    }
    switch (field.type) {
      case "integer": {
        const n = Number(value);
        if (!Number.isInteger(n)) throw new SaicmotorError("validation", `参数 ${name} 应为整数，实际: ${value}`);
        out[name] = n;
        break;
      }
      case "number": {
        const n = Number(value);
        if (Number.isNaN(n)) throw new SaicmotorError("validation", `参数 ${name} 应为数字，实际: ${value}`);
        out[name] = n;
        break;
      }
      case "boolean":
        out[name] = value === "true" || value === "1";
        break;
      default:
        out[name] = value;
    }
  }
  return out;
}

export function buildBody(method: Method, values: Record<string, unknown>): string | undefined {
  if (!method.requestBody) return undefined;
  const body: Record<string, unknown> = {};
  for (const name of Object.keys(method.requestBody)) {
    if (values[name] !== undefined) body[name] = values[name];
  }
  return JSON.stringify(body);
}
