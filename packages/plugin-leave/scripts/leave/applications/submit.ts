import type { ScriptContext, ScriptFn, RunResult } from "@saicmotor/sdk";

class UpstreamError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const submit: ScriptFn = async (ctx: ScriptContext): Promise<RunResult> => {
  console.error("[script] 请假申请前校验通过");

  if (ctx.dryRun) {
    return { ok: true as const, data: { dryRun: true, note: "script: preview" } };
  }

  const token = await ctx.ensureToken();
  const url = `${ctx.config.gateway}${ctx.service.servicePath}${ctx.method.path}`;

  const resp = await fetch(url, {
    method: ctx.method.httpMethod,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(ctx.values),
  });

  if (resp.status >= 400) {
    throw new UpstreamError("upstream", `上游 HTTP ${resp.status}`);
  }

  const json = (await resp.json()) as Record<string, unknown> | undefined;
  return { ok: true as const, data: json?.data };
};

export default submit;