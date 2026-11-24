import { afterAll, describe, expect, test } from "bun:test";
import { runSteps } from "../src/modules/engine/runner";
import { exampleSteps, orderEvent } from "./fixtures";

const server = Bun.serve({
  port: 0,
  async fetch(req) {
    if (new URL(req.url).searchParams.get("fail") === "1") return new Response("down", { status: 500 });
    return new Response(await req.text(), { headers: { "Content-Type": "application/json" } });
  },
});
afterAll(() => server.stop(true));

const receiver = `${server.url}receiver`;

describe("runSteps", () => {
  test("amount 4999: success, and the last step receives the transformed data", async () => {
    const result = await runSteps(exampleSteps(receiver), orderEvent(4999));
    expect(result.status).toBe("success");
    expect(result.error).toBeNull();
    expect(result.steps.map((s) => s.status)).toEqual(["success", "success", "success"]);
    expect(result.steps[2]?.input).toEqual({ orderId: "ORD-1042", total: 4999, email: "asha@example.com" });
    expect(result.steps[2]?.output).toEqual({
      status: 200,
      body: '{"orderId":"ORD-1042","total":4999,"email":"asha@example.com"}',
    });
  });

  test("amount 500: filtered, and steps two and three are skipped", async () => {
    const result = await runSteps(exampleSteps(receiver), orderEvent(500));
    expect(result.status).toBe("filtered");
    expect(result.error).toBeNull();
    expect(result.steps.map((s) => s.status)).toEqual(["success", "skipped", "skipped"]);
    expect(result.steps[0]?.output).toEqual({ passed: false, actual: 500 });
    expect(result.steps[1]).toMatchObject({ input: null, output: null, durationMs: 0 });
  });

  test("a failing http_request fails the run with a clear error", async () => {
    const steps = exampleSteps(`${receiver}?fail=1`);
    const result = await runSteps(steps, orderEvent(4999));
    expect(result.status).toBe("failed");
    expect(result.error).toBe("Step 3 (http_request): HTTP 500");
    expect(result.steps[2]).toMatchObject({ status: "failed", error: "HTTP 500", output: { status: 500, body: "down" } });
  });

  test("steps after a failure are skipped", async () => {
    const steps = [
      { type: "http_request", url: `${receiver}?fail=1`, method: "POST" },
      { type: "transform", mapping: { a: "b" } },
    ] as const;
    const result = await runSteps([...steps], {});
    expect(result.steps.map((s) => s.status)).toEqual(["failed", "skipped"]);
  });

  test("each step records its input and a duration", async () => {
    const result = await runSteps(exampleSteps(receiver), orderEvent(4999));
    expect(result.steps[0]?.input).toEqual(orderEvent(4999));
    for (const step of result.steps) expect(step.durationMs).toBeGreaterThanOrEqual(0);
  });
});
