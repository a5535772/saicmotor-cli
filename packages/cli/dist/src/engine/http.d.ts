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
export declare function send(input: HttpRequestInput, opts?: {
    timeoutMs?: number;
}): Promise<HttpResponse>;
