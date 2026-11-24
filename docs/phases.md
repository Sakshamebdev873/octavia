# Build plan, phase by phase

Each phase ends in a working, committed state. A phase is done only when its exit criteria
pass. Commits are small and say what changed. The brief's reviewers read the history.

Budget: about 13 hours. Deadline: 26 Nov 2026, 8:00 PM IST.

| # | Phase | Est. | Output |
| --- | --- | --- | --- |
| 0 | Repo and tooling | 1h | Workspace, strict TS, Docker, env, root scripts |
| 1 | Shared contracts | 1h | `@flowlet/shared` Zod schemas and types |
| 2 | API core | 1h | App factory, config, errors, mock receiver |
| 3 | Flows module | 1.5h | Flow CRUD on MongoDB |
| 4 | Engine | 2h | Filter, transform, http_request, runner + unit tests |
| 5 | Runs module | 1.5h | Migrations, run repo, cursor pagination, stats |
| 6 | Webhook trigger | 1h | Signature check + `/api/hooks/:flowId` + API tests |
| 7 | Web app | 3h | All five pages with loading, empty and error states |
| 8 | Hardening, extras, README | 1h | Fresh-clone check, two extras, README answers |

---

## Phase 0: Repo and tooling

**Goal:** the six run commands from the brief work, even though they do nothing useful yet.

Tasks
- `git init`, `.gitignore` (node_modules, .next, .env, coverage).
- Root `package.json` with `"workspaces": ["apps/*", "packages/*"]` and scripts:
  - `dev`: runs `apps/api` and `apps/web` dev servers together (`bun run --filter`).
  - `migrate`: `bun run --filter @flowlet/api migrate`.
  - `typecheck`: `tsc --noEmit` in every package.
- `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`.
- `docker-compose.yml`: `mongo:8` on 27017, `postgres:17` on 5432, named volumes, healthchecks.
- `.env.example`: `PORT`, `MONGO_URL`, `MONGO_DB`, `DATABASE_URL`, `WEB_ORIGIN`,
  `PUBLIC_API_URL`, `NEXT_PUBLIC_API_URL`. No real secrets: these are local Docker defaults.

Exit criteria
- `docker compose up -d` brings both containers to `healthy`.
- `bun install` creates `bun.lock`. `bun run typecheck` passes.

Commits
- `chore: init bun workspace with strict tsconfig`
- `chore: add docker compose for mongodb and postgres`
- `docs: add architecture, phase plan and module specs`

---

## Phase 1: Shared contracts

**Goal:** one source of truth for every shape that crosses the wire. See [modules/shared.md](modules/shared.md).

Tasks
- Step schemas as a discriminated union on `type`.
- `createFlowSchema`, `updateFlowSchema` (partial, at least one field), response types.
- Run types, `runStatusSchema`, `runListQuerySchema` (status, limit 1..100 default 20, cursor).
- `ApiErrorBody` and the `ErrorCode` union.

Exit criteria
- The schemas reject: a name under 3 or over 80 characters, 0 or 6 steps, `gt` with a non-number
  value, a bad dot path, a non-http(s) URL, `method: "GET"`.
- Types are inferred with `z.infer`. Nothing is written twice.

Commit: `feat(shared): add zod schemas for flows, steps and runs`

---

## Phase 2: API core

**Goal:** a Hono app that already returns correct errors for everything. See [modules/api-core.md](modules/api-core.md).

Tasks
- `config.ts`: parse `process.env` with Zod and fail fast with a clear message.
- `ApiError` class, `onError` and `notFound` handlers that produce the one error shape.
- `readJson(c)` helper: raw text → JSON → `INVALID_JSON`. `validate(schema, data)` → `VALIDATION_ERROR`.
- `bodyLimit` of 1 MB, CORS for `WEB_ORIGIN`, request logging.
- `createApp(deps)` with injected `FlowRepository` and `RunRepository` interfaces.
- `POST /api/mock/receiver` (echo, `?fail=1` → 500).

Exit criteria
- `curl -X POST localhost:4000/api/mock/receiver -d '{"a":1}'` echoes the body.
- An unknown route returns 404 in the error shape.

Commits
- `feat(api): add hono app factory, config and error handling`
- `feat(api): add mock receiver endpoint`

---

## Phase 3: Flows module (MongoDB)

**Goal:** full flow CRUD. See [modules/flows.md](modules/flows.md).

Tasks
- Mongo client with connection lifecycle (`db/mongo.ts`).
- `MongoFlowRepository`: `create`, `list` (projection + limit + sort), `findById`, `update`, `delete`.
- Generate `webhookSecret` with `crypto.getRandomValues` (32 bytes → hex).
- Routes: POST, GET list, GET one, PATCH, DELETE. An invalid ObjectId gives 404.
- The flow list adds `lastRun` (status + time) from Postgres in **one** query for all listed ids.
- `ensureFlowIndexes()` is called by `migrate` and on startup.

Exit criteria
- Create → get → patch → list → delete all work through curl.
- The list response never contains `steps` or `webhookSecret`.

Commits
- `feat(api): add mongodb flow repository with list index`
- `feat(api): add flow CRUD routes`

---

## Phase 4: Engine

**Goal:** the step logic, pure and fully tested. See [modules/engine.md](modules/engine.md).

Tasks
- `getPath(data, "order.customer.email")`: own properties only, array indexes, missing → `null`.
- `evaluateFilter`: eq, neq, gt, lt, contains.
- `applyTransform`: mapping → new object, built with `Object.fromEntries`.
- `executeHttpRequest`: fetch with `AbortSignal.timeout(5000)`, non-2xx → failed, read the first
  2 KB of the body as a stream.
- `runSteps(steps, payload)`: runs in order, measures each step, turns a filter miss into
  `filtered` with the rest `skipped`, turns a failure into `failed` with the rest `skipped`.

Exit criteria
- Unit tests for every operator, transform with missing paths, http success / 500 / timeout,
  and the runner's filtered and failed paths.

Commits
- `feat(engine): add dot path resolver, filter and transform steps`
- `feat(engine): add http_request step with timeout and 2KB body cap`
- `feat(engine): add step runner`
- `test(engine): cover operators, mapping and runner outcomes`

---

## Phase 5: Runs module (PostgreSQL)

**Goal:** run history with real SQL. See [modules/runs.md](modules/runs.md).

Tasks
- `migrations/0001_init.sql`: `runs`, `run_steps` (FK, cascade), CHECK constraints, indexes.
- `scripts/migrate.ts`: retry the connection until ready (about 30s), create `schema_migrations`,
  apply each new file in its own transaction, then ensure the Mongo indexes.
- `PostgresRunRepository`: `start`, `finish` (one transaction), `listByFlow` (keyset),
  `findById` (with steps), `stats` (one aggregate query), `latestByFlowIds`, `deleteByFlow`.
- Cursor: base64url of `{ t: startedAt ISO, id }`. Fetch `limit + 1` rows to know if there is a next page.
- Routes: runs list, run detail, stats.

Exit criteria
- `bun run migrate` is idempotent: running it twice is a no-op.
- `EXPLAIN` for the run list shows an index scan on `runs_flow_started_idx`.

Commits
- `feat(db): add postgres migrations and migrate script`
- `feat(api): add run repository with cursor pagination and sql stats`
- `feat(api): add runs and stats routes`

---

## Phase 6: Webhook trigger

**Goal:** the core feature, end to end. See [modules/webhooks.md](modules/webhooks.md).

Tasks
- `verifySignature(rawBody, header, secret)`: parse `sha256=<64 hex>`, HMAC with
  `Bun.CryptoHasher`, compare with `timingSafeEqual`.
- Route with the exact check order 404 → 401 → 400 → 409 → run.
- Deleting a flow also deletes its runs (see decisions.md).

Exit criteria
- The brief's curl example gives a `success` run with 3 steps. The last step's input is
  `{ orderId, total, email }`.
- `amount: 500` gives `filtered`, with steps 2 and 3 `skipped`.
- A wrong signature gives 401 and **no** row in `runs`.

Commits
- `feat(api): add hmac signature verification`
- `feat(api): add webhook trigger endpoint`
- `test(api): cover webhook status codes and flow validation end to end`

---

## Phase 7: Web app (Next.js)

**Goal:** a clear, correct UI that works at 375px. See [modules/web.md](modules/web.md).

Tasks
- App shell, typed API client, `useApi` hook (loading / error / data / reload).
- `/flows`, `/flows/new`, `/flows/[id]/edit` (shared `FlowForm`), `/flows/[id]`, `/runs/[id]`.
- Loading, empty and error states on every page. `loading.tsx`, `error.tsx`, `not-found.tsx`.
- Labels on every form field. Errors next to the field, from client-side Zod and from the server's `details.issues`.

Exit criteria
- The whole journey works in the browser at 375px wide: create, send a test event, open the
  run, edit, disable (then the test event shows 409), delete.

Commits (one per page group)
- `feat(web): add app shell, api client and state components`
- `feat(web): add flow list page`
- `feat(web): add flow form with step editor`
- `feat(web): add flow detail page with test event and run history`
- `feat(web): add run timeline page`

---

## Phase 8: Hardening, extras, README

Tasks
- Fresh-clone rehearsal: delete the volumes, clone into a new folder, run the six commands exactly.
- Extra 1: **`X-Event-Id` deduplication** (claim the event with a unique index before running).
- Extra 2: **GitHub Actions**: typecheck + `bun test`, with Mongo and Postgres as service containers.
- README: how to run, code layout, done / not done / known bugs, hours, AI tools, the 5 answers.
- Final pass: grep for `any`, `as unknown as`, `@ts-ignore`, `console.log`, secrets.

Commits
- `feat(api): ignore duplicate events by X-Event-Id`
- `ci: add typecheck and test workflow`
- `docs: write README`
