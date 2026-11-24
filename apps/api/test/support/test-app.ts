import type { LastRun } from "@flowlet/shared";
import { createApp } from "../../src/app";
import type { FlowRunsPort } from "../../src/modules/flows/flow.repository";
import { InMemoryFlowRepository } from "./memory-flows";

/** Minimal run port until the in-memory run repository exists. Records deletions. */
class StubRuns implements FlowRunsPort {
  readonly latest = new Map<string, LastRun>();
  readonly deletedFlowIds: string[] = [];

  async latestByFlowIds(flowIds: string[]): Promise<Map<string, LastRun>> {
    return new Map([...this.latest].filter(([id]) => flowIds.includes(id)));
  }

  async deleteByFlow(flowId: string): Promise<void> {
    this.deletedFlowIds.push(flowId);
  }
}

/** Builds the real Hono app on in-memory storage. No port, no database. */
export function buildTestApp() {
  const flows = new InMemoryFlowRepository();
  const runs = new StubRuns();
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
