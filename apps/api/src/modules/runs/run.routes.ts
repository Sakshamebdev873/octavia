import { runListQuerySchema } from "@flowlet/shared";
import { Hono } from "hono";
import { ApiError, notFound } from "../../lib/errors";
import { parseWith } from "../../lib/validate";
import type { FlowRepository } from "../flows/flow.repository";
import { decodeCursor } from "./cursor";
import type { RunRepository } from "./run.repository";

export interface RunRouteDeps {
  flows: FlowRepository;
  runs: RunRepository;
}

/** Mounted at /api: run history, one run, and flow stats. */
export function runRoutes({ flows, runs }: RunRouteDeps): Hono {
  const routes = new Hono();

  async function requireFlow(id: string): Promise<void> {
    if (!(await flows.findById(id))) throw notFound("Flow");
  }

  routes.get("/flows/:id/runs", async (c) => {
    const flowId = c.req.param("id");
    await requireFlow(flowId);

    const query = parseWith(runListQuerySchema, c.req.query());
    const cursor = query.cursor === undefined ? undefined : decodeCursor(query.cursor);
    if (cursor === null) {
      throw new ApiError(400, "VALIDATION_ERROR", "Cursor is invalid", {
        issues: [{ path: "cursor", message: "Cursor is invalid" }],
      });
    }

    const page = await runs.listByFlow(flowId, {
      limit: query.limit,
      ...(query.status ? { status: query.status } : {}),
      ...(cursor ? { cursor } : {}),
    });
    return c.json(page);
  });

  routes.get("/flows/:id/stats", async (c) => {
    const flowId = c.req.param("id");
    await requireFlow(flowId);
    return c.json(await runs.stats(flowId));
  });

  routes.get("/runs/:runId", async (c) => {
    const run = await runs.findById(c.req.param("runId"));
    if (!run) throw notFound("Run");
    return c.json(run);
  });

  return routes;
}
