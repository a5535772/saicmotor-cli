import { z } from "zod";

export const FieldSchema = z.object({
  type: z.enum(["string", "integer", "number", "boolean"]),
  description: z.string().optional(),
  required: z.boolean().optional(),
  example: z.unknown().optional(),
});

export const MethodSchema = z.object({
  id: z.string(),
  path: z.string(),
  httpMethod: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
  description: z.string().optional(),
  requestBody: z.record(z.string(), FieldSchema).optional(),
  responseBody: z.record(z.string(), FieldSchema).optional(),
});

export const ResourceSchema = z.object({
  methods: z.record(z.string(), MethodSchema),
});

export const ServiceSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  servicePath: z.string(),
  resources: z.record(z.string(), ResourceSchema),
});

export type Field = z.infer<typeof FieldSchema>;
export type Method = z.infer<typeof MethodSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Service = z.infer<typeof ServiceSchema>;
