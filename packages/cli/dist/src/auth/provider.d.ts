import type { Config } from "../config";
import type { AuthProvider } from "./provider-types";
export type { AuthProvider } from "./provider-types";
export declare function createAuthProvider(config: Config): AuthProvider;
