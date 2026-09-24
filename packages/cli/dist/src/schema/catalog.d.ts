import { z } from "zod";
export declare const FieldSchema: z.ZodObject<{
    type: z.ZodEnum<["string", "integer", "number", "boolean"]>;
    description: z.ZodOptional<z.ZodString>;
    required: z.ZodOptional<z.ZodBoolean>;
    example: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    type: "string" | "number" | "boolean" | "integer";
    description?: string | undefined;
    required?: boolean | undefined;
    example?: unknown;
}, {
    type: "string" | "number" | "boolean" | "integer";
    description?: string | undefined;
    required?: boolean | undefined;
    example?: unknown;
}>;
export declare const MethodSchema: z.ZodObject<{
    id: z.ZodString;
    path: z.ZodString;
    httpMethod: z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>;
    description: z.ZodOptional<z.ZodString>;
    requestBody: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        type: z.ZodEnum<["string", "integer", "number", "boolean"]>;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        example: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        type: "string" | "number" | "boolean" | "integer";
        description?: string | undefined;
        required?: boolean | undefined;
        example?: unknown;
    }, {
        type: "string" | "number" | "boolean" | "integer";
        description?: string | undefined;
        required?: boolean | undefined;
        example?: unknown;
    }>>>;
    responseBody: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        type: z.ZodEnum<["string", "integer", "number", "boolean"]>;
        description: z.ZodOptional<z.ZodString>;
        required: z.ZodOptional<z.ZodBoolean>;
        example: z.ZodOptional<z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        type: "string" | "number" | "boolean" | "integer";
        description?: string | undefined;
        required?: boolean | undefined;
        example?: unknown;
    }, {
        type: "string" | "number" | "boolean" | "integer";
        description?: string | undefined;
        required?: boolean | undefined;
        example?: unknown;
    }>>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    id: string;
    httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    description?: string | undefined;
    requestBody?: Record<string, {
        type: "string" | "number" | "boolean" | "integer";
        description?: string | undefined;
        required?: boolean | undefined;
        example?: unknown;
    }> | undefined;
    responseBody?: Record<string, {
        type: "string" | "number" | "boolean" | "integer";
        description?: string | undefined;
        required?: boolean | undefined;
        example?: unknown;
    }> | undefined;
}, {
    path: string;
    id: string;
    httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    description?: string | undefined;
    requestBody?: Record<string, {
        type: "string" | "number" | "boolean" | "integer";
        description?: string | undefined;
        required?: boolean | undefined;
        example?: unknown;
    }> | undefined;
    responseBody?: Record<string, {
        type: "string" | "number" | "boolean" | "integer";
        description?: string | undefined;
        required?: boolean | undefined;
        example?: unknown;
    }> | undefined;
}>;
export declare const ResourceSchema: z.ZodObject<{
    methods: z.ZodRecord<z.ZodString, z.ZodObject<{
        id: z.ZodString;
        path: z.ZodString;
        httpMethod: z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>;
        description: z.ZodOptional<z.ZodString>;
        requestBody: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            type: z.ZodEnum<["string", "integer", "number", "boolean"]>;
            description: z.ZodOptional<z.ZodString>;
            required: z.ZodOptional<z.ZodBoolean>;
            example: z.ZodOptional<z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }>>>;
        responseBody: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            type: z.ZodEnum<["string", "integer", "number", "boolean"]>;
            description: z.ZodOptional<z.ZodString>;
            required: z.ZodOptional<z.ZodBoolean>;
            example: z.ZodOptional<z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }>>>;
    }, "strip", z.ZodTypeAny, {
        path: string;
        id: string;
        httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
        description?: string | undefined;
        requestBody?: Record<string, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }> | undefined;
        responseBody?: Record<string, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }> | undefined;
    }, {
        path: string;
        id: string;
        httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
        description?: string | undefined;
        requestBody?: Record<string, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }> | undefined;
        responseBody?: Record<string, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }> | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    methods: Record<string, {
        path: string;
        id: string;
        httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
        description?: string | undefined;
        requestBody?: Record<string, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }> | undefined;
        responseBody?: Record<string, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }> | undefined;
    }>;
}, {
    methods: Record<string, {
        path: string;
        id: string;
        httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
        description?: string | undefined;
        requestBody?: Record<string, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }> | undefined;
        responseBody?: Record<string, {
            type: "string" | "number" | "boolean" | "integer";
            description?: string | undefined;
            required?: boolean | undefined;
            example?: unknown;
        }> | undefined;
    }>;
}>;
export declare const ServiceSchema: z.ZodObject<{
    name: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    servicePath: z.ZodString;
    resources: z.ZodRecord<z.ZodString, z.ZodObject<{
        methods: z.ZodRecord<z.ZodString, z.ZodObject<{
            id: z.ZodString;
            path: z.ZodString;
            httpMethod: z.ZodEnum<["GET", "POST", "PUT", "DELETE", "PATCH"]>;
            description: z.ZodOptional<z.ZodString>;
            requestBody: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
                type: z.ZodEnum<["string", "integer", "number", "boolean"]>;
                description: z.ZodOptional<z.ZodString>;
                required: z.ZodOptional<z.ZodBoolean>;
                example: z.ZodOptional<z.ZodUnknown>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }>>>;
            responseBody: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
                type: z.ZodEnum<["string", "integer", "number", "boolean"]>;
                description: z.ZodOptional<z.ZodString>;
                required: z.ZodOptional<z.ZodBoolean>;
                example: z.ZodOptional<z.ZodUnknown>;
            }, "strip", z.ZodTypeAny, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }>>>;
        }, "strip", z.ZodTypeAny, {
            path: string;
            id: string;
            httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            description?: string | undefined;
            requestBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
            responseBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
        }, {
            path: string;
            id: string;
            httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            description?: string | undefined;
            requestBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
            responseBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        methods: Record<string, {
            path: string;
            id: string;
            httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            description?: string | undefined;
            requestBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
            responseBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
        }>;
    }, {
        methods: Record<string, {
            path: string;
            id: string;
            httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            description?: string | undefined;
            requestBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
            responseBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
        }>;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    servicePath: string;
    resources: Record<string, {
        methods: Record<string, {
            path: string;
            id: string;
            httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            description?: string | undefined;
            requestBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
            responseBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
        }>;
    }>;
    description?: string | undefined;
    title?: string | undefined;
}, {
    name: string;
    servicePath: string;
    resources: Record<string, {
        methods: Record<string, {
            path: string;
            id: string;
            httpMethod: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
            description?: string | undefined;
            requestBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
            responseBody?: Record<string, {
                type: "string" | "number" | "boolean" | "integer";
                description?: string | undefined;
                required?: boolean | undefined;
                example?: unknown;
            }> | undefined;
        }>;
    }>;
    description?: string | undefined;
    title?: string | undefined;
}>;
export type Field = z.infer<typeof FieldSchema>;
export type Method = z.infer<typeof MethodSchema>;
export type Resource = z.infer<typeof ResourceSchema>;
export type Service = z.infer<typeof ServiceSchema>;
