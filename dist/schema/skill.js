"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillSchema = exports.ResponseContractSchema = exports.CommandSchema = exports.AuthSchema = exports.RequestSchema = exports.ParamSchema = void 0;
const zod_1 = require("zod");
exports.ParamSchema = zod_1.z.object({
    name: zod_1.z.string(),
    type: zod_1.z.enum(["string", "number", "date", "enum", "bool"]),
    required: zod_1.z.boolean().optional(),
    values: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
    default: zod_1.z.union([zod_1.z.string(), zod_1.z.number()]).optional(),
});
exports.RequestSchema = zod_1.z.object({
    method: zod_1.z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]),
    path: zod_1.z.string(),
    headers: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).optional(),
    body: zod_1.z.union([zod_1.z.string(), zod_1.z.record(zod_1.z.string(), zod_1.z.any())]).optional(),
});
exports.AuthSchema = zod_1.z.object({
    type: zod_1.z.literal("password"),
    loginRequest: zod_1.z.string(),
    sessionFrom: zod_1.z.enum(["cookie", "header"]),
    sessionKey: zod_1.z.string(),
    prompt: zod_1.z.object({ username: zod_1.z.string().optional(), password: zod_1.z.string().optional() }).optional(),
});
exports.CommandSchema = zod_1.z.object({
    name: zod_1.z.string(),
    verb: zod_1.z.string().optional(),
    request: zod_1.z.string(),
    effect: zod_1.z.enum(["read", "write"]).default("read"),
    params: zod_1.z.array(exports.ParamSchema).default([]),
});
exports.ResponseContractSchema = zod_1.z.object({
    success: zod_1.z.object({
        http: zod_1.z.array(zod_1.z.number()).optional(),
        path: zod_1.z.string().optional(),
        equals: zod_1.z.unknown().optional(),
    }).optional(),
    errorMessagePath: zod_1.z.string().optional(),
}).optional();
exports.SkillSchema = zod_1.z.object({
    name: zod_1.z.string(),
    displayName: zod_1.z.string().optional(),
    version: zod_1.z.string().optional(),
    baseUrl: zod_1.z.string(),
    auth: exports.AuthSchema,
    requests: zod_1.z.record(zod_1.z.string(), exports.RequestSchema),
    responseContract: exports.ResponseContractSchema,
    commands: zod_1.z.array(exports.CommandSchema),
});
//# sourceMappingURL=skill.js.map