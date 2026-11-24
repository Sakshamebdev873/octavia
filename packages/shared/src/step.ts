import { z } from "zod";

/** Object keys that must never be used as data keys (prototype pollution). */
export const RESERVED_KEYS: ReadonlySet<string> = new Set(["__proto__", "constructor", "prototype"]);

/** A dot path such as `order.customer.email` or `items.0.sku`. */
export const dotPathSchema = z
  .string()
  .trim()
  .min(1, "Path is required")
  .max(200, "Path must be at most 200 characters")
  .regex(/^[^.\s]+(\.[^.\s]+)*$/, "Use a dot path such as order.amount")
  .refine(
    (path) => path.split(".").every((segment) => !RESERVED_KEYS.has(segment)),
    "Path uses a reserved name",
  );

export const FILTER_OPERATORS = ["eq", "neq", "gt", "lt", "contains"] as const;
export const filterOperatorSchema = z.enum(FILTER_OPERATORS);
export type FilterOperator = z.infer<typeof filterOperatorSchema>;

export const filterValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type FilterValue = z.infer<typeof filterValueSchema>;

export const filterStepSchema = z
  .strictObject({
    type: z.literal("filter"),
    field: dotPathSchema,
    operator: filterOperatorSchema,
    value: filterValueSchema,
  })
  .refine(
    (step) => (step.operator === "gt" || step.operator === "lt" ? Number.isFinite(step.value) : true),
    { path: ["value"], message: "gt and lt need a number" },
  );

/** An output field name of a transform mapping. */
export const outputKeySchema = z
  .string()
  .trim()
  .min(1, "Output field is required")
  .max(100, "Output field must be at most 100 characters")
  .refine((key) => !RESERVED_KEYS.has(key), "This name is reserved");

export const MAX_MAPPING_FIELDS = 50;

export const transformStepSchema = z.strictObject({
  type: z.literal("transform"),
  mapping: z
    .record(outputKeySchema, dotPathSchema)
    .refine((mapping) => Object.keys(mapping).length >= 1, "Add at least one field")
    .refine(
      (mapping) => Object.keys(mapping).length <= MAX_MAPPING_FIELDS,
      `At most ${MAX_MAPPING_FIELDS} fields`,
    ),
});

export const HTTP_METHODS = ["POST", "PUT"] as const;

export const httpRequestStepSchema = z.strictObject({
  type: z.literal("http_request"),
  url: z.url({ protocol: /^https?$/, error: "Enter an http or https URL" }),
  method: z.enum(HTTP_METHODS, { error: "Method must be POST or PUT" }),
});

export const STEP_TYPES = ["filter", "transform", "http_request"] as const;
export const stepTypeSchema = z.enum(STEP_TYPES);
export type StepType = z.infer<typeof stepTypeSchema>;

export const stepSchema = z.discriminatedUnion("type", [
  filterStepSchema,
  transformStepSchema,
  httpRequestStepSchema,
]);

export type FilterStep = z.infer<typeof filterStepSchema>;
export type TransformStep = z.infer<typeof transformStepSchema>;
export type HttpRequestStep = z.infer<typeof httpRequestStepSchema>;
export type Step = z.infer<typeof stepSchema>;

export const MIN_STEPS = 1;
export const MAX_STEPS = 5;
