import { describe, expect, test } from "bun:test";
import type { ApiErrorBody, Flow, FlowStats, Run, RunPage } from "@flowlet/shared";
import { buildTestApp, jsonRequest } from "./support/test-app";

async function setup(runCount: number) {
  const ctx = buildTestApp();
  const res = await ctx.app.request(
    "/api/flows",
    jsonRequest("POST", { name: "Runs test", steps: [{ type: "filter", field: "a", operator: "eq", value: 1 }] }),
  );
  const flow = (await res.json()) as Flow;
  const base = Date.parse("2026-11-24T10:00:00.000Z");
  for (let i = 0; i < runCount; i++) {
    const id = await ctx.runs.start({ flowId: flow.id, payload: { i }, startedAt: new Date(base + i * 1000) });
    const status = i % 3 === 0 ? "filtered" : "success";
    await ctx.runs.finish(id, { status, error: null, steps: [] }, new Date(base + i * 1000 + 10), 10 + i);
  }
  return { ...ctx, flow };
}

describe("GET /api/flows/:id/runs", () => {
  test("pages newest first with a cursor and no overlap", async () => {
    const { app, flow } = await setup(25);
    const first = (await (await app.request(`/api/flows/${flow.id}/runs`)).json()) as RunPage;
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).not.toBeNull();
    expect(first.items[0]?.startedAt).toBe("2026-11-24T10:00:24.000Z");

    const second = (await (
      await app.request(`/api/flows/${flow.id}/runs?cursor=${first.nextCursor}`)
    ).json()) as RunPage;
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();

    const ids = [...first.items, ...second.items].map((run) => run.id);
    expect(new Set(ids).size).toBe(25);
  });

  test("filters by status and respects the limit", async () => {
    const { app, flow } = await setup(9);
    const page = (await (await app.request(`/api/flows/${flow.id}/runs?status=filtered&limit=2`)).json()) as RunPage;
    expect(page.items).toHaveLength(2);
    expect(page.items.every((run) => run.status === "filtered")).toBe(true);
  });

  test("rejects a bad status, limit or cursor with 400", async () => {
    const { app, flow } = await setup(1);
    for (const query of ["status=done", "limit=0", "limit=abc", "cursor=garbage"]) {
      const res = await app.request(`/api/flows/${flow.id}/runs?${query}`);
      expect(res.status).toBe(400);
      expect(((await res.json()) as ApiErrorBody).error.code).toBe("VALIDATION_ERROR");
    }
  });

  test("returns 404 for an unknown flow", async () => {
    const { app } = await setup(0);
    expect((await app.request("/api/flows/0123456789abcdef01234567/runs")).status).toBe(404);
  });
});

describe("GET /api/flows/:id/stats", () => {
  test("counts runs by status", async () => {
    const { app, flow } = await setup(6);
    const stats = (await (await app.request(`/api/flows/${flow.id}/stats`)).json()) as FlowStats;
    expect(stats).toEqual({
      total: 6,
      success: 4,
      failed: 0,
      filtered: 2,
      avgDurationMs: 13,
      lastRunAt: "2026-11-24T10:00:05.000Z",
    });
  });
});

describe("GET /api/runs/:runId", () => {
  test("returns the run with its payload", async () => {
    const { app, runs, flow } = await setup(1);
    const [id] = [...runs.runs.keys()];
    const run = (await (await app.request(`/api/runs/${id}`)).json()) as Run;
    expect(run.flowId).toBe(flow.id);
    expect(run.payload).toEqual({ i: 0 });
  });

  test("returns 404 for unknown and malformed ids", async () => {
    const { app } = await setup(0);
    expect((await app.request(`/api/runs/${Bun.randomUUIDv7()}`)).status).toBe(404);
    expect((await app.request("/api/runs/not-a-uuid")).status).toBe(404);
  });
});
