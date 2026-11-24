# Module: Engine

**Purpose:** run a flow's steps against an event. It has no database code and no Hono imports.
Its inputs are steps and JSON, and its output is a result object, which makes it the
best-tested part of the code.

**Phase:** 4 · **Location:** `apps/api/src/modules/engine/`

## Files

| File | Export |
| --- | --- |
| `path.ts` | `getPath(data: JsonValue, path: string): JsonValue` |
| `filter.ts` | `evaluateFilter(step: FilterStep, data: JsonValue): FilterResult` |
| `transform.ts` | `applyTransform(step: TransformStep, data: JsonValue): JsonObject` |
| `http-request.ts` | `executeHttpRequest(step, data, opts): Promise<HttpStepResult>` |
| `runner.ts` | `runSteps(steps: Step[], payload: JsonValue, opts): Promise<RunResult>` |

## Dot paths (`path.ts`)

`getPath({ order: { customer: { email: "a@b" } } }, "order.customer.email")` → `"a@b"`

- Splits on `.` and walks one segment at a time.
- Objects: only **own** properties (`Object.hasOwn`). So `__proto__`, `constructor` and
  `toString` resolve to `null`, never to a prototype.
- Arrays: a segment of digits indexes the array (`items.0.sku`).
- Anything missing, or walking into a primitive, returns `null`.

## Filter (`filter.ts`)

```ts
export interface FilterResult { passed: boolean; actual: JsonValue }
```

| Operator | True when |
| --- | --- |
| `eq` | `actual === value` (primitives, strict) |
| `neq` | `!(actual === value)` |
| `gt` | both are finite numbers and `actual > value` |
| `lt` | both are finite numbers and `actual < value` |
| `contains` | `actual` is a string and `value` is a string and `actual.includes(value)`; **or** `actual` is an array with an element `=== value` |

The step output is `{ passed, actual }`, so the timeline shows *why* a filter stopped a run.
The switch is exhaustive over the operator union: a new operator added to the schema is a
compile error until it is handled here.

## Transform (`transform.ts`)

```ts
applyTransform({ type: "transform", mapping: { orderId: "order.id", total: "order.amount" } }, data)
// → { orderId: "ORD-1042", total: 4999 }
```

- Built with `Object.fromEntries(Object.entries(mapping).map(([k, p]) => [k, getPath(data, p)]))`.
  `fromEntries` defines own properties, so even an odd key cannot change the prototype.
- A missing path gives `null`. The new object becomes the data for the next step.

## HTTP request (`http-request.ts`)

```ts
export interface HttpStepResult {
  ok: boolean;
  output: { status: number; body: string } | null;   // null on network error / timeout
  error: string | null;
}
```

- `fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  signal: AbortSignal.timeout(5000), redirect: "manual" })`.
- The timeout covers the whole exchange, including reading the body.
- **First 2 KB of the body:** read `response.body` as a stream, collect bytes until 2048, then
  `reader.cancel()`. Memory stays bounded even if the target returns megabytes. Decoded as UTF-8.
- Non-2xx: `ok: false`, the output still has the status and body, and the error is `HTTP 500`.
- Timeout: error `Timed out after 5000 ms`. Network error: `Network error: <message>`.
- The data passed on to the next step is the data that was sent (see decisions.md).
- `fetch` and the timeout are injectable through `opts`, so tests can use a 50 ms timeout.

## Runner (`runner.ts`)

```ts
export interface StepOutcome {
  position: number; type: StepType; status: "success" | "failed" | "skipped";
  input: JsonValue | null; output: JsonValue | null; error: string | null; durationMs: number;
}
export interface RunResult { status: "success" | "filtered" | "failed"; error: string | null; steps: StepOutcome[] }
```

```
data = payload
for each step at position i:
  if already stopped → record skipped (input null, output null, 0 ms)
  start = performance.now()
  filter:     result = evaluateFilter → success; if !passed → run status filtered, stop
  transform:  data = applyTransform  → success
  http:       result = await executeHttpRequest → success or failed (run failed, stop)
  any thrown error → step failed, run failed with that message, stop
  record { input: data before the step, output, durationMs }
```

- A filter miss is **not** a failure. The filter step itself is `success` (it ran fine), and
  the run status is `filtered`.
- The run's `error` is set only when the status is `failed`, for example
  `Step 3 (http_request): HTTP 500`.
- Durations come from `performance.now()` and are rounded to whole milliseconds.

## Tests

- `getPath`: nested, arrays, missing → null, `__proto__` → null.
- Every operator, true and false cases, including type mismatches (`gt` on a string → false).
- `contains` on a string and on an array.
- Transform: the brief's mapping gives `{ orderId, total, email }`; a missing path gives null.
- HTTP against a local `Bun.serve({ port: 0 })`: 200 → success; 500 → failed with the status
  stored; a slow handler plus a 50 ms timeout → failed; a 10 KB body → stored body is 2048 bytes.
- Runner: amount 4999 → success with 3 steps; amount 500 → filtered with steps 2 and 3 skipped;
  http 500 → failed.
