# Module: API core

**Purpose:** the frame every feature module plugs into: config, the app factory, dependency
injection, request parsing, the single error shape, and the mock receiver.

**Phase:** 2 · **Location:** `apps/api/src/{index.ts, app.ts, config.ts, lib/, db/, modules/mock/}`

## Config (`config.ts`)

`process.env` is parsed once with Zod at startup. A bad or missing value stops the process with a
readable message. Defaults match `.env.example`, so local dev works even without a `.env` file.

```ts
export const config = z.object({
  PORT: z.coerce.number().int().default(4000),
  MONGO_URL: z.string().default("mongodb://localhost:27017"),
  MONGO_DB: z.string().default("flowlet"),
  DATABASE_URL: z.string().default("postgres://flowlet:flowlet@localhost:5432/flowlet"),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
}).parse(process.env);
```

The API's scripts run with `bun --env-file=../../.env`, so the single root `.env` is used.

## App factory (`app.ts`)

```ts
export interface AppDeps {
  flows: FlowRepository;      // interface, Mongo implementation in production
  runs: RunRepository;        // interface, Postgres implementation in production
  fetch?: typeof fetch;       // injectable for http_request tests
}
export function createApp(deps: AppDeps): Hono
```

- `createApp` is pure: it opens no connections. `index.ts` connects to the databases, builds the
  real repositories, calls `createApp` and starts `Bun.serve({ port, fetch: app.fetch })`.
- Tests call `createApp` with in-memory repositories and use `app.request(...)`. No port and no
  database are needed for the API tests.
- Middleware, in order: request id + logger → CORS (`WEB_ORIGIN`) → `bodyLimit(1 MB)` → routes.
- Graceful shutdown on SIGINT/SIGTERM closes the Mongo client and the Postgres pool.

## Errors (`lib/errors.ts`)

```ts
export class ApiError extends Error {
  constructor(readonly status: ContentfulStatusCode, readonly code: ErrorCode,
              message: string, readonly details: Record<string, unknown> = {}) { super(message) }
}
export const notFound = (what: string) => new ApiError(404, "NOT_FOUND", `${what} not found`);
```

- `app.onError`: an `ApiError` becomes its own shape. Anything else is logged with the request
  id and returned as `500 INTERNAL_ERROR` with a generic message, so stack traces never leak.
- `app.notFound`: `404 NOT_FOUND` with `"Route not found"`.
- `bodyLimit`'s `onError` returns `413 PAYLOAD_TOO_LARGE`.

## Request helpers (`lib/validate.ts`)

```ts
export async function readJson(c: Context): Promise<{ raw: string; value: JsonValue }>
// raw text first (needed by webhooks), then JSON.parse → ApiError(400, "INVALID_JSON")

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S>
// on failure: ApiError(400, "VALIDATION_ERROR", firstIssue.message, { issues })
```

`issues` is `{ path: "steps.0.value", message }[]`, built from `ZodError.issues`.

## Mock receiver (`modules/mock/mock.routes.ts`)

`POST /api/mock/receiver`

- Default: `200`. The response body is the **raw request body**, echoed byte for byte, with the
  request's `Content-Type` (default `application/json`).
- `?fail=1`: `500` with `{ "error": { "code": "INTERNAL_ERROR", "message": "Mock receiver failure (fail=1)", "details": {} } }`.

It is the default target for `http_request` steps in demos and tests.
