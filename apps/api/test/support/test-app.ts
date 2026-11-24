import type { Hono } from "hono";
import { createApp } from "../../src/app";
import type { RunnerOptions } from "../../src/modules/engine/runner";
import { sign } from "../../src/modules/webhooks/signature";
import { InMemoryFlowRepository } from "./memory-flows";
import { InMemoryRunRepository } from "./memory-runs";

/**
 * Builds the real Hono app on in-memory storage. No port, no database.
 * http_request steps are sent back into the same app, so a step pointing at
 * http://localhost:4000/api/mock/receiver reaches the real mock receiver.
 */
export function buildTestApp() {
  const flows = new InMemoryFlowRepository();
  const runs = new InMemoryRunRepository();
  const engine: RunnerOptions = { http: { fetch: async (url, init) => app.request(url, init) } };
  const app: Hono = createApp({ flows, runs, engine, webOrigin: "http://localhost:3000" });
  return { app, flows, runs };
}

/** JSON request helper for app.request(). */
export function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  };
}

/** A webhook request signed the way the brief describes. */
export function signedRequest(rawBody: string, secret: string, extraHeaders: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Flowlet-Signature": `sha256=${sign(rawBody, secret)}`,
      ...extraHeaders,
    },
    body: rawBody,
  };
}
