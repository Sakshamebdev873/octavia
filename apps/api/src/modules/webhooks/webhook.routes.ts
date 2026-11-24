import { eventIdSchema, type TriggerResponse } from "@flowlet/shared";
import { Hono } from "hono";
import { ApiError, notFound } from "../../lib/errors";
import { parseJson, parseWith } from "../../lib/validate";
import { runSteps, type RunnerOptions } from "../engine/runner";
import type { FlowRepository } from "../flows/flow.repository";
import type { RunRepository } from "../runs/run.repository";
import { SIGNATURE_HEADER, verifySignature } from "./signature";

export const EVENT_ID_HEADER = "X-Event-Id";
export const DUPLICATE_HEADER = "X-Flowlet-Duplicate";

export interface WebhookRouteDeps {
  flows: FlowRepository;
  runs: RunRepository;
  engine?: RunnerOptions;
}

/**
 * POST /api/hooks/:flowId
 *
 * Checks run in the order of the brief: 404 unknown flow → 401 bad signature
 * (no run recorded) → 400 invalid JSON → 409 disabled flow. The signature comes
 * before "disabled", so an unsigned caller cannot learn whether a flow is enabled.
 * Then the steps run inside the request and the result is recorded.
 *
 * With an X-Event-Id header, the same event is processed at most once per flow:
 * a repeat gets the original run back and nothing runs again.
 */
export function webhookRoutes({ flows, runs, engine }: WebhookRouteDeps): Hono {
  const routes = new Hono();

  routes.post("/:flowId", async (c) => {
    const flowId = c.req.param("flowId");
    const flow = await flows.findById(flowId);
    if (!flow) throw notFound("Flow");

    const rawBody = new Uint8Array(await c.req.arrayBuffer());
    if (!verifySignature(rawBody, c.req.header(SIGNATURE_HEADER), flow.webhookSecret)) {
      throw new ApiError(401, "INVALID_SIGNATURE", "Signature is missing or invalid");
    }

    const payload = parseJson(new TextDecoder().decode(rawBody));

    if (!flow.enabled) throw new ApiError(409, "FLOW_DISABLED", "Flow is disabled");

    const eventIdHeader = c.req.header(EVENT_ID_HEADER);
    const eventId = eventIdHeader === undefined ? undefined : parseWith(eventIdSchema, eventIdHeader);

    const startedAt = new Date();
    const clock = performance.now();

    let runId: string;
    if (eventId === undefined) {
      runId = await runs.start({ flowId, payload, startedAt });
    } else {
      const claim = await runs.claim({ flowId, payload, startedAt, eventId });
      if (!claim.claimed) {
        const { id, status } = claim.existing;
        if (status === "running") {
          // The first delivery is still running. Senders retry non-2xx responses,
          // and by then the original run will have finished.
          throw new ApiError(409, "DUPLICATE_EVENT", "This event is still being processed", { runId: id });
        }
        c.header(DUPLICATE_HEADER, "true");
        const body: TriggerResponse = { runId: id, status, duplicate: true };
        return c.json(body, 200);
      }
      runId = claim.runId;
    }

    const result = await runSteps(flow.steps, payload, engine);
    await runs.finish(runId, result, new Date(), Math.round(performance.now() - clock));

    const body: TriggerResponse = { runId, status: result.status };
    return c.json(body, 200);
  });

  return routes;
}
