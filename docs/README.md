# Flowlet docs

Flowlet is a small webhook automation service. A user defines a **flow** (1 to 5 steps).
An external system sends a signed event to the flow's webhook URL. Flowlet verifies the
signature, runs the steps in order and records the result as a **run**, step by step.

These docs are the design and build plan for the project. They were written before the code
and are kept in sync with it.

| Doc | What it covers |
| --- | --- |
| [architecture.md](architecture.md) | Stack, repository layout, request lifecycle, data model, API contract |
| [phases.md](phases.md) | The build plan, phase by phase, with tasks, exit criteria and commits |
| [decisions.md](decisions.md) | Assumptions where the brief is open, trade-offs, questions for the reviewers |
| [modules/shared.md](modules/shared.md) | `@flowlet/shared`: Zod schemas and types used by both API and web |
| [modules/api-core.md](modules/api-core.md) | Config, app factory, dependency injection, error handling, mock receiver |
| [modules/flows.md](modules/flows.md) | Flow CRUD on MongoDB |
| [modules/engine.md](modules/engine.md) | Dot paths, filter, transform, http_request, the step runner |
| [modules/webhooks.md](modules/webhooks.md) | Signature verification and the trigger endpoint |
| [modules/runs.md](modules/runs.md) | PostgreSQL schema, migrations, run history, cursor pagination, stats |
| [modules/web.md](modules/web.md) | The Next.js App Router frontend |
| [modules/testing.md](modules/testing.md) | Test strategy and the test list |

## Stack (fixed by the brief)

| Layer | Choice |
| --- | --- |
| Language | TypeScript, `"strict": true` everywhere, no `any` |
| Backend runtime | Bun (`Bun.serve`) with **Hono** as the router |
| Package manager | Bun workspaces, `bun.lock` committed |
| Frontend | Next.js (App Router) |
| Flow definitions | MongoDB (official `mongodb` driver) |
| Run history | PostgreSQL (Bun's built-in `Bun.SQL` client) |
| Validation | Zod, shared between backend and frontend |
| Tests | `bun test` |
