# Decisions and assumptions

Where the brief leaves something open, this file records what we chose and why. Items marked
**(ask)** are worth confirming with the reviewers by email.

## Assumptions about the contract

| Topic | Decision | Why |
| --- | --- | --- |
| `GET /api/flows` shape **(ask)** | A plain JSON array of summaries | Only the runs list has a wrapper in the brief. Up to 100 flows, newest first, no pagination |
| Field names **(ask)** | `id` (not `_id`) and `webhookSecret` | Clean API names. Mongo's `_id` never leaks |
| Status codes | Create `201`, delete `204`, others `200` | Standard REST |
| What `http_request` passes on **(ask)** | The data it sent, unchanged | The brief says only the response is stored as output. Pass-through means a later step still sees business data |
| Missing field in a filter | Treated as `null` (same rule as transform) | One rule for missing paths everywhere |
| `eq` / `neq` | Strict equality on primitives. `"1000"` is not `1000` | Predictable, no hidden type conversion |
| `gt` / `lt` | Both sides must be finite numbers, otherwise the check is `false`. The config value must be a number (checked at create time) | Avoids accidental string comparison |
| `contains` | String field: substring match. Array field: an element strictly equals the value. Anything else: `false` | Covers both meanings of "contains" |
| Webhook body | Any valid JSON is accepted (object, array, number...) | The brief only rejects invalid JSON |
| `limit` above 100 | Clamped to 100. Not a number or below 1 → 400 | "Maximum 100" is honoured without failing callers |
| Run list / stats for an unknown flow | 404 | Consistent with `GET /api/flows/:id` |
| Empty PATCH body | 400 `VALIDATION_ERROR` | A no-op update is almost always a client bug |
| Bad ObjectId / UUID in a path | 404, not 400 | From the caller's view the resource does not exist |

## Run lifecycle: insert first, finish in one transaction

The run row is inserted with status `running` **before** any step executes. When the steps are
done, all `run_steps` rows and the final run update are written in **one transaction**.

- If the process crashes mid-run, the run stays visible as `running` instead of disappearing.
- The insert-first row is also how `X-Event-Id` dedupe claims an event (see below).
- Readers never see a finished run with missing steps.

## Duplicate delivery

Without the extra, the same event delivered twice creates two runs, and an `http_request` step
sends twice. Webhook senders retry on timeouts, so this happens in real life.

With the extra (built): if `X-Event-Id` is present, the run insert uses a partial unique index
on `(flow_id, event_id)`. `INSERT ... ON CONFLICT DO NOTHING` either claims the event or finds the
existing run. A duplicate returns `200` with the **original** `runId` and status, plus
`"duplicate": true` and the header `X-Flowlet-Duplicate: true`, and nothing runs again. Claiming
before running closes the race between two concurrent deliveries (tested with 5 parallel claims
against PostgreSQL). If the original is still running, the duplicate gets `409 DUPLICATE_EVENT`:
the sender retries, and by then the original has finished.

## Flow deletion

**Choice:** deleting a flow also deletes its run history (`DELETE FROM runs WHERE flow_id = $1`;
`run_steps` go by `ON DELETE CASCADE`).

Why: a run has no meaning without its flow (the UI cannot show the steps' configuration), and run
payloads may hold customer data such as emails, which should not outlive the flow.

Order: Mongo first (the source of truth), then Postgres. If the Postgres delete fails, the
orphaned runs are harmless: the flow's endpoints already return 404. The error is logged. A real
system would soft-delete, or keep audit runs for a retention period. We say so in the README.

## Why not ...

- **Express / Node**: not allowed by the brief. Hono runs natively on Bun and has a `fetch`-style
  `app.request()`, so API tests need no open port.
- **An ORM**: the SQL here is small and specific (keyset pagination, `FILTER` aggregates,
  `DISTINCT ON`). Plain parameterised SQL through `Bun.SQL` is clearer to review and explain.
- **Server Actions for the API**: the brief defines a REST contract on port 4000. The web app is
  a client of that contract, exactly like an external tester.

## Questions to email the reviewers

1. Should `GET /api/flows` return a plain array or `{ "items": [...] }`?
2. Which field names will your tests read from the create response: `id` and `webhookSecret`?
3. After an `http_request` step, should the next step receive the data that was sent or the
   response body?
4. For `gt` / `lt`, should numeric strings such as `"1000"` be compared as numbers?

## README answers (outline, filled in at Phase 8)

1. **Mongo for flows, Postgres for runs**: flows are nested, polymorphic documents read and
   written whole. Runs are append-only, relational, filtered, paginated and aggregated.
2. **Indexes**: Mongo `{createdAt:-1,_id:-1}` → flow list. PG `(flow_id, started_at DESC, id DESC)`
   → run list and stats. `(flow_id, status, started_at DESC, id DESC)` → filtered run list.
   Partial unique `(flow_id, event_id)` → dedupe.
3. **Duplicates**: see above.
4. **Deletion**: see above.
5. **100 events/s**: steps run inside the HTTP request. A slow `http_request` (up to 5s) holds a
   connection and a Postgres pool slot per in-flight run. The first things to break are the
   PG pool and the sender's timeout. Fixes: accept + enqueue, return 202, run in workers; batch
   step inserts; cache flows in memory with a short TTL; partition `runs` by time.
