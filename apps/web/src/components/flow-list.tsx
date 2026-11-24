"use client";

import Link from "next/link";
import { EnabledBadge, StatusBadge } from "@/components/badges";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export function FlowList() {
  const { data: flows, error, reload } = useApi((signal) => api.flows.list(signal), []);

  let content;
  if (error && !flows) {
    content = <ErrorState error={error} onRetry={reload} title="Could not load flows" />;
  } else if (!flows) {
    content = <Loading label="Loading flows…" />;
  } else if (flows.length === 0) {
    content = (
      <EmptyState
        title="No flows yet"
        action={
          <Link className="button button-primary" href="/flows/new">
            Create your first flow
          </Link>
        }
      >
        A flow receives webhook events and runs up to five steps on each one.
      </EmptyState>
    );
  } else {
    content = (
      <ul className="card-list">
        {flows.map((flow) => (
          <li key={flow.id} className="card">
            <div className="row">
              <Link href={`/flows/${flow.id}`} className="row-title">
                {flow.name}
              </Link>
              <EnabledBadge enabled={flow.enabled} />
            </div>
            {flow.description && <p className="muted small">{flow.description}</p>}
            <div className="meta">
              <span>
                {flow.stepCount} {flow.stepCount === 1 ? "step" : "steps"}
              </span>
              <span>
                Latest run:{" "}
                {flow.lastRun ? (
                  <>
                    <StatusBadge status={flow.lastRun.status} />{" "}
                    <time dateTime={flow.lastRun.startedAt} title={formatDateTime(flow.lastRun.startedAt)}>
                      {formatRelative(flow.lastRun.startedAt)}
                    </time>
                  </>
                ) : (
                  "no runs yet"
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <div className="page-header">
        <h1>Flows</h1>
        <Link className="button button-primary" href="/flows/new">
          New flow
        </Link>
      </div>
      {content}
    </>
  );
}
