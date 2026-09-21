import type { ScriptContext } from "../../../src/engine/script";
import { buildUrl, buildBody } from "../../../src/engine/request";
import { applyAuth } from "../../../src/auth/transport";
import { send } from "../../../src/engine/http";
import { SaicmotorError } from "../../../src/engine/errors";

export default async function submit(ctx: ScriptContext) {
  console.error("[script] 请假申请前校验通过");

  if (ctx.dryRun) {
    return { ok: true as const, data: { dryRun: true, note: "script: preview" } };
  }

  const token = await ctx.ensureToken();
  const url = buildUrl(ctx.config, ctx.service.servicePath, ctx.method);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  applyAuth(headers, ctx.config, token);
  const resp = await send({
    method: ctx.method.httpMethod,
    url,
    headers,
    body: buildBody(ctx.method, ctx.values),
  });
  if (resp.status >= 400) {
    throw new SaicmotorError("upstream", `上游 HTTP ${resp.status}`);
  }
  return { ok: true as const, data: (resp.body as Record<string, unknown> | undefined)?.data };
}