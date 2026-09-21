export type ErrorCategory = "validation" | "auth" | "network" | "upstream" | "spec";

export const EXIT_CODES: Record<ErrorCategory, number> = {
  validation: 2,
  auth: 3,
  network: 4,
  upstream: 5,
  spec: 6,
};

export interface UpstreamInfo {
  code?: unknown;
  message?: string;
}

export class SaicmotorError extends Error {
  readonly category: ErrorCategory;
  readonly hint?: string;
  readonly upstream?: UpstreamInfo;

  constructor(category: ErrorCategory, message: string, opts: { hint?: string; upstream?: UpstreamInfo } = {}) {
    super(message);
    this.name = "SaicmotorError";
    this.category = category;
    this.hint = opts.hint;
    this.upstream = opts.upstream;
  }

  get exitCode(): number {
    return EXIT_CODES[this.category];
  }
}