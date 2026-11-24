import { Hono } from "hono";
import { errorBody } from "../../lib/errors";

/**
 * POST /api/mock/receiver: a test target for http_request steps.
 * Echoes the raw body with status 200. With ?fail=1 it returns 500.
 */
export function mockRoutes(): Hono {
  const routes = new Hono();

  routes.post("/receiver", async (c) => {
    if (c.req.query("fail") === "1") {
      return c.json(errorBody("INTERNAL_ERROR", "Mock receiver failure (fail=1)"), 500);
    }
    const raw = await c.req.text();
    return c.body(raw, 200, {
      "Content-Type": c.req.header("content-type") ?? "application/json",
    });
  });

  return routes;
}
