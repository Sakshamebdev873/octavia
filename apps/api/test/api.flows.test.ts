import { describe, expect, test } from "bun:test";
import type { ApiErrorBody, Flow, FlowSummary } from "@flowlet/shared";
import { buildTestApp, jsonRequest } from "./support/test-app";

const exampleFlow = {
  name: "High value orders",
  enabled: true,
  steps: [
    { type: "filter", field: "order.amount", operator: "gt", value: 1000 },
    {
      type: "transform",
      mapping: { orderId: "order.id", total: "order.amount", email: "order.customer.email" },
    },
    { type: "http_request", url: "http://localhost:4000/api/mock/receiver", method: "POST" },
  ],
};

async function createFlow(app: ReturnType<typeof buildTestApp>["app"]): Promise<Flow> {
  const res = await app.request("/api/flows", jsonRequest("POST", exampleFlow));
  expect(res.status).toBe(201);
  return (await res.json()) as Flow;
}

describe("POST /api/flows", () => {
  test("creates a flow with a server-generated webhook secret", async () => {
    const { app } = buildTestApp();
    const flow = await createFlow(app);
    expect(flow.id).toMatch(/^[0-9a-f]{24}$/);
    expect(flow.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
    expect(flow.steps).toHaveLength(3);
    expect(flow.description).toBeNull();
  });

  test("returns 400 VALIDATION_ERROR with the field path", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/api/flows", jsonRequest("POST", { ...exampleFlow, name: "ab" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("Name must be at least 3 characters");
    expect(body.error.details.issues).toContainEqual({
      path: "name",
      message: "Name must be at least 3 characters",
    });
  });

  test("reports nested step errors with their path", async () => {
    const { app } = buildTestApp();
    const steps = [{ type: "filter", field: "order.amount", operator: "gt", value: "big" }];
    const res = await app.request("/api/flows", jsonRequest("POST", { name: "Valid", steps }));
    const body = (await res.json()) as ApiErrorBody;
    expect(body.error.details.issues?.[0]?.path).toBe("steps.0.value");
  });

  test("returns 400 INVALID_JSON for a malformed body", async () => {
    const { app } = buildTestApp();
    const res = await app.request("/api/flows", jsonRequest("POST", "{not json"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as ApiErrorBody).error.code).toBe("INVALID_JSON");
  });
});

describe("GET /api/flows", () => {
  test("lists flows without steps or secret, with the latest run", async () => {
    const { app, runs } = buildTestApp();
    const flow = await createFlow(app);
    runs.latest.set(flow.id, { id: "run-1", status: "success", startedAt: new Date().toISOString() });

    const res = await app.request("/api/flows");
    expect(res.status).toBe(200);
    const list = (await res.json()) as FlowSummary[];
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("steps");
    expect(list[0]).not.toHaveProperty("webhookSecret");
    expect(list[0]?.stepCount).toBe(3);
    expect(list[0]?.lastRun?.status).toBe("success");
  });
});

describe("GET, PATCH and DELETE /api/flows/:id", () => {
  test("returns the flow with steps and secret", async () => {
    const { app } = buildTestApp();
    const flow = await createFlow(app);
    const res = await app.request(`/api/flows/${flow.id}`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as Flow).webhookSecret).toBe(flow.webhookSecret);
  });

  test("disables a flow with PATCH and keeps the other fields", async () => {
    const { app } = buildTestApp();
    const flow = await createFlow(app);
    const res = await app.request(`/api/flows/${flow.id}`, jsonRequest("PATCH", { enabled: false }));
    expect(res.status).toBe(200);
    const updated = (await res.json()) as Flow;
    expect(updated.enabled).toBe(false);
    expect(updated.name).toBe(flow.name);
    expect(updated.webhookSecret).toBe(flow.webhookSecret);
  });

  test("rejects an empty PATCH", async () => {
    const { app } = buildTestApp();
    const flow = await createFlow(app);
    const res = await app.request(`/api/flows/${flow.id}`, jsonRequest("PATCH", {}));
    expect(res.status).toBe(400);
  });

  test("deletes a flow and its run history", async () => {
    const { app, runs } = buildTestApp();
    const flow = await createFlow(app);
    const res = await app.request(`/api/flows/${flow.id}`, { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(runs.deletedFlowIds).toEqual([flow.id]);
    expect((await app.request(`/api/flows/${flow.id}`)).status).toBe(404);
  });

  test("returns 404 for unknown and malformed ids", async () => {
    const { app } = buildTestApp();
    for (const id of ["0123456789abcdef01234567", "not-an-id"]) {
      expect((await app.request(`/api/flows/${id}`)).status).toBe(404);
      expect((await app.request(`/api/flows/${id}`, jsonRequest("PATCH", { enabled: true }))).status).toBe(404);
      expect((await app.request(`/api/flows/${id}`, { method: "DELETE" })).status).toBe(404);
    }
  });
});
