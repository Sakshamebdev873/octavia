import type { FlowStats, LastRun, Run, RunPage, RunStatus, RunStep, RunSummary, StepStatus, StepType } from "@flowlet/shared";
import type { SQL } from "bun";
import { fromJsonText, toJsonText } from "../../db/postgres";
import type { RunResult } from "../engine/runner";
import { encodeCursor } from "./cursor";
import { isUuid, type ClaimResult, type ListRunsQuery, type RunRepository, type StartRunInput } from "./run.repository";

/** Columns of `runs` as Bun.SQL returns them (timestamptz → Date). */
interface RunRow {
  id: string;
  flow_id: string;
  status: RunStatus;
  error: string | null;
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
}

interface StepRow {
  position: number;
  type: StepType;
  status: StepStatus;
  input: string | null; // json selected as ::text
  output: string | null;
  error: string | null;
  duration_ms: number;
}

function toRunSummary(row: RunRow): RunSummary {
  return {
    id: row.id,
    flowId: row.flow_id,
    status: row.status,
    error: row.error,
    startedAt: row.started_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    durationMs: row.duration_ms,
  };
}

function toRunStep(row: StepRow): RunStep {
  return {
    position: row.position,
    type: row.type,
    status: row.status,
    input: fromJsonText(row.input),
    output: fromJsonText(row.output),
    error: row.error,
    durationMs: row.duration_ms,
  };
}

export class PostgresRunRepository implements RunRepository {
  constructor(private readonly sql: SQL) {}

  async start({ flowId, payload, startedAt }: StartRunInput): Promise<string> {
    const id = Bun.randomUUIDv7();
    await this.sql`
      INSERT INTO runs (id, flow_id, status, payload, started_at)
      VALUES (${id}::uuid, ${flowId}, 'running', ${toJsonText(payload)}::text::json, ${startedAt})`;
    return id;
  }

  async claim({ flowId, payload, startedAt, eventId }: StartRunInput & { eventId: string }): Promise<ClaimResult> {
    const id = Bun.randomUUIDv7();
    // If another delivery of this event committed first, the unique index makes this
    // insert a no-op (it waits for an in-flight insert to commit, so there is no race).
    const inserted = await this.sql<{ id: string }[]>`
      INSERT INTO runs (id, flow_id, event_id, status, payload, started_at)
      VALUES (${id}::uuid, ${flowId}, ${eventId}, 'running', ${toJsonText(payload)}::text::json, ${startedAt})
      ON CONFLICT (flow_id, event_id) WHERE event_id IS NOT NULL DO NOTHING
      RETURNING id`;
    if (inserted.length > 0) return { claimed: true, runId: id };

    const [existing] = await this.sql<{ id: string; status: RunStatus }[]>`
      SELECT id, status FROM runs WHERE flow_id = ${flowId} AND event_id = ${eventId}`;
    if (!existing) throw new Error(`Event ${eventId} conflicted but no run was found`);
    return { claimed: false, existing };
  }

  async finish(runId: string, result: RunResult, finishedAt: Date, durationMs: number): Promise<void> {
    // Readers never see a finished run with missing steps: all of it commits together.
    await this.sql.begin(async (tx) => {
      const updated = await tx<{ id: string }[]>`
        UPDATE runs
        SET status = ${result.status}, error = ${result.error},
            finished_at = ${finishedAt}, duration_ms = ${durationMs}
        WHERE id = ${runId}::uuid
        RETURNING id`;
      // The flow was deleted while its steps ran, and its runs with it. Inserting
      // the step rows would break the foreign key and turn the webhook into a 500.
      if (updated.length === 0) return;

      for (const step of result.steps) {
        await tx`
          INSERT INTO run_steps (run_id, position, type, status, input, output, error, duration_ms)
          VALUES (${runId}::uuid, ${step.position}, ${step.type}, ${step.status},
                  ${toJsonText(step.input)}::text::json, ${toJsonText(step.output)}::text::json,
                  ${step.error}, ${step.durationMs})`;
      }
    });
  }

  async listByFlow(flowId: string, { status, limit, cursor }: ListRunsQuery): Promise<RunPage> {
    const sql = this.sql;
    const byStatus = status ? sql`AND status = ${status}` : sql``;
    // Keyset pagination: continue strictly after the last (started_at, id) of the previous page.
    // The row comparison keeps the order stable when two runs share a timestamp.
    const afterCursor = cursor
      ? sql`AND (started_at, id) < (${cursor.startedAt}::timestamptz, ${cursor.id}::uuid)`
      : sql``;

    // One extra row tells us whether there is a next page, without a COUNT.
    const rows = await sql<RunRow[]>`
      SELECT id, flow_id, status, error, started_at, finished_at, duration_ms
      FROM runs
      WHERE flow_id = ${flowId} ${byStatus} ${afterCursor}
      ORDER BY started_at DESC, id DESC
      LIMIT ${limit + 1}`;

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const nextCursor = rows.length > limit && last ? encodeCursor({ startedAt: last.started_at, id: last.id }) : null;
    return { items: page.map(toRunSummary), nextCursor };
  }

  async findById(runId: string): Promise<Run | null> {
    if (!isUuid(runId)) return null;
    const [row] = await this.sql<(RunRow & { payload: string })[]>`
      SELECT id, flow_id, status, error, started_at, finished_at, duration_ms, payload::text AS payload
      FROM runs WHERE id = ${runId}::uuid`;
    if (!row) return null;

    const steps = await this.sql<StepRow[]>`
      SELECT position, type, status, input::text AS input, output::text AS output, error, duration_ms
      FROM run_steps WHERE run_id = ${runId}::uuid
      ORDER BY position`;

    return { ...toRunSummary(row), payload: fromJsonText(row.payload), steps: steps.map(toRunStep) };
  }

  async stats(flowId: string): Promise<FlowStats> {
    // Counted by PostgreSQL in one pass over the flow's index entries, not in JavaScript.
    const [row] = await this.sql<
      { total: number; success: number; failed: number; filtered: number; avg_duration_ms: number | null; last_run_at: Date | null }[]
    >`
      SELECT
        count(*)::int                                                  AS total,
        count(*) FILTER (WHERE status = 'success')::int                AS success,
        count(*) FILTER (WHERE status = 'failed')::int                 AS failed,
        count(*) FILTER (WHERE status = 'filtered')::int               AS filtered,
        round(avg(duration_ms) FILTER (WHERE status <> 'running'))::int AS avg_duration_ms,
        max(started_at)                                                AS last_run_at
      FROM runs
      WHERE flow_id = ${flowId}`;

    return {
      total: row?.total ?? 0,
      success: row?.success ?? 0,
      failed: row?.failed ?? 0,
      filtered: row?.filtered ?? 0,
      avgDurationMs: row?.avg_duration_ms ?? null,
      lastRunAt: row?.last_run_at?.toISOString() ?? null,
    };
  }

  async latestByFlowIds(flowIds: string[]): Promise<Map<string, LastRun>> {
    if (flowIds.length === 0) return new Map();
    // DISTINCT ON keeps the first row per flow in the ORDER BY: its newest run.
    const rows = await this.sql<{ flow_id: string; id: string; status: RunStatus; started_at: Date }[]>`
      SELECT DISTINCT ON (flow_id) flow_id, id, status, started_at
      FROM runs
      WHERE flow_id = ANY(${this.sql.array(flowIds, "TEXT")})
      ORDER BY flow_id, started_at DESC, id DESC`;
    return new Map(rows.map((row) => [row.flow_id, { id: row.id, status: row.status, startedAt: row.started_at.toISOString() }]));
  }

  async deleteByFlow(flowId: string): Promise<void> {
    // run_steps rows go with them through ON DELETE CASCADE.
    await this.sql`DELETE FROM runs WHERE flow_id = ${flowId}`;
  }
}
