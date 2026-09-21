import { SaicmotorError } from "./errors";

export interface HttpRequestInput {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  rawBody: string;
}

export async function send(input: HttpRequestInput, opts: { timeoutMs?: number } = {}): Promise<HttpResponse> {
  const timeoutMs = opts.timeoutMs ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let status = 0;
  let rawBody = "";
  const headers: Record<string, string> = {};
  try {
    const res = await fetch(input.url, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      signal: controller.signal,
      redirect: "manual",
    });
    status = res.status;
    res.headers.forEach((v, k) => {
      const key = k.toLowerCase();
      if (key === "set-cookie") headers[key] = headers[key] ? headers[key] + "; " + v : v;
      else headers[key] = v;
    });
    rawBody = await res.text();
  } catch (err) {
    throw new SaicmotorError("network", `请求失败: ${input.method} ${input.url} — ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = rawBody;
  if ((headers["content-type"] ?? "").toLowerCase().includes("application/json")) {
    try { body = JSON.parse(rawBody); } catch { /* keep raw */ }
  }
  return { status, headers, body, rawBody };
}
