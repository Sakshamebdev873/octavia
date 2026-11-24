# Module: `@flowlet/shared`

**Purpose:** one source of truth for every shape that crosses the network. The API validates
requests with these schemas. The web form validates input with the **same** schemas, so a rule
like "name is 3 to 80 characters" exists in exactly one place.

**Phase:** 1 · **Location:** `packages/shared/src`

## Files

| File | Exports |
| --- | --- |
| `step.ts` | `dotPathSchema`, `filterStepSchema`, `transformStepSchema`, `httpRequestStepSchema`, `stepSchema`, `Step`, `FilterOperator`, `StepType` |
| `flow.ts` | `createFlowSchema`, `updateFlowSchema`, `CreateFlowInput`, `UpdateFlowInput`, `Flow`, `FlowSummary` |
| `run.ts` | `runStatusSchema`, `stepStatusSchema`, `runListQuerySchema`, `Run`, `RunSummary`, `RunStep`, `RunPage`, `FlowStats`, `TriggerResponse` |
| `error.ts` | `ErrorCode`, `ApiErrorBody`, `ValidationIssue` |

## Step schemas

```ts
export const dotPathSchema = z
  .string()
  .trim()
  .min(1, "Path is required")
  .max(200)
  .regex(/^[^.\s]+(\.[^.\s]+)*$/, "Use a dot path such as order.amount");

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const filterStepSchema = z
  .object({
    type: z.literal("filter"),
    field: dotPathSchema,
    operator: z.enum(["eq", "neq", "gt", "lt", "contains"]),
    value: scalar,
  })
  .refine(
    (s) => (s.operator === "gt" || s.operator === "lt" ? typeof s.value === "number" : true),
    { path: ["value"], message: "gt and lt need a number" },
  );

export const transformStepSchema = z.object({
  type: z.literal("transform"),
  mapping: z
    .record(outputKeySchema, dotPathSchema)
    .refine((m) => Object.keys(m).length >= 1, "Add at least one field")
    .refine((m) => Object.keys(m).length <= 50, "At most 50 fields"),
});

export const httpRequestStepSchema = z.object({
  type: z.literal("http_request"),
  url: z.url({ protocol: /^https?$/ , error: "Enter an http or https URL" }),
  method: z.enum(["POST", "PUT"]),
});

export const stepSchema = z.discriminatedUnion("type", [
  filterStepSchema, transformStepSchema, httpRequestStepSchema,
]);
export type Step = z.infer<typeof stepSchema>;
```

`outputKeySchema` rejects empty keys and the reserved names `__proto__`, `constructor` and
`prototype`.

Steps are **flat** objects (`{ type, field, operator, value }`), exactly as in the brief's
example. They are not nested under a `config` key.

## Flow schemas

```ts
export const createFlowSchema = z.object({
  name: z.string().trim()
    .min(3, "Name must be at least 3 characters")
    .max(80, "Name must be at most 80 characters"),
  description: z.string().trim().max(500).nullish().transform((d) => d || null),
  enabled: z.boolean().default(true),
  steps: z.array(stepSchema)
    .min(1, "Add at least one step")
    .max(5, "A flow can have at most 5 steps"),
}).strict();             // unknown keys such as webhookSecret are rejected

export const updateFlowSchema = createFlowSchema.partial()
  .refine((u) => Object.keys(u).length > 0, "Nothing to update");
```

Response types (the server builds these, so they are plain TS types, not schemas):

```ts
export interface Flow {
  id: string; name: string; description: string | null; enabled: boolean;
  steps: Step[]; webhookSecret: string; createdAt: string; updatedAt: string;
}
export interface FlowSummary {
  id: string; name: string; description: string | null; enabled: boolean;
  stepCount: number; createdAt: string; updatedAt: string;
  lastRun: { id: string; status: RunStatus; startedAt: string } | null;
}
```

## Run types

```ts
export const runStatusSchema = z.enum(["running", "success", "filtered", "failed"]);
export const stepStatusSchema = z.enum(["success", "failed", "skipped"]);

export const runListQuerySchema = z.object({
  status: z.enum(["success", "filtered", "failed", "running"]).optional(),
  limit: z.coerce.number().int().min(1).default(20).transform((n) => Math.min(n, 100)),
  cursor: z.string().min(1).optional(),
});

export interface RunStep {
  position: number; type: StepType; status: StepStatus;
  input: JsonValue | null; output: JsonValue | null; error: string | null; durationMs: number;
}
export interface RunSummary {
  id: string; flowId: string; status: RunStatus; error: string | null;
  startedAt: string; finishedAt: string | null; durationMs: number | null;
}
export interface Run extends RunSummary { payload: JsonValue; steps: RunStep[] }
export interface RunPage { items: RunSummary[]; nextCursor: string | null }
export interface FlowStats {
  total: number; success: number; failed: number; filtered: number;
  avgDurationMs: number | null; lastRunAt: string | null;
}
export interface TriggerResponse { runId: string; status: "success" | "filtered" | "failed" }
```

`JsonValue` is a recursive type (`string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }`).
It is used instead of `any` or `unknown` wherever we hold user JSON.

## Errors

```ts
export type ErrorCode =
  | "VALIDATION_ERROR" | "INVALID_JSON" | "INVALID_SIGNATURE" | "NOT_FOUND"
  | "FLOW_DISABLED" | "PAYLOAD_TOO_LARGE" | "INTERNAL_ERROR";

export interface ValidationIssue { path: string; message: string }   // path like "steps.0.value"
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; details: { issues?: ValidationIssue[] } & Record<string, unknown> };
}
```

The form uses `issues[].path` to put each message next to the matching input.

## Tests

- Names of 2 and 81 characters fail, 3 and 80 pass.
- 0 and 6 steps fail.
- `gt` with `"1000"` fails, with `1000` passes.
- `method: "GET"` and `url: "ftp://x"` fail.
- A mapping key `__proto__` fails.
