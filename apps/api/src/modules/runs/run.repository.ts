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

/** Storage for run history. PostgresRunRepository in production, an in-memory one in tests. */
export interface RunRepository extends FlowRunsPort {
  /** Inserts the run with status `running` and returns its id. */
  start(input: StartRunInput): Promise<string>;
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
