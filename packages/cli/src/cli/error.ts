import { SaicmotorError } from "../engine/errors";
import { formatEnvelope } from "../engine/output";

export function handleError(e: unknown): void {
  if (e instanceof SaicmotorError) {
    console.error(formatEnvelope(false, undefined, { type: e.category, message: e.message, hint: e.hint, upstream: e.upstream }));
    process.exit(e.exitCode);
    return; // 防御：若 process.exit 被 mock 未立即退出，阻止穿透到 fallback
  }
  console.error(String(e));
  process.exit(1);
}
