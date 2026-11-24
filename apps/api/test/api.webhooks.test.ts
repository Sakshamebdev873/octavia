import { describe, expect, test } from "bun:test";
import type { ApiErrorBody, Flow, Run, TriggerResponse } from "@flowlet/shared";
import { exampleSteps, orderEvent } from "./fixtures";
import { buildTestApp, jsonRequest, signedRequest } from "./support/test-app";

/** The flow from the brief, pointing at the real mock receiver route. */
async function setup(overrides: Record<string, unknown> = {}) {
  const ctx = buildTestApp();
  const res = await ctx.app.request(
    "/api/flows",
    jsonRequest("POST", {
      name: "High value orders",
      steps: exampleSteps("http://localhost:4000/api/mock/receiver"),
      ...overrides,
    }),
  );
  const flow = (await res.json()) as Flow;
  const hook = `/api/hooks/${flow.id}`;
  return { ...ctx, flow, hook };
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as ApiErrorBody).error.code;
}

describe("POST /api/hooks/:flowId", () => {
  test("the brief's example: success with three steps", async () => {
    const { app, flow, hook } = await setup();
    const res = await app.request(hook, signedRequest(JSON.stringify(orderEvent(4999)), flow.webhookSecret));
    expect(res.status).toBe(200);
    const body = (await res.json()) as TriggerResponse;
    expect(body.status).toBe("success");

    const run = (await (await app.request(`/api/runs/${body.runId}`)).json()) as Run;
    expect(run.status).toBe("success");
    expect(run.payload).toEqual(orderEvent(4999));
    expect(run.steps.map((s) => s.status)).toEqual(["success", "success", "success"]);
    expect(run.steps[2]?.input).toEqual({ orderId: "ORD-1042", total: 4999, email: "asha@example.com" });
    expect(run.steps[2]?.output).toEqual({
      status: 200,
      body: '{"orderId":"ORD-1042","total":4999,"email":"asha@example.com"}',
    });
    expect(run.finishedAt).not.toBeNull();
    expect(run.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("amount 500: filtered, steps two and three skipped", async () => {
    const { app, flow, hook } = await setup();
    const res = await app.request(hook, signedRequest(JSON.stringify(orderEvent(500)), flow.webhookSecret));
    const body = (await res.json()) as TriggerResponse;
    expect(body.status).toBe("filtered");
    const run = (await (await app.request(`/api/runs/${body.runId}`)).json()) as Run;
    expect(run.steps.map((s) => s.status)).toEqual(["success", "skipped", "skipped"]);
  });

  test("a failing http_request: 200 with status failed", async () => {
    const { app, flow, hook } = await setup({
      steps: exampleSteps("http://localhost:4000/api/mock/receiver?fail=1"),
    });
    const res = await app.request(hook, signedRequest(JSON.stringify(orderEvent(4999)), flow.webhookSecret));
    expect(res.status).toBe(200);
    const body = (await res.json()) as TriggerResponse;
    expect(body.status).toBe("failed");
    const run = (await (await app.request(`/api/runs/${body.runId}`)).json()) as Run;
    expect(run.error).toBe("Step 3 (http_request): HTTP 500");
  });

  test("unknown flow: 404", async () => {
    const { app } = await setup();
    const res = await app.request("/api/hooks/0123456789abcdef01234567", signedRequest("{}", "x"));
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe("NOT_FOUND");
  });

  test("missing signature: 401 and no run recorded", async () => {
    const { app, runs, hook } = await setup();
    const res = await app.request(hook, jsonRequest("POST", orderEvent()));
    expect(res.status).toBe(401);
    expect(await errorCode(res)).toBe("INVALID_SIGNATURE");
    expect(runs.runs.size).toBe(0);
  });

  test("wrong signature: 401 and no run recorded", async () => {
    const { app, runs, hook } = await setup();
    const res = await app.request(hook, signedRequest(JSON.stringify(orderEvent()), "not-the-secret"));
    expect(res.status).toBe(401);
    expect(runs.runs.size).toBe(0);
  });

  test("signature over a different body: 401", async () => {
    const { app, flow, hook } = await setup();
    const init = signedRequest(JSON.stringify(orderEvent(500)), flow.webhookSecret);
    const res = await app.request(hook, { ...init, body: JSON.stringify(orderEvent(999_999)) });
    expect(res.status).toBe(401);
  });

  test("signed but not JSON: 400", async () => {
    const { app, flow, runs, hook } = await setup();
    const res = await app.request(hook, signedRequest("{not json", flow.webhookSecret));
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("INVALID_JSON");
    expect(runs.runs.size).toBe(0);
  });

  test("disabled flow: 409", async () => {
    const { app, flow, runs, hook } = await setup({ enabled: false });
    const res = await app.request(hook, signedRequest(JSON.stringify(orderEvent()), flow.webhookSecret));
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("FLOW_DISABLED");
    expect(runs.runs.size).toBe(0);
  });

  test("a disabled flow still answers 401 to an unsigned caller", async () => {
    const { app, hook } = await setup({ enabled: false });
    const res = await app.request(hook, jsonRequest("POST", orderEvent()));
    expect(res.status).toBe(401);
  });

  test("X-Event-Id: a repeated event returns the original run and runs nothing again", async () => {
    const { app, flow, runs, hook } = await setup();
    const raw = JSON.stringify(orderEvent());
    const first = (await (await app.request(hook, signedRequest(raw, flow.webhookSecret, { "X-Event-Id": "evt-1" }))).json()) as TriggerResponse;
    const res = await app.request(hook, signedRequest(raw, flow.webhookSecret, { "X-Event-Id": "evt-1" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Flowlet-Duplicate")).toBe("true");
    expect(await res.json()).toEqual({ runId: first.runId, status: "success", duplicate: true });
    expect(runs.runs.size).toBe(1);

    await app.request(hook, signedRequest(raw, flow.webhookSecret, { "X-Event-Id": "evt-2" }));
    await app.request(hook, signedRequest(raw, flow.webhookSecret));
    expect(runs.runs.size).toBe(3);
  });

  test("X-Event-Id: a repeat while the first delivery is still running is a 409", async () => {
    const { app, flow, runs, hook } = await setup();
    await runs.claim({ flowId: flow.id, payload: {}, startedAt: new Date(), eventId: "evt-busy" });
    const res = await app.request(
      hook,
      signedRequest(JSON.stringify(orderEvent()), flow.webhookSecret, { "X-Event-Id": "evt-busy" }),
    );
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe("DUPLICATE_EVENT");
  });

  test("X-Event-Id: an empty or too long id is a 400", async () => {
    const { app, flow, hook } = await setup();
    for (const id of [" ", "x".repeat(201)]) {
      const res = await app.request(hook, signedRequest("{}", flow.webhookSecret, { "X-Event-Id": id }));
      expect(res.status).toBe(400);
    }
  });

  test("runs show up in the history and stats", async () => {
    const { app, flow, hook } = await setup();
    await app.request(hook, signedRequest(JSON.stringify(orderEvent(4999)), flow.webhookSecret));
    await app.request(hook, signedRequest(JSON.stringify(orderEvent(500)), flow.webhookSecret));
    const stats = (await (await app.request(`/api/flows/${flow.id}/stats`)).json()) as Record<string, unknown>;
    expect(stats).toMatchObject({ total: 2, success: 1, filtered: 1, failed: 0 });
  });
});
