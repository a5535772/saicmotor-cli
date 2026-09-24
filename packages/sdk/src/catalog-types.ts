/** catalog schema 类型——与 packages/cli/src/schema/catalog.ts 保持同步 */
export interface Field {
  type: "string" | "integer" | "number" | "boolean";
  description?: string;
  required?: boolean;
  example?: unknown;
}

export interface Method {
  id: string;
  path: string;
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  description?: string;
  requestBody?: Record<string, Field>;
  responseBody?: Record<string, Field>;
}

export interface Resource {
  methods: Record<string, Method>;
}

export interface Service {
  name: string;
  title?: string;
  description?: string;
  servicePath: string;
  resources: Record<string, Resource>;
}