import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: { SAICMOTOR_AUTH_TYPE: "password" },
  },
  cacheDir: "../.vitest-cache",
});