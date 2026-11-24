# Module: Flows (MongoDB)

**Purpose:** create, read, update, delete, enable and disable flows.

**Phase:** 3 · **Location:** `apps/api/src/modules/flows/`, `apps/api/src/db/mongo.ts`

## Repository interface

```ts
export interface FlowRepository {
  create(input: CreateFlowInput): Promise<Flow>;
  list(limit: number): Promise<FlowListItem[]>;     // no steps, no secret
  findById(id: string): Promise<Flow | null>;       // null for unknown or invalid id
  update(id: string, patch: UpdateFlowInput): Promise<Flow | null>;
  delete(id: string): Promise<boolean>;
}
```

`MongoFlowRepository` implements it for production. `InMemoryFlowRepository` (in `test/`) is
used by the API tests.

## Document mapping

```ts
// Mongo → API
const toFlow = (d: FlowDocument): Flow => ({
  id: d._id.toHexString(), name: d.name, description: d.description, enabled: d.enabled,
  steps: d.steps, webhookSecret: d.webhookSecret,
  createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString(),
});
```

- The id is checked with `ObjectId.isValid` **and** a 24-hex regex before querying. An invalid
  id returns `null`, which becomes 404.
- `webhookSecret` = 32 bytes from `crypto.getRandomValues`, hex encoded. It is set on create
  only. `.strict()` on the schemas means a client cannot send or overwrite it.

## The list query (bounded read)

```ts
collection
  .find({}, { projection: { name: 1, description: 1, enabled: 1, createdAt: 1, updatedAt: 1,
                            stepCount: { $size: "$steps" } } })
  .sort({ createdAt: -1, _id: -1 })
  .limit(100)
```

- **Projection:** steps and the secret never leave the database for the list. `stepCount` is
  computed in the projection (`$size` is supported in `find` projections in MongoDB 4.4+).
- **Limit:** hard cap of 100.
- **Index:** `{ createdAt: -1, _id: -1 }`, named `flows_created_desc`. The sort walks the index,
  so there is no in-memory sort, and it stops after 100 entries.

The route then calls `runs.latestByFlowIds(ids)` **once**, a single SQL query with
`DISTINCT ON (flow_id)`. It attaches `lastRun` to each item, so there is no N+1 query.

## Routes

| Route | Logic |
| --- | --- |
| `POST /api/flows` | `readJson` → `parseWith(createFlowSchema)` → `create` → **201** |
| `GET /api/flows` | `list(100)` → `latestByFlowIds` → **200** array |
| `GET /api/flows/:id` | `findById` or 404 → **200** |
| `PATCH /api/flows/:id` | `parseWith(updateFlowSchema)` → `findOneAndUpdate({_id}, {$set: {...patch, updatedAt}}, {returnDocument: "after"})` or 404 → **200** |
| `DELETE /api/flows/:id` | `delete` or 404 → `runs.deleteByFlow(id)` → **204** |

Enable / disable is `PATCH { "enabled": false }`, so the UI toggle needs no extra endpoint.

## Edge cases

- PATCH with `steps` replaces the whole array (it is validated as 1..5 steps). Partial step edits
  are not supported; the form always sends the full list.
- `description: ""` is stored as `null`.
- Two parallel PATCHes: last write wins. That is acceptable at this scope, and noted in the README.

## Tests

- Create returns 201, an `id` and a 64-character hex `webhookSecret`.
- Invalid bodies return 400 with `details.issues[].path` (for example `name`, `steps.0.value`).
- The list never contains `steps` or `webhookSecret`.
- GET, PATCH and DELETE with an unknown or malformed id return 404.
