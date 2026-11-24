# Flowlet

A mini webhook automation service. A user creates a **flow** with up to five steps. An external
system sends a signed event to the flow's webhook URL. Flowlet verifies the signature, runs the
steps in order (filter → transform → http_request) and records the result as a **run**, step by
step, which the web app shows as a timeline.

**Stack:** TypeScript (strict) · Bun + Hono (API, port 4000) · Next.js 16 App Router (web, port 3000) ·
MongoDB (flows) · PostgreSQL via `Bun.SQL` (runs) · Zod · `bun test`

Design docs, written before the code: [`docs/`](docs/README.md) (architecture, phase plan, one spec per module, decisions).

---

## 1. How to run

Requirements: Bun 1.3+ (developed on 1.3.13), Docker, Node.js 20+ (used by `next dev`).

```bash
cp .env.example .env
docker compose up -d        # MongoDB and PostgreSQL
bun install
bun run migrate             # waits for both databases, applies SQL migrations, creates Mongo indexes
bun run dev                 # backend on 4000, web on 3000
bun test
```

Open http://localhost:3000. `bun run migrate` retries until PostgreSQL accepts connections, so it
can run right after `docker compose up -d`. It is idempotent.

Other scripts: `bun run typecheck` (all packages).

### Try the brief's example

Create the example flow in the UI (or `POST /api/flows`), open it, and press **Send test event**.
The page also shows a ready-to-copy `curl` + `openssl` command with the real secret:

```bash
BODY='{"event":"order.created","order":{"id":"ORD-1042","amount":4999,"currency":"INR","customer":{"name":"Asha Rao","email":"asha@example.com"}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')
curl -i -X POST "http://localhost:4000/api/hooks/$FLOW_ID" \
  -H 'Content-Type: application/json' -H "X-Flowlet-Signature: sha256=$SIG" -d "$BODY"
```

`amount: 4999` → `success`, three steps, the last step's input is
`{ "orderId": "ORD-1042", "total": 4999, "email": "asha@example.com" }`.
`amount: 500` → `filtered`, steps two and three `skipped`.

### API notes (where the brief left a choice)

- `POST /api/flows` → **201** with the flow, including `id` and `webhookSecret`. `DELETE` → **204**.
- `GET /api/flows` → a plain **array** of summaries (no `steps`, no `webhookSecret`), newest first,
  at most 100, each with `stepCount` and `lastRun`.
- Every error: `{ "error": { "code", "message", "details" } }`. Validation errors list every
  problem in `details.issues` as `{ path: "steps.0.value", message }`.
- `limit` above 100 is clamped to 100. A bad `status`, `limit` or `cursor` is a 400.
- Optional `X-Event-Id` header on webhooks (see question 3).

Full contract: [`docs/architecture.md`](docs/architecture.md#5-api-contract).

---

## 2. How the code is organised

```
packages/shared/   @flowlet/shared: Zod schemas and types used by BOTH the API and the web form
apps/api/          @flowlet/api: Bun + Hono
  migrations/      0001_init, 0002_preserve_json_key_order, 0003_event_id_dedupe
  scripts/         migrate.ts
  src/app.ts       createApp(deps): builds the app from injected repositories, opens no connections
  src/index.ts     connects MongoDB + PostgreSQL, starts Bun.serve
  src/lib/         ApiError + one error shape, JSON/Zod helpers, retry
  src/modules/
    flows/         FlowRepository interface, Mongo implementation, routes
    engine/        path, filter, transform, http-request, runner: pure logic, no DB, no HTTP framework
    webhooks/      HMAC signature check, trigger route
    runs/          RunRepository interface, Bun.SQL implementation, cursor, routes
    mock/          /api/mock/receiver
  test/            unit, API (in-memory repositories) and integration (real DBs) tests
apps/web/          @flowlet/web: Next.js App Router
  src/app/         /flows, /flows/new, /flows/[id], /flows/[id]/edit, /runs/[id] + loading/error/not-found
  src/components/  FlowForm, StepEditor, FlowDetail, RunHistory, RunDetail, states, badges...
  src/lib/         typed API client, useApi hook, WebCrypto signing, form draft <-> request mapping
docs/              design docs and the phase plan
```

Layering in the API: **routes → repository interfaces → databases**. Routes only do HTTP
(validate, status codes). The engine only does step logic. Because `createApp` takes its
repositories as arguments, the API tests run the real routes on in-memory repositories with
`app.request()`: no port and no database.

**One set of validation rules:** `createFlowSchema` in `@flowlet/shared` validates
`POST /api/flows` on the server *and* the form in the browser, so the message next to a field is
the same one the API would return.

**Tests (90):** filter operators, transform mapping, dot paths, http_request against a real local
server (500, timeout, redirect, 2 KB cap), the runner, HMAC signatures (checked against a digest
computed with `openssl`), cursors, the schemas, and API tests for every endpoint and every webhook
status code. Integration tests run the real SQL against PostgreSQL: pagination, stats, cascade,
key order, and a concurrent `X-Event-Id` claim. They are skipped with a warning if PostgreSQL
is not reachable.

---

## 3. What is finished, what is not, known issues

**Finished**
- Everything in sections 3 to 5 of the brief: flows CRUD (MongoDB), the webhook trigger with every
  status code, run history (PostgreSQL), all five pages with loading, empty and error states, 375 px
  layout, labelled fields, committed migrations, cursor pagination, stats in SQL, tests.
- Optional extra 1: **duplicate events ignored by `X-Event-Id`**.
- Optional extra 2: **GitHub Actions** workflow: typecheck, migrate and test against MongoDB and
  PostgreSQL service containers.
- Checked end to end: a fresh clone with the six commands above, the brief's curl example, and the
  full UI journey in a headless browser at 375 px.

**Not done / limitations (deliberate, within the brief's scope)**
- Steps run inside the webhook request, as the brief asks. A slow `http_request` target holds the
  request for up to 5 s. See question 5.
- `http_request` can call any http(s) URL, including internal addresses (no SSRF protection).
  A real deployment needs an allow/deny list. Redirects are not followed.
- No login (out of scope), so anyone who can open the web app can see a flow's secret.
  There is no secret rotation.
- The flow list returns at most 100 flows, without pagination.
- If the process dies mid-run, that run stays `running`. There is no job that marks it failed.
- Concurrent `PATCH`es to the same flow: last write wins.
- "Send test event" signs in the browser with WebCrypto, which only exists on `localhost` or https.
  On a LAN IP it shows a clear message instead.

**Known bugs:** none known.

---

## 4. Time spent

**TODO: fill in the real number of hours before submitting.**

---

## 5. AI tools used

- **Claude Code** (Anthropic, model Claude Opus 5.5), used throughout:
  - Reading the brief and writing the design docs and phase plan in [`docs/`](docs/README.md).
  - Generating the code phase by phase, writing the tests, and running browser QA through a
    headless browser.
  - Debugging. For example, it found that Bun 1.3's SQL client double-encoded strings sent to
    `jsonb`, that `@types/bun` 1.4 describes APIs Bun 1.3 does not have, and that `jsonb`
    reordered object keys (fixed in migration 0002).
  - Commits made with it carry a `Co-Authored-By` trailer.
- Every design decision is written down in [`docs/decisions.md`](docs/decisions.md), and I can
  explain and change any part of the code.

---

## 6. Questions

**Why do flows fit MongoDB and runs fit PostgreSQL? Would you have chosen differently?**
A flow is one self-contained document: its steps are a short list whose shape depends on the step
type. It is always read whole (one `findOne` per webhook) and written whole, and a new step type needs
no migration. Runs are the opposite: append-only, relational (a run has many steps, linked by a
foreign key with cascade), filtered, paginated and aggregated, which is what SQL is for. On my own I
would probably use only PostgreSQL, with steps in a `jsonb` column. It handles both shapes, and it
removes the cross-database problems: no foreign key between flows and runs, and a delete that cannot
be atomic.

**Which indexes did you create, and which query does each one serve?**
- MongoDB `flows_created_desc { createdAt: -1, _id: -1 }`: the flow list,
  `find({}, projection).sort({ createdAt: -1, _id: -1 }).limit(100)`. `explain()` shows `IXSCAN`
  and no in-memory `SORT`.
- PostgreSQL `runs_flow_started_idx (flow_id, started_at DESC, id DESC)`: the run list
  `WHERE flow_id = $1 AND (started_at, id) < ($cursor) ORDER BY started_at DESC, id DESC LIMIT n+1`.
  `EXPLAIN` shows an index-only scan with the row comparison as the index condition and no sort.
  It also serves stats, latest-run-per-flow (`DISTINCT ON`) and delete-by-flow.
- `runs_flow_status_started_idx (flow_id, status, started_at DESC, id DESC)`: the run list with `?status=`.
- `runs_flow_event_uniq (flow_id, event_id) WHERE event_id IS NOT NULL`: claiming an `X-Event-Id` (unique, partial).
- Primary keys: `runs(id)` for `GET /api/runs/:id`, `run_steps(run_id, position)` for a run's steps
  in order, which also covers the cascade.

**What happens if the same event is delivered twice?**
Without an `X-Event-Id` header, Flowlet cannot tell a retry from a new event with the same body, so
it creates two runs and any `http_request` step sends twice. Deduplicating on a body hash would be
wrong, because two identical orders can both be real. With `X-Event-Id`, the run row is claimed
*before* any step runs: `INSERT ... ON CONFLICT (flow_id, event_id) DO NOTHING` on a partial unique
index. Two parallel deliveries cannot both win (tested with five at once against PostgreSQL). A
repeat gets `200` with the original `runId` and status plus `"duplicate": true`. If the original is
still running, it gets `409 DUPLICATE_EVENT`, so the sender retries and then gets the final result.

**What happens to the run history when a flow is deleted? Why did you choose that?**
It is deleted too: `DELETE FROM runs WHERE flow_id = $1`, and `run_steps` go through
`ON DELETE CASCADE`. A run means little without its flow, and payloads can hold personal data such
as emails, which should not outlive the flow. MongoDB is deleted first, because it is the source of
truth. If the PostgreSQL delete then fails, the leftover runs are unreachable through the API (the
flow's endpoints return 404), and the error is logged. For a real product I would soft-delete flows
and keep runs for a fixed retention period instead, for auditing.

**If this service received 100 events per second, what would break first, and what would you change?**
The steps run inside the HTTP request, so the first thing to break is the `http_request` step.
With a slow target (up to 5 s each), hundreds of requests pile up in flight. Senders time out and
retry, which adds duplicates on top of the load. Next is PostgreSQL: each event is one insert plus a
transaction with up to six statements, through a pool of 10 connections. Changes:
- Accept the event, store it, return `202`, and run the steps in workers from a queue.
- Insert all step rows in one statement.
- Cache flow documents in memory for a few seconds.
- Limit concurrency per target host.
- Partition `runs` by month, with retention.

---

## Security notes

- The signature is HMAC-SHA256 over the **raw body bytes**, compared with `crypto.timingSafeEqual`.
  The header must be exactly `sha256=<64 hex>`. A bad signature records no run.
- Check order: 404 → 401 → 400 → 409. A caller without the secret cannot learn whether a flow is enabled.
- Request bodies are capped at 1 MB. Dot paths only read own properties, so `__proto__` and
  `constructor` cannot reach the prototype. Unknown keys such as `webhookSecret` are rejected by the
  strict schemas.
- No credentials in the repository. `.env.example` holds only local Docker defaults.
