import { createFlowSchema, updateFlowSchema, type FlowSummary } from "@flowlet/shared";
import { Hono } from "hono";
import { notFound } from "../../lib/errors";
import { parseWith, readJson } from "../../lib/validate";
import { FLOW_LIST_LIMIT, type FlowRepository, type FlowRunsPort } from "./flow.repository";

export interface FlowRouteDeps {
  flows: FlowRepository;
  runs: FlowRunsPort;
}

/** /api/flows: create, list, read, update (incl. enable/disable) and delete flows. */
export function flowRoutes({ flows, runs }: FlowRouteDeps): Hono {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const { value } = await readJson(c);
    const input = parseWith(createFlowSchema, value);
    const flow = await flows.create(input);
    return c.json(flow, 201);
  });

  routes.get("/", async (c) => {
    const items = await flows.list(FLOW_LIST_LIMIT);
    // One SQL query for the latest run of every listed flow (no N+1).
    const latest = await runs.latestByFlowIds(items.map((item) => item.id));
    const body: FlowSummary[] = items.map((item) => ({ ...item, lastRun: latest.get(item.id) ?? null }));
    return c.json(body);
  });

  routes.get("/:id", async (c) => {
    const flow = await flows.findById(c.req.param("id"));
    if (!flow) throw notFound("Flow");
    return c.json(flow);
  });

  routes.patch("/:id", async (c) => {
    const { value } = await readJson(c);
    const patch = parseWith(updateFlowSchema, value);
    const flow = await flows.update(c.req.param("id"), patch);
    if (!flow) throw notFound("Flow");
    return c.json(flow);
  });

  routes.delete("/:id", async (c) => {
    const id = c.req.param("id");
    const deleted = await flows.delete(id);
    if (!deleted) throw notFound("Flow");
    // The flow is the source of truth and is already gone. If removing its run
    // history fails, the orphaned runs are unreachable through the flow's
    // endpoints, so we log the error instead of failing the request.
    try {
      await runs.deleteByFlow(id);
    } catch (error) {
      console.error(`Flow ${id} deleted but its runs could not be removed`, error);
    }
    return c.body(null, 204);
  });

  return routes;
}
