import { z } from "zod";
import type { RunStatus } from "./run";
import { MAX_STEPS, MIN_STEPS, stepSchema, type Step } from "./step";

export const NAME_MIN = 3;
export const NAME_MAX = 80;
export const DESCRIPTION_MAX = 500;

const nameSchema = z
  .string({ error: "Name is required" })
  .trim()
  .min(NAME_MIN, `Name must be at least ${NAME_MIN} characters`)
  .max(NAME_MAX, `Name must be at most ${NAME_MAX} characters`);

/** An empty description is stored as null. */
const descriptionSchema = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX, `Description must be at most ${DESCRIPTION_MAX} characters`)
  .nullable()
  .transform((value) => (value === "" ? null : value));

const stepsSchema = z
  .array(stepSchema, { error: "Steps must be a list" })
  .min(MIN_STEPS, "Add at least one step")
  .max(MAX_STEPS, `A flow can have at most ${MAX_STEPS} steps`);

/**
 * Body of POST /api/flows. Strict: unknown keys (for example `webhookSecret`)
 * are rejected, so a client can never choose or overwrite the secret.
 */
export const createFlowSchema = z.strictObject({
  name: nameSchema,
  description: descriptionSchema.optional(),
  enabled: z.boolean({ error: "Enabled must be true or false" }).default(true),
  steps: stepsSchema,
});

/**
 * Body of PATCH /api/flows/:id. Every field is optional, but at least one is
 * required. Built from the field schemas, not with `.partial()`, so that the
 * `enabled` default from create never leaks into an update.
 */
export const updateFlowSchema = z
  .strictObject({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    enabled: z.boolean({ error: "Enabled must be true or false" }).optional(),
    steps: stepsSchema.optional(),
  })
  .refine((patch) => Object.values(patch).some((value) => value !== undefined), "Nothing to update");

export type CreateFlowInput = z.output<typeof createFlowSchema>;
export type CreateFlowRequest = z.input<typeof createFlowSchema>;
export type UpdateFlowInput = z.output<typeof updateFlowSchema>;

/** GET /api/flows/:id */
export interface Flow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  steps: Step[];
  webhookSecret: string;
  createdAt: string;
  updatedAt: string;
}

export interface LastRun {
  id: string;
  status: RunStatus;
  startedAt: string;
}

/** One item of GET /api/flows: no steps and no secret. */
export interface FlowSummary {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  stepCount: number;
  createdAt: string;
  updatedAt: string;
  lastRun: LastRun | null;
}
