# Module: Testing

**Runner:** `bun test` from the repository root. It finds every `*.test.ts` in the workspace.

The brief asks for at least six tests that check real behaviour: the filter operators, the
transform mapping, signature verification and at least one API endpoint. The plan below goes
further, and every layer is covered.

## Layers

| Layer | How | Needs a DB? |
| --- | --- | --- |
| Shared schemas | Plain `safeParse` assertions | No |
| Engine | Pure functions. HTTP against a local `Bun.serve({ port: 0 })` | No |
| Signature | Known vectors (an `openssl`-computed signature for the brief's body) | No |
| API endpoints | `createApp({ flows: InMemoryFlowRepository, runs: InMemoryRunRepository })` + `app.request()` | No |
| Repositories | The real Mongo and Postgres from `docker compose`, using unique ids and cleaning up after | Yes, skipped with a clear message if unreachable |

The API tests use **in-memory repositories that implement the same interfaces** as the real
ones. This shows the dependency-injection design, keeps the tests fast, and lets them run even
while `bun run dev` is using port 4000.

## Test files

```
packages/shared/test/schemas.test.ts
apps/api/test/path.test.ts
apps/api/test/filter.test.ts
apps/api/test/transform.test.ts
apps/api/test/http-request.test.ts
apps/api/test/runner.test.ts
apps/api/test/signature.test.ts
apps/api/test/cursor.test.ts
apps/api/test/api.flows.test.ts
apps/api/test/api.webhooks.test.ts
apps/api/test/api.mock.test.ts
apps/api/test/integration.postgres.test.ts
apps/api/test/integration.mongo.test.ts
```

## Key cases

- **Filter:** eq, neq, gt, lt, contains (string and array), plus type mismatches and missing fields.
- **Transform:** the brief's mapping gives exactly `{ orderId: "ORD-1042", total: 4999, email: "asha@example.com" }`.
- **Signature:** valid passes; a one-character change fails; missing fails; `sha1=` fails; wrong length fails.
- **Webhook API:** 404, 401 (with zero runs stored), 400, 409, success, filtered.
- **Flows API:** validation shape (`code`, `message`, `details.issues[].path`), and the list hides secrets.
- **Mock receiver:** echo, and `?fail=1` → 500.
- **Postgres:** keyset pages do not overlap; the status filter; stats numbers.

## CI (extra, Phase 8)

`.github/workflows/ci.yml` runs on push: `bun install --frozen-lockfile` → `bun run typecheck` →
`bun run migrate` → `bun test`, with `mongo` and `postgres` as service containers.
