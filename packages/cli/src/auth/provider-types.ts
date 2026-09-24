export interface AuthProvider {
  login(): Promise<string>;
}
