export type ErrorCategory = "validation" | "auth" | "network" | "upstream" | "spec";
export declare const EXIT_CODES: Record<ErrorCategory, number>;
export interface UpstreamInfo {
    code?: unknown;
    message?: string;
}
export declare class SaicmotorError extends Error {
    readonly category: ErrorCategory;
    readonly hint?: string;
    readonly upstream?: UpstreamInfo;
    constructor(category: ErrorCategory, message: string, opts?: {
        hint?: string;
        upstream?: UpstreamInfo;
    });
    get exitCode(): number;
}
