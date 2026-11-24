import { createApp } from "../../src/app";
import { InMemoryFlowRepository } from "./memory-flows";
import { InMemoryRunRepository } from "./memory-runs";

/** Builds the real Hono app on in-memory storage. No port, no database. */
export function buildTestApp() {
  const flows = new InMemoryFlowRepository();
  const runs = new InMemoryRunRepository();
  const app = createApp({ flows, runs, webOrigin: "http://localhost:3000" });
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
