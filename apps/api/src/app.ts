import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ApiError, errorBody } from "./lib/errors";
import { mockRoutes } from "./modules/mock/mock.routes";

export const MAX_BODY_BYTES = 1024 * 1024; // 1 MB

export interface AppDeps {
  /** Origin of the web app, allowed by CORS. */
  webOrigin: string;
  /** Log one line per request. Off in tests. */
  logRequests?: boolean;
}

/**
 * Builds the HTTP app. It opens no connections: everything it needs is passed
 * in, so tests can build it with in-memory repositories and call app.request().
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  if (deps.logRequests) app.use(logger());

  app.use(
    "/api/*",
    cors({
      origin: deps.webOrigin,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-Flowlet-Signature", "X-Event-Id"],
    }),
  );

  app.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json(errorBody("PAYLOAD_TOO_LARGE", "Request body must be at most 1 MB"), 413),
    }),
  );

  app.route("/api/mock", mockRoutes());

  app.notFound((c) => c.json(errorBody("NOT_FOUND", "Route not found"), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json(errorBody(err.code, err.message, err.details), err.status);
    }
    // Unexpected: log the real error, return a generic message (no stack traces to clients).
    console.error(`[${c.req.method} ${c.req.path}]`, err);
    return c.json(errorBody("INTERNAL_ERROR", "Something went wrong"), 500);
  });

  return app;
}
