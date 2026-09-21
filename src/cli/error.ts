import { SaicmotorError } from "../engine/errors";
import { formatEnvelope } from "../engine/output";

export function handleError(e: unknown): void {
  if (e instanceof SaicmotorError) {
    console.error(formatEnvelope(false, undefined, { type: e.category, message: e.message, hint: e.hint, upstream: e.upstream }));
    process.exit(e.exitCode);
  }
  console.error(String(e));
  process.exit(1);
}
