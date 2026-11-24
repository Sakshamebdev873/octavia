# Module: Web app (Next.js App Router)

**Purpose:** a clear and correct interface for flows and runs. The brief judges clarity and
behaviour, not visual polish.

**Phase:** 7 · **Location:** `apps/web/src/` · **Port:** 3000

## Approach

- Pages are App Router routes. Data is fetched in the browser from the REST API on port 4000
  (`NEXT_PUBLIC_API_URL`, default `http://localhost:4000`). The web app is just another client of
  the public contract.
- `next.config.ts` loads the root `.env` with `@next/env`, so there is still a single env file.
- No UI framework. One small `globals.css` with CSS variables, flex/grid layouts, mobile first.
  Tables become stacked cards under 640px. `<pre>` blocks scroll horizontally, so long JSON never
  breaks the 375px layout.

## Shared building blocks

| File | Role |
| --- | --- |
| `lib/api.ts` | Typed client: `api.flows.list()`, `api.flows.get(id)`, `api.runs.list(flowId, q)`, ... Every call returns the `@flowlet/shared` types. Non-2xx throws `ApiClientError { status, code, message, issues }` |
| `lib/use-api.ts` | `useApi(fetcher, deps)` → `{ data, error, loading, reload }` with an abort on unmount or when deps change |
| `lib/sign.ts` | `signBody(raw, secret)` with WebCrypto `HMAC SHA-256` (localhost is a secure context) |
| `components/states.tsx` | `<Loading/>`, `<EmptyState title action/>`, `<ErrorState error onRetry/>` |
| `components/status-badge.tsx` | Colour + text for running / success / filtered / failed / skipped (never colour alone) |
| `components/copy-button.tsx` | Clipboard copy with a "Copied" confirmation |
| `components/json-view.tsx` | Pretty JSON in a scrollable `<pre>` |
| `app/loading.tsx`, `app/error.tsx`, `app/not-found.tsx` | Route-level fallbacks |

## Pages

### `/flows`
- A row/card per flow: name (a link), description, an **Enabled / Disabled** badge, a step count,
  and the **latest run status** with relative time ("success · 2 min ago", or "No runs yet").
- Empty state: "No flows yet" plus a **Create your first flow** button.
- Error state: the message plus **Retry**.

### `/flows/new` and `/flows/[id]/edit` (shared `FlowForm`)
- Fields: Name, Description, an Enabled checkbox. Every input has a `<label htmlFor>`.
- Step list (1 to 5): each card has a **Type** select and fields for that type:
  - filter: Field (dot path), Operator select, Value + a **Value type** select
    (Text / Number / True-False / Null), so `1000` and `"1000"` are never ambiguous.
  - transform: rows of *Output field* → *Source path*, with add/remove row.
  - http_request: URL, Method (POST/PUT).
- Step actions: **Move up**, **Move down**, **Remove**, and **Add step** (disabled at 5). They are
  buttons with `aria-label`s, not drag and drop (which is out of scope).
- Validation: on submit, `createFlowSchema.safeParse(formValues)`. Each issue's path
  (`steps.1.mapping`) maps to a message under that field, linked by `aria-describedby`. Server
  `VALIDATION_ERROR` issues are shown the same way. The submit button shows "Saving..." and is
  disabled while saving.
- Edit loads the flow first (with loading and error states), then reuses the form.

### `/flows/[id]`
- Header: name, enabled badge, **Enable/Disable** toggle, **Edit**, **Delete** (with a confirm).
- **Webhook**: the URL with a copy button and a ready-to-copy `curl` example. It contains the
  real secret and computes the signature with `openssl`, mirroring the brief.
- **Summary**: total, success, filtered, failed, average duration, last run (from `/stats`).
- **Send test event**: a JSON textarea pre-filled with the sample order. It checks the JSON
  locally, signs it with WebCrypto, POSTs to `/api/hooks/:id` and shows the result (status badge +
  a link to the run). It also shows the 409 message for a disabled flow. Afterwards the stats and
  history reload.
- **Run history**: a status filter (All / Success / Filtered / Failed), a list of runs (status,
  started, duration, error), and **Newer / Older** buttons. Older follows `nextCursor`; Newer
  pops a cursor stack. Each row links to `/runs/[id]`. Its own empty state reads "No runs match
  this filter".

### `/runs/[id]`
- Header: run status, flow link, started / finished, duration, error.
- The incoming payload (collapsible).
- **Timeline**: an ordered list, one item per step: position, type, status badge, duration, and
  the input, output and error, each shown only when present. Skipped steps are dimmed and say
  "Skipped because an earlier step stopped the run".

## Accessibility and 375px checklist

- Every input has a label. Error text is linked with `aria-describedby`.
- Buttons are real `<button>`s with a visible focus ring.
- Status is shown with text, not only colour.
- No horizontal page scroll at 375px. Only `<pre>` blocks scroll inside themselves.
