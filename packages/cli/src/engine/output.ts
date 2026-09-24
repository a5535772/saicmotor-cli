import { SaicmotorError } from "./errors";

export function toTableRows(data: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(data)) return data as Array<Record<string, unknown>>;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const inner = obj.data as Record<string, unknown> | undefined;
    if (inner && Array.isArray(inner.list)) return inner.list as Array<Record<string, unknown>>;
    if (Array.isArray(obj.list)) return obj.list as Array<Record<string, unknown>>;
  }
  throw new SaicmotorError("validation", "表格输出需要数组数据");
}

export function formatTable(data: unknown): string {
  const rows = toTableRows(data);
  if (rows.length === 0) return "(空)";
  const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const sep = "  |  ";
  const header = keys.join(sep);
  const rule = keys.map((k) => "-".repeat(k.length)).join(sep);
  const bodyRows = rows.map((r) => keys.map((k) => String(r[k] ?? "")).join(sep));
  return [header, rule, ...bodyRows].join("\n");
}

export function formatJson(value: unknown, pretty = false): string {
  return JSON.stringify(value, null, pretty ? 2 : undefined);
}

export function formatEnvelope(ok: boolean, data?: unknown, error?: unknown): string {
  return ok
    ? `${JSON.stringify({ ok: true, data: data ?? null })}\n`
    : `${JSON.stringify({ ok: false, error: error ?? null })}\n`;
}
