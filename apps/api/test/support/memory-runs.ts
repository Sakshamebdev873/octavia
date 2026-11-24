import type { FlowStats, LastRun, Run, RunPage } from "@flowlet/shared";
import type { RunResult } from "../../src/modules/engine/runner";
import { encodeCursor } from "../../src/modules/runs/cursor";
import type { ClaimResult, ListRunsQuery, RunRepository, StartRunInput } from "../../src/modules/runs/run.repository";

/** In-memory RunRepository for API tests. Same contract as PostgresRunRepository. */
export class InMemoryRunRepository implements RunRepository {
  readonly runs = new Map<string, Run>();

  async start({ flowId, payload, startedAt }: StartRunInput): Promise<string> {
    const id = Bun.randomUUIDv7();
    this.runs.set(id, {
      id,
      flowId,
      status: "running",
      error: null,
      startedAt: startedAt.toISOString(),
      finishedAt: null,
      durationMs: null,
      payload,
      steps: [],
    });
    return id;
  }

  /** (flowId, eventId) → runId, like the partial unique index. */
  private readonly events = new Map<string, string>();

  async claim(input: StartRunInput & { eventId: string }): Promise<ClaimResult> {
    const key = JSON.stringify([input.flowId, input.eventId]);
    const existingId = this.events.get(key);
    const existing = existingId ? this.runs.get(existingId) : undefined;
    if (existing) return { claimed: false, existing: { id: existing.id, status: existing.status } };
    const runId = await this.start(input);
    this.events.set(key, runId);
    return { claimed: true, runId };
  }

  async finish(runId: string, result: RunResult, finishedAt: Date, durationMs: number): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) return; // deleted with its flow while the steps ran, like the Postgres version
    this.runs.set(runId, {
      ...run,
      status: result.status,
      error: result.error,
      finishedAt: finishedAt.toISOString(),
      durationMs,
      steps: result.steps,
    });
  }

  /** Newest first: same order as the SQL (started_at DESC, id DESC). */
  private sorted(flowId: string): Run[] {
    return [...this.runs.values()]
      .filter((run) => run.flowId === flowId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
  }

  async listByFlow(flowId: string, { status, limit, cursor }: ListRunsQuery): Promise<RunPage> {
    let runs = this.sorted(flowId).filter((run) => !status || run.status === status);
    if (cursor) {
      const t = cursor.startedAt.toISOString();
      runs = runs.filter((run) => run.startedAt < t || (run.startedAt === t && run.id < cursor.id));
    }
    const page = runs.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(({ payload: _payload, steps: _steps, ...summary }) => summary),
      nextCursor: runs.length > limit && last ? encodeCursor({ startedAt: new Date(last.startedAt), id: last.id }) : null,
    };
  }

  async findById(runId: string): Promise<Run | null> {
    const run = this.runs.get(runId);
    return run ? structuredClone(run) : null;
  }

  async stats(flowId: string): Promise<FlowStats> {
    const runs = this.sorted(flowId);
    const finished = runs.filter((run) => run.durationMs !== null);
    const count = (status: Run["status"]) => runs.filter((run) => run.status === status).length;
    return {
      total: runs.length,
      success: count("success"),
      failed: count("failed"),
      filtered: count("filtered"),
      avgDurationMs: finished.length
        ? Math.round(finished.reduce((sum, run) => sum + (run.durationMs ?? 0), 0) / finished.length)
        : null,
      lastRunAt: runs[0]?.startedAt ?? null,
    };
  }

  async latestByFlowIds(flowIds: string[]): Promise<Map<string, LastRun>> {
    const latest = new Map<string, LastRun>();
    for (const flowId of flowIds) {
      const run = this.sorted(flowId)[0];
      if (run) latest.set(flowId, { id: run.id, status: run.status, startedAt: run.startedAt });
    }
    return latest;
  }

  async deleteByFlow(flowId: string): Promise<void> {
    for (const [id, run] of this.runs) if (run.flowId === flowId) this.runs.delete(id);
  }
}
