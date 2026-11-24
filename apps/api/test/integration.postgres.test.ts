/**
 * Runs the real SQL against the PostgreSQL from docker compose (after `bun run migrate`).
 * Uses unique flow ids and deletes its rows afterwards. Skipped if PostgreSQL is unreachable.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { SQL } from "bun";
import { loadConfig } from "../src/config";
import type { RunResult } from "../src/modules/engine/runner";
import { decodeCursor } from "../src/modules/runs/cursor";
import { PostgresRunRepository } from "../src/modules/runs/run.postgres";

const sql = new SQL({ url: loadConfig().DATABASE_URL, max: 4, connectionTimeout: 2 });
const reachable = await sql`SELECT 1`.then(
  () => true,
  () => false,
);
if (!reachable) console.warn("PostgreSQL is not reachable: skipping Postgres integration tests (run docker compose up -d)");

const repo = new PostgresRunRepository(sql);
const flowA = `test-${Bun.randomUUIDv7()}`;
const flowB = `test-${Bun.randomUUIDv7()}`;

afterAll(async () => {
  if (reachable) await sql`DELETE FROM runs WHERE flow_id IN (${flowA}, ${flowB})`;
  await sql.close();
});

const success = (steps: RunResult["steps"] = []): RunResult => ({ status: "success", error: null, steps });

describe.skipIf(!reachable)("PostgresRunRepository", () => {
  test("stores a run and its steps, keeping every JSON type", async () => {
    const payload = { order: { id: "ORD-1", amount: 4999 }, tags: ["a"], note: null };
    const id = await repo.start({ flowId: flowA, payload, startedAt: new Date() });
    await repo.finish(
      id,
      success([
        { position: 1, type: "filter", status: "success", input: payload, output: { passed: true, actual: 4999 }, error: null, durationMs: 1 },
        { position: 2, type: "transform", status: "success", input: payload, output: "just a string", error: null, durationMs: 0 },
        { position: 3, type: "http_request", status: "skipped", input: null, output: null, error: null, durationMs: 0 },
      ]),
      new Date(),
      7,
    );

    const run = await repo.findById(id);
    expect(run?.status).toBe("success");
    expect(run?.payload).toEqual(payload);
    expect(run?.durationMs).toBe(7);
    expect(run?.steps.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(run?.steps[0]?.output).toEqual({ passed: true, actual: 4999 });
    expect(run?.steps[1]?.output).toBe("just a string");
    expect(run?.steps[2]?.input).toBeNull();
  });

  test("keeps object keys in the order they were written (json, not jsonb)", async () => {
    const id = await repo.start({ flowId: flowA, payload: { zeta: 1, alpha: 2 }, startedAt: new Date(0) });
    const output = { orderId: "ORD-1042", total: 4999, email: "asha@example.com" };
    await repo.finish(
      id,
      success([{ position: 1, type: "transform", status: "success", input: {}, output, error: null, durationMs: 0 }]),
      new Date(0),
      0,
    );
    const run = await repo.findById(id);
    expect(Object.keys(run?.payload ?? {})).toEqual(["zeta", "alpha"]);
    expect(Object.keys(run?.steps[0]?.output ?? {})).toEqual(["orderId", "total", "email"]);
    await sql`DELETE FROM runs WHERE id = ${id}::uuid`;
  });

  test("pages newest first with no overlap, and filters by status", async () => {
    const base = Date.now() + 60_000; // newer than the run from the previous test
    for (let i = 0; i < 25; i++) {
      const id = await repo.start({ flowId: flowA, payload: { i }, startedAt: new Date(base + i) });
      await repo.finish(id, i % 5 === 0 ? { status: "failed", error: "x", steps: [] } : success(), new Date(base + i), i);
    }

    const page1 = await repo.listByFlow(flowA, { limit: 20 });
    expect(page1.items).toHaveLength(20);
    expect(page1.items[0]?.startedAt).toBe(new Date(base + 24).toISOString());
    const cursor = decodeCursor(page1.nextCursor ?? "");
    expect(cursor).not.toBeNull();

    const page2 = await repo.listByFlow(flowA, { limit: 20, ...(cursor ? { cursor } : {}) });
    expect(page2.items).toHaveLength(6); // 5 left from this test + 1 from the first test
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((r) => r.id)).size).toBe(26);

    const failed = await repo.listByFlow(flowA, { limit: 100, status: "failed" });
    expect(failed.items).toHaveLength(5);
  });

  test("computes stats in SQL", async () => {
    const stats = await repo.stats(flowA);
    expect(stats.total).toBe(26);
    expect(stats.failed).toBe(5);
    expect(stats.success).toBe(21);
    expect(stats.filtered).toBe(0);
    expect(typeof stats.avgDurationMs).toBe("number");
    expect(stats.lastRunAt).not.toBeNull();

    expect(await repo.stats(flowB)).toEqual({
      total: 0,
      success: 0,
      failed: 0,
      filtered: 0,
      avgDurationMs: null,
      lastRunAt: null,
    });
  });

  test("finds the latest run per flow in one query", async () => {
    const id = await repo.start({ flowId: flowB, payload: {}, startedAt: new Date() });
    const latest = await repo.latestByFlowIds([flowA, flowB, "no-such-flow"]);
    expect(latest.size).toBe(2);
    expect(latest.get(flowB)).toMatchObject({ id, status: "running" });
  });

  test("deleting a flow's runs cascades to their steps", async () => {
    await repo.deleteByFlow(flowA);
    expect((await repo.listByFlow(flowA, { limit: 10 })).items).toHaveLength(0);
    const [orphans] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM run_steps s LEFT JOIN runs r ON r.id = s.run_id WHERE r.id IS NULL`;
    expect(orphans?.n).toBe(0);
  });
});
