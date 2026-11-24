# Module: Runs (PostgreSQL)

**Purpose:** store every accepted event as a run with one record per step. Serve the history
with cursor pagination and compute stats in SQL.

**Phase:** 5 · **Location:** `apps/api/migrations/`, `apps/api/scripts/migrate.ts`,
`apps/api/src/modules/runs/`, `apps/api/src/db/postgres.ts`

## Schema (after migrations 0001 to 0003)

| File | Change |
| --- | --- |
| `0001_init.sql` | `runs`, `run_steps` (FK with `ON DELETE CASCADE`), CHECK constraints, the two run-list indexes |
| `0002_preserve_json_key_order.sql` | `payload`, `input`, `output` from `jsonb` to `json` (see below) |
| `0003_event_id_dedupe.sql` | `runs.event_id` and the partial unique index for `X-Event-Id` |

```sql
CREATE TABLE runs (
  id           uuid        PRIMARY KEY,
  flow_id      text        NOT NULL,
  event_id     text,                                     -- 0003
  status       text        NOT NULL CHECK (status IN ('running','success','filtered','failed')),
  payload      json        NOT NULL,                     -- 0002: was jsonb
  error        text,
  started_at   timestamptz NOT NULL,
  finished_at  timestamptz,
  duration_ms  integer     CHECK (duration_ms >= 0),
  CHECK ((status = 'running') = (finished_at IS NULL))
);

CREATE TABLE run_steps (
  run_id       uuid        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  position     smallint    NOT NULL CHECK (position BETWEEN 1 AND 5),
  type         text        NOT NULL CHECK (type IN ('filter','transform','http_request')),
  status       text        NOT NULL CHECK (status IN ('success','failed','skipped')),
  input        json,                                     -- 0002: was jsonb
  output       json,                                     -- 0002: was jsonb
  error        text,
  duration_ms  integer     NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  PRIMARY KEY (run_id, position)
);

CREATE INDEX runs_flow_started_idx        ON runs (flow_id, started_at DESC, id DESC);
CREATE INDEX runs_flow_status_started_idx ON runs (flow_id, status, started_at DESC, id DESC);
CREATE UNIQUE INDEX runs_flow_event_uniq  ON runs (flow_id, event_id) WHERE event_id IS NOT NULL;  -- 0003
```

- Run ids are **UUIDv7** (`Bun.randomUUIDv7()`). They are time ordered, so inserts land at the
  end of the primary-key B-tree instead of at random places.
- `CHECK` constraints keep bad statuses out even if the application has a bug.
- **Why `json` and not `jsonb`:** `jsonb` reorders object keys, so a transform with mapping
  `{ orderId, total, email }` came back as `{ email, total, orderId }`. We never query inside
  these columns, so `json` (stored exactly as written, still validated) is the better fit.
  Values go in as `${JSON.stringify(v)}::text::json` and come out as `column::text` + `JSON.parse`,
  which works the same on every Bun version.

- Run ids are **UUIDv7** (`Bun.randomUUIDv7()`). They are time ordered, so inserts land at the
  end of the primary-key B-tree instead of at random places.
- `CHECK` constraints keep bad statuses out even if the application has a bug.

## Indexes

| Index | Serves |
| --- | --- |
| `runs_pkey (id)` | `GET /api/runs/:runId` |
| `run_steps_pkey (run_id, position)` | Loading a run's steps in order. Also covers the FK for the cascade delete |
| `runs_flow_started_idx` | Unfiltered run list (keyset, newest first), `stats`, `latestByFlowIds` (`DISTINCT ON`), `deleteByFlow` |
| `runs_flow_status_started_idx` | Run list with `?status=`: equality on two columns, then the same order |
| `runs_flow_event_uniq` (partial) | `X-Event-Id` dedupe claim. Only rows with an event id are indexed |

## Migrate script (`scripts/migrate.ts`)

1. Connect to Postgres, retrying every second for up to 30 seconds. Containers started with
   `docker compose up -d` are not ready immediately, and the brief runs `migrate` right after.
2. `CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`.
3. Under an advisory lock, apply every pending `migrations/*.sql` in name order and record it,
   all in **one transaction**. A failing migration leaves nothing half applied.
4. Connect to Mongo (with the same retry) and `ensureFlowIndexes()`. `createIndex` is idempotent.
5. Print what was applied and exit 0. On error, print it and exit 1.

## Repository interface

```ts
export interface RunRepository {
  start(input: { flowId: string; payload: JsonValue; startedAt: Date }): Promise<string>;
  claim(input: { flowId; payload; startedAt; eventId: string }): Promise<ClaimResult>;  // X-Event-Id
  finish(runId: string, result: RunResult, finishedAt: Date, durationMs: number): Promise<void>;
  listByFlow(flowId: string, q: { status?: RunStatus; limit: number; cursor?: Cursor }): Promise<RunPage>;
  findById(runId: string): Promise<Run | null>;
  stats(flowId: string): Promise<FlowStats>;
  latestByFlowIds(flowIds: string[]): Promise<Map<string, LastRun>>;
  deleteByFlow(flowId: string): Promise<void>;
}
```

`finish` runs in one transaction (`sql.begin`): one `INSERT INTO run_steps` per step (at most 5), then
`UPDATE runs SET status, error, finished_at, duration_ms`.

## Cursor pagination

The cursor is base64url of `{"t":"2026-11-24T10:00:00.123Z","id":"0193..."}`, the sort key of the
last item on the page. It is opaque to the client.

```sql
SELECT id, flow_id, status, error, started_at, finished_at, duration_ms
FROM runs
WHERE flow_id = $1
  AND ($2::text IS NULL OR status = $2)
  AND ($3::timestamptz IS NULL OR (started_at, id) < ($3, $4::uuid))
ORDER BY started_at DESC, id DESC
LIMIT $5 + 1;
```

- Fetching `limit + 1` rows tells us whether a next page exists without a `COUNT`.
- The row comparison `(started_at, id) < (...)` gives a stable order even when two runs share a
  timestamp. New runs arriving while you page never cause duplicates or gaps.
- `started_at` is written from a JS `Date` (millisecond precision), so it survives the
  round trip through the cursor exactly.
- A cursor that does not decode to that shape → `400 VALIDATION_ERROR`.
- No `payload` in list rows. The list stays small, and the payload is loaded on the run page.

## Stats (one SQL query)

```sql
SELECT
  count(*)::int                                        AS total,
  count(*) FILTER (WHERE status = 'success')::int      AS success,
  count(*) FILTER (WHERE status = 'failed')::int       AS failed,
  count(*) FILTER (WHERE status = 'filtered')::int     AS filtered,
  round(avg(duration_ms) FILTER (WHERE status <> 'running'))::int AS avg_duration_ms,
  max(started_at)                                      AS last_run_at
FROM runs WHERE flow_id = $1;
```

With no runs: zeros, `avgDurationMs: null`, `lastRunAt: null`.

## Latest run per flow (for the flow list)

```sql
SELECT DISTINCT ON (flow_id) flow_id, id, status, started_at
FROM runs WHERE flow_id = ANY($1::text[])
ORDER BY flow_id, started_at DESC, id DESC;
```

## Routes

| Route | Logic |
| --- | --- |
| `GET /api/flows/:id/runs` | flow exists or 404 → `parseWith(runListQuerySchema, query)` → `listByFlow` |
| `GET /api/runs/:runId` | UUID check → `findById` or 404 → run with `steps` sorted by position |
| `GET /api/flows/:id/stats` | flow exists or 404 → `stats` |

## Tests

- Unit: cursor encode/decode round trip. A garbage cursor is rejected.
- Integration (runs when Postgres is reachable, which it is after `docker compose up`):
  insert 25 runs → page 1 has 20 items and a cursor, page 2 has 5 and `nextCursor: null`, with no
  overlap. The status filter works. Stats numbers match the inserted rows.
