import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    env: { SAICMOTOR_AUTH_TYPE: "password" }, // 测试默认 password，避免 exchange loopback
  },
});