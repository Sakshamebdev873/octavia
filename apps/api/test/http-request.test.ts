import { afterAll, describe, expect, test } from "bun:test";
import { executeHttpRequest, MAX_RESPONSE_BODY_BYTES } from "../src/modules/engine/http-request";

// A real HTTP server on a random free port.
const server = Bun.serve({
  port: 0,
  async fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/echo") return new Response(await req.text(), { headers: { "Content-Type": "application/json" } });
    if (path === "/fail") return new Response("boom", { status: 500 });
    if (path === "/slow") {
      await Bun.sleep(500);
      return new Response("late");
    }
    if (path === "/big") return new Response("x".repeat(10_000));
    if (path === "/redirect") return Response.redirect(new URL("/echo", req.url).toString(), 302);
    return new Response("not found", { status: 404 });
  },
});
afterAll(() => server.stop(true));

const step = (path: string, method: "POST" | "PUT" = "POST") =>
  ({ type: "http_request", url: `${server.url}${path.slice(1)}`, method }) as const;

describe("http_request step", () => {
  test("sends the data as JSON and stores status and body", async () => {
    const result = await executeHttpRequest(step("/echo", "PUT"), { orderId: "ORD-1042" });
    expect(result).toEqual({ ok: true, output: { status: 200, body: '{"orderId":"ORD-1042"}' }, error: null });
  });

  test("a non-2xx response fails the step but keeps the response", async () => {
    const result = await executeHttpRequest(step("/fail"), {});
    expect(result.ok).toBe(false);
    expect(result.output).toEqual({ status: 500, body: "boom" });
    expect(result.error).toBe("HTTP 500");
  });

  test("a redirect is not followed and fails the step", async () => {
    const result = await executeHttpRequest(step("/redirect"), {});
    expect(result.ok).toBe(false);
    expect(result.output?.status).toBe(302);
  });

  test("a timeout fails the step", async () => {
    const result = await executeHttpRequest(step("/slow"), {}, { timeoutMs: 50 });
    expect(result).toEqual({ ok: false, output: null, error: "Timed out after 50 ms" });
  });

  test("a network error fails the step", async () => {
    const result = await executeHttpRequest({ type: "http_request", url: "http://127.0.0.1:1/", method: "POST" }, {});
    expect(result.ok).toBe(false);
    expect(result.output).toBeNull();
    expect(result.error).toStartWith("Network error");
  });

  test("stores only the first 2 KB of the body", async () => {
    const result = await executeHttpRequest(step("/big"), {});
    expect(result.output?.body.length).toBe(MAX_RESPONSE_BODY_BYTES);
  });
});
