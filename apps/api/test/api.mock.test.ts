import { describe, expect, test } from "bun:test";
import type { ApiErrorBody } from "@flowlet/shared";
import { createApp } from "../src/app";

const app = createApp({ webOrigin: "http://localhost:3000" });

describe("POST /api/mock/receiver", () => {
  test("returns 200 and echoes the raw body", async () => {
    const body = '{"orderId":"ORD-1042","total":4999}';
    const res = await app.request("/api/mock/receiver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(body);
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("returns 500 in the error shape with ?fail=1", async () => {
    const res = await app.request("/api/mock/receiver?fail=1", { method: "POST", body: "{}" });
    expect(res.status).toBe(500);
    const json = (await res.json()) as ApiErrorBody;
    expect(json.error.code).toBe("INTERNAL_ERROR");
  });
});

describe("app error handling", () => {
  test("unknown routes return 404 in the error shape", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Route not found", details: {} },
    });
  });

  test("bodies over 1 MB return 413", async () => {
    const res = await app.request("/api/mock/receiver", {
      method: "POST",
      body: "x".repeat(1024 * 1024 + 1),
    });
    expect(res.status).toBe(413);
    const json = (await res.json()) as ApiErrorBody;
    expect(json.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
});
