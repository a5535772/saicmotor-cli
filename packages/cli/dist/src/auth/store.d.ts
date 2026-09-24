export interface Credentials {
    username: string;
    password: string;
}
export declare function writeCredentials(creds: Credentials): void;
export declare function readCredentials(): Credentials | undefined;
export declare function clearCredentials(): void;
export declare function writeToken(token: string): void;
export declare function readToken(): string | undefined;
export declare function clearToken(): void;
