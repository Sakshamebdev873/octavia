import type { FlowStats, JsonValue, Run, RunPage, RunStatus } from "@flowlet/shared";
import type { RunResult } from "../engine/runner";
import type { FlowRunsPort } from "../flows/flow.repository";
import type { RunCursor } from "./cursor";

export interface StartRunInput {
  flowId: string;
  payload: JsonValue;
  startedAt: Date;
}

export interface ListRunsQuery {
  status?: RunStatus;
  limit: number;
  cursor?: RunCursor;
}

/** Result of claiming an event id: either this delivery owns the run, or an earlier one does. */
export type ClaimResult =
  | { claimed: true; runId: string }
  | { claimed: false; existing: { id: string; status: RunStatus } };

/** Storage for run history. PostgresRunRepository in production, an in-memory one in tests. */
export interface RunRepository extends FlowRunsPort {
  /** Inserts the run with status `running` and returns its id. */
  start(input: StartRunInput): Promise<string>;
  /**
   * Like start, but at most once per (flow, event id). The insert itself is the
   * lock: a unique index makes a second delivery lose, even when both arrive at once.
   */
  claim(input: StartRunInput & { eventId: string }): Promise<ClaimResult>;
  /** Writes all step records and the final status in one transaction. */
  finish(runId: string, result: RunResult, finishedAt: Date, durationMs: number): Promise<void>;
  /** Newest first, keyset paginated. */
  listByFlow(flowId: string, query: ListRunsQuery): Promise<RunPage>;
  /** null for an unknown or malformed id. */
  findById(runId: string): Promise<Run | null>;
  stats(flowId: string): Promise<FlowStats>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);
