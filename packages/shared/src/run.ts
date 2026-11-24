import { z } from "zod";
import type { JsonValue } from "./json";
import type { StepType } from "./step";

/** `running` exists only between the start of a run and its final write. */
export const RUN_STATUSES = ["running", "success", "filtered", "failed"] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

/** The three statuses a finished run can have. */
export type FinalRunStatus = Exclude<RunStatus, "running">;

export const STEP_STATUSES = ["success", "failed", "skipped"] as const;
export const stepStatusSchema = z.enum(STEP_STATUSES);
export type StepStatus = z.infer<typeof stepStatusSchema>;

export const RUN_LIST_DEFAULT_LIMIT = 20;
export const RUN_LIST_MAX_LIMIT = 100;

/** Query of GET /api/flows/:id/runs. A limit above 100 is clamped to 100. */
export const runListQuerySchema = z.object({
  status: z.enum(RUN_STATUSES, { error: "Status must be running, success, filtered or failed" }).optional(),
  limit: z.coerce
    .number({ error: "Limit must be a number" })
    .int("Limit must be a whole number")
    .min(1, "Limit must be at least 1")
    .transform((limit) => Math.min(limit, RUN_LIST_MAX_LIMIT))
    .default(RUN_LIST_DEFAULT_LIMIT),
  cursor: z.string().min(1, "Cursor must not be empty").optional(),
});
export type RunListQuery = z.output<typeof runListQuerySchema>;

/** One step record of a run. */
export interface RunStep {
  position: number;
  type: StepType;
  status: StepStatus;
  input: JsonValue | null;
  output: JsonValue | null;
  error: string | null;
  durationMs: number;
}

/** A run as listed in the run history (no payload, no steps). */
export interface RunSummary {
  id: string;
  flowId: string;
  status: RunStatus;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
}

/** GET /api/runs/:runId */
export interface Run extends RunSummary {
  payload: JsonValue;
  steps: RunStep[];
}

/** GET /api/flows/:id/runs */
export interface RunPage {
  items: RunSummary[];
  nextCursor: string | null;
}

/** GET /api/flows/:id/stats */
export interface FlowStats {
  total: number;
  success: number;
  failed: number;
  filtered: number;
  avgDurationMs: number | null;
  lastRunAt: string | null;
}

/** POST /api/hooks/:flowId */
export interface TriggerResponse {
  runId: string;
  status: FinalRunStatus;
}
