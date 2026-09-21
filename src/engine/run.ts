import type { Config } from "../config";
import type { Service, Method } from "../schema/catalog";
import { SaicmotorError } from "./errors";
import { send, type HttpResponse } from "./http";
import { ensureToken } from "../auth/session";
import { applyAuth } from "../auth/transport";
import { clearToken } from "../auth/store";
import { buildUrl, coerceFields, buildBody } from "./request";
import { findScript, executeScript } from "./script";

export interface RunResult {
  ok: true;
  data: unknown;
}

function extractMessage(body: unknown): string | undefined {
  if (body && typeof body === "object") return String((body as Record<string, unknown>).msg ?? "");
  return undefined;
}

function checkEnvelope(resp: HttpResponse): void {
  if (resp.status >= 400) {
    throw new SaicmotorError("upstream", `上游返回 HTTP ${resp.status}`, { upstream: { message: extractMessage(resp.body) } });
  }
  const body = resp.body as Record<string, unknown> | undefined;
  if (body && typeof body === "object" && body.code !== 0) {
    throw new SaicmotorError("upstream", `上游业务错误: ${body.msg ?? ""}`, { upstream: { code: body.code, message: extractMessage(body) } });
  }
}

async function execute(config: Config, servicePath: string, method: Method, token: string, values: Record<string, unknown>): Promise<HttpResponse> {
  const url = buildUrl(config, servicePath, method);
  const headers: Record<string, string> = {};
  const body = buildBody(method, values);
  if (body !== undefined) headers["Content-Type"] = "application/json";
  applyAuth(headers, config, token);
  return send({ method: method.httpMethod, url, headers, body });
}

export async function runMethod(
  config: Config,
  service: Service,
  resourceName: string,
  methodName: string,
  method: Method,
  raw: Record<string, string | undefined>,
  opts: { dryRun?: boolean } = {},
): Promise<RunResult> {
  const values = coerceFields(method.requestBody ?? {}, raw);

  // 脚本覆盖：检测到同名脚本 → 走脚本（脚本内部自行处理 dryRun 与 token）
  const scriptFile = findScript(service.name, resourceName, methodName);
  if (scriptFile) {
    return executeScript(scriptFile, {
      config,
      service,
      method,
      values,
      dryRun: !!opts.dryRun,
      ensureToken: () => ensureToken(config),
    });
  }

  if (opts.dryRun) {
    return {
      ok: true,
      data: {
        dryRun: true,
        request: { method: method.httpMethod, url: buildUrl(config, service.servicePath, method), body: buildBody(method, values) },
      },
    };
  }
  let token = await ensureToken(config);
  let resp = await execute(config, service.servicePath, method, token, values);
  if (resp.status === 401) {
    clearToken();
    token = await ensureToken(config, { force: true });
    resp = await execute(config, service.servicePath, method, token, values);
  }
  checkEnvelope(resp);
  return { ok: true, data: (resp.body as Record<string, unknown> | undefined)?.data };
}
