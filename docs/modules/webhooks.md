# Module: Webhooks

**Purpose:** accept signed events, run the flow and record the run. This is the core feature.

**Phase:** 6 · **Location:** `apps/api/src/modules/webhooks/`

## Signature (`signature.ts`)

The header format is `X-Flowlet-Signature: sha256=<hex HMAC-SHA256 of the raw body, keyed by the flow's secret>`.

```ts
export function sign(rawBody: string, secret: string): string
// new Bun.CryptoHasher("sha256", secret).update(rawBody).digest("hex")

export function verifySignature(rawBody: string, header: string | undefined, secret: string): boolean
```

`verifySignature` steps:
1. A missing header → `false`.
2. It must match `/^sha256=([0-9a-f]{64})$/i`. Otherwise → `false` (no exceptions for bad input).
3. Compute the expected digest over the **raw** body string, exactly the bytes received.
4. Compare `Buffer.from(expected, "hex")` with `Buffer.from(received, "hex")` using
   `crypto.timingSafeEqual`. Both are 32 bytes thanks to step 2, so the lengths always match.

Why the raw body: re-serialising parsed JSON changes whitespace and key order, and the
signature would no longer match what the sender signed.

Why timing-safe: `===` returns as soon as one character differs. Measuring response times could
then let an attacker guess a valid signature byte by byte.

## Trigger route (`webhook.routes.ts`)

`POST /api/hooks/:flowId`

```ts
const flow = await deps.flows.findById(flowId);
if (!flow) throw notFound("Flow");                                          // 404
const raw = await c.req.text();
if (!verifySignature(raw, c.req.header("x-flowlet-signature"), flow.webhookSecret))
  throw new ApiError(401, "INVALID_SIGNATURE", "Signature is missing or invalid");  // 401, no run
const payload = parseJsonOr400(raw);                                        // 400 INVALID_JSON
if (!flow.enabled) throw new ApiError(409, "FLOW_DISABLED", "Flow is disabled");  // 409
const runId = await deps.runs.start({ flowId, payload, startedAt });
const result = await runSteps(flow.steps, payload, engineOpts);
await deps.runs.finish(runId, result, finishedAt);
return c.json({ runId, status: result.status }, 200);
```

- `Content-Type` is not required. Senders differ, and the signature is what we trust.
- The body limit (1 MB) applies before any of this.
- If `runs.start` or `runs.finish` throws (the database is down), the response is
  `500 INTERNAL_ERROR`. An unfinished run stays `running`. Its id is logged.

## Duplicate events (extra, Phase 8)

If an `X-Event-Id` header (1 to 200 characters) is present, `runs.start` becomes
`claim(flowId, eventId, ...)` using `INSERT ... ON CONFLICT (flow_id, event_id) WHERE event_id IS NOT NULL DO NOTHING RETURNING id`.

- Inserted → run the steps as normal.
- Conflict → load the existing run and return `200 { runId, status }` with
  `X-Flowlet-Duplicate: true`. If the original is still `running`, return `"status": "running"`
  as well, and note in the README that this is the one case outside the three final statuses.

The signature is still checked first, so a duplicate id from an unsigned caller is a 401.

## Tests (through `app.request`, in-memory repositories)

| Case | Expect |
| --- | --- |
| Unknown flow id | 404 `NOT_FOUND` |
| No signature header | 401, and the run repo has 0 runs |
| Wrong signature | 401, and the run repo has 0 runs |
| Signed but body is `{bad json` | 400 `INVALID_JSON` |
| Signed, valid, flow disabled | 409 `FLOW_DISABLED` |
| The brief's example event, amount 4999 | 200 `success`. Step 3's input is `{ orderId, total, email }` |
| Amount 500 | 200 `filtered`. Steps 2 and 3 are `skipped` |
| Same `X-Event-Id` twice | Same `runId`, only one run stored |
