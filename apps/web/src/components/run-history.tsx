"use client";

import type { RunStatus } from "@flowlet/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/badges";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { api } from "@/lib/api";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 10;
const FILTERS: { value: RunStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "success", label: "Success" },
  { value: "filtered", label: "Filtered" },
  { value: "failed", label: "Failed" },
  { value: "running", label: "Running" },
];

/**
 * Cursor pagination: `cursors` holds the cursor of every page we went through,
 * so "Newer" pops back and "Older" pushes the API's nextCursor.
 */
export function RunHistory({ flowId, refreshKey }: { flowId: string; refreshKey: number }) {
  const [status, setStatus] = useState<RunStatus | "">("");
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1) ?? null;

  // A new run arrived: go back to the first page to show it.
  useEffect(() => setCursors([]), [refreshKey]);

  const { data: page, error, loading, reload } = useApi(
    (signal) => api.flows.runs(flowId, { status: status || undefined, limit: PAGE_SIZE, cursor }, signal),
    [flowId, status, cursor, refreshKey],
  );

  let content;
  if (error) {
    content = <ErrorState error={error} onRetry={reload} title="Could not load runs" />;
  } else if (!page) {
    content = <Loading label="Loading runs…" />;
  } else if (page.items.length === 0) {
    content = status ? (
      <EmptyState title="No runs match this filter">Choose another status or send a test event.</EmptyState>
    ) : (
      <EmptyState title="No runs yet">Send a test event above, or call the webhook URL.</EmptyState>
    );
  } else {
    content = (
      <ul className={`card-list ${loading ? "is-refreshing" : ""}`} aria-busy={loading}>
        {page.items.map((run) => (
          <li key={run.id} className="card">
            <Link href={`/runs/${run.id}`} className="run-row">
              <span className="row">
                <StatusBadge status={run.status} />
                <span className="row-title">
                  <time dateTime={run.startedAt} title={formatDateTime(run.startedAt)}>
                    {formatRelative(run.startedAt)}
                  </time>
                </span>
              </span>
              <span className="meta">
                <span>{formatDateTime(run.startedAt)}</span>
                <span>Duration {formatDuration(run.durationMs)}</span>
              </span>
              {run.error && <span className="small" style={{ color: "var(--failed-fg)" }}>{run.error}</span>}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  const pageNumber = cursors.length + 1;

  return (
    <section aria-labelledby="history-heading">
      <div className="page-header">
        <h2 id="history-heading">Run history</h2>
        <div className="field" style={{ margin: 0, minWidth: "10rem" }}>
          <label htmlFor="run-status-filter" className="sr-only">
            Filter by status
          </label>
          <select
            id="run-status-filter"
            value={status}
            onChange={(e) => {
              setStatus(FILTERS.find((f) => f.value === e.target.value)?.value ?? "");
              setCursors([]);
            }}
          >
            {FILTERS.map((filter) => (
              <option key={filter.value} value={filter.value}>
                {filter.value ? `Status: ${filter.label}` : "All statuses"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {content}

      {page && (cursors.length > 0 || page.nextCursor) && (
        <nav className="pagination" aria-label="Run history pages">
          <button
            type="button"
            className="button button-small"
            disabled={cursors.length === 0 || loading}
            onClick={() => setCursors(cursors.slice(0, -1))}
          >
            ← Newer
          </button>
          <span className="muted small">Page {pageNumber}</span>
          <button
            type="button"
            className="button button-small"
            disabled={!page.nextCursor || loading}
            onClick={() => page.nextCursor && setCursors([...cursors, page.nextCursor])}
          >
            Older →
          </button>
        </nav>
      )}
    </section>
  );
}
