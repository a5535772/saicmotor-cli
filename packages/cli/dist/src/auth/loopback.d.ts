export interface CallbackParams {
    code: string;
    state: string;
}
export interface LoopbackHandle {
    port: number;
    result: Promise<CallbackParams>;
    close: () => Promise<void>;
}
export declare function startCallbackServer(opts: {
    host: string;
    port: number;
    timeoutMs: number;
}): Promise<LoopbackHandle>;
