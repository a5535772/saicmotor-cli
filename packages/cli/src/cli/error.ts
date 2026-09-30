import { type SaicmotorError } from "@saicmotor/sdk";
import { formatEnvelope } from "../engine/output";

/** 结构判断：跨包（插件与 CLI 各有一份 @saicmotor/sdk）时 instanceof 会失灵，认 category + exitCode */
export function isSaicmotorError(e: unknown): e is SaicmotorError {
  return (
    typeof e === "object" && e !== null &&
    typeof (e as { category?: unknown }).category === "string" &&
    typeof (e as { exitCode?: unknown }).exitCode === "number"
  );
}

export function handleError(e: unknown): void {
  if (isSaicmotorError(e)) {
    console.error(formatEnvelope(false, undefined, { type: e.category, message: e.message, hint: e.hint, upstream: e.upstream }));
    process.exit(e.exitCode);
    return;
  }
  console.error(String(e));
  process.exit(1);
}
