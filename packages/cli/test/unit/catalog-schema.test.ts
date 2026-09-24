import { describe, it, expect } from "vitest";
import { ServiceSchema } from "../../src/schema/catalog";

const valid = {
  name: "leave",
  servicePath: "/leave",
  resources: {
    balance: {
      methods: {
        query: {
          id: "balance.query",
          path: "/balance",
          httpMethod: "GET",
          responseBody: { annual_balance: { type: "integer", example: 5 } },
        },
      },
    },
    applications: {
      methods: {
        submit: {
          id: "applications.submit",
          path: "/applications",
          httpMethod: "POST",
          requestBody: { start_date: { type: "string", required: true } },
        },
      },
    },
  },
};

describe("ServiceSchema", () => {
  it("accepts a valid service", () => {
    expect(ServiceSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects missing servicePath", () => {
    const { servicePath, ...rest } = valid;
    expect(ServiceSchema.safeParse(rest).success).toBe(false);
  });
  it("rejects unknown httpMethod", () => {
    const bad = { ...valid, resources: { balance: { methods: { query: { ...valid.resources.balance.methods.query, httpMethod: "FOO" } } } } };
    expect(ServiceSchema.safeParse(bad).success).toBe(false);
  });
});
