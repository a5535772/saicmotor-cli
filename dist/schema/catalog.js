"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceSchema = exports.ResourceSchema = exports.MethodSchema = exports.FieldSchema = void 0;
const zod_1 = require("zod");
exports.FieldSchema = zod_1.z.object({
    type: zod_1.z.enum(["string", "integer", "number", "boolean"]),
    description: zod_1.z.string().optional(),
    required: zod_1.z.boolean().optional(),
    example: zod_1.z.unknown().optional(),
});
exports.MethodSchema = zod_1.z.object({
    id: zod_1.z.string(),
    path: zod_1.z.string(),
    httpMethod: zod_1.z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
    description: zod_1.z.string().optional(),
    requestBody: zod_1.z.record(zod_1.z.string(), exports.FieldSchema).optional(),
    responseBody: zod_1.z.record(zod_1.z.string(), exports.FieldSchema).optional(),
});
exports.ResourceSchema = zod_1.z.object({
    methods: zod_1.z.record(zod_1.z.string(), exports.MethodSchema),
});
exports.ServiceSchema = zod_1.z.object({
    name: zod_1.z.string(),
    title: zod_1.z.string().optional(),
    description: zod_1.z.string().optional(),
    servicePath: zod_1.z.string(),
    resources: zod_1.z.record(zod_1.z.string(), exports.ResourceSchema),
});
//# sourceMappingURL=catalog.js.map