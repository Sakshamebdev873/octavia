"use client";

import type { RunStep } from "@flowlet/shared";
import Link from "next/link";
import { StatusBadge } from "@/components/badges";
import { JsonView } from "@/components/json-view";
import { EmptyState, ErrorState, Loading } from "@/components/states";
import { api } from "@/lib/api";
import { formatDateTime, formatDuration, STEP_TYPE_LABELS } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export function RunDetail({ id }: { id: string }) {
  const { data: run, error, reload } = useApi((signal) => api.runs.get(id, signal), [id]);

  if (error && !run) return <ErrorState error={error} onRetry={reload} title="Could not load the run" />;
  if (!run) return <Loading label="Loading run…" />;

  return (
    <div className="stack">
      <div>
        <p className="breadcrumb">
          <Link href={`/flows/${run.flowId}`}>← Back to the flow</Link>
        </p>
        <div className="page-header">
          <div className="row">
            <h1>Run</h1>
            <StatusBadge status={run.status} />
          </div>
          {run.status === "running" && (
            <button type="button" className="button" onClick={reload}>
              Refresh
            </button>
          )}
        </div>
        <p className="mono muted small" style={{ overflowWrap: "anywhere" }}>
          {run.id}
        </p>
        <dl className="stats">
          <div className="stat">
            <dt>Started</dt>
            <dd className="small">{formatDateTime(run.startedAt)}</dd>
          </div>
          <div className="stat">
            <dt>Finished</dt>
            <dd className="small">{run.finishedAt ? formatDateTime(run.finishedAt) : "not yet"}</dd>
          </div>
          <div className="stat">
            <dt>Duration</dt>
            <dd>{formatDuration(run.durationMs)}</dd>
          </div>
        </dl>
        {run.error && (
          <div className="error-box" role="alert">
            {run.error}
          </div>
        )}
      </div>

      <details className="card">
        <summary>Incoming payload</summary>
        <div style={{ marginTop: "0.75rem" }}>
          <JsonView value={run.payload} label="Incoming payload" />
        </div>
      </details>

      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">Steps</h2>
        {run.steps.length === 0 ? (
          <EmptyState title="No step records">
            {run.status === "running" ? "The run is still in progress." : "This run has no recorded steps."}
          </EmptyState>
        ) : (
          <ol className="timeline">
            {run.steps.map((step) => (
              <TimelineItem key={step.position} step={step} />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function TimelineItem({ step }: { step: RunStep }) {
  return (
    <li className={`timeline-item is-${step.status}`}>
      <span className={`timeline-dot dot-${step.status}`} aria-hidden="true" />
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>
            Step {step.position}: {STEP_TYPE_LABELS[step.type]}
          </h3>
          <span className="row">
            <StatusBadge status={step.status} />
            <span className="muted small">{formatDuration(step.durationMs)}</span>
          </span>
        </div>

        {step.status === "skipped" ? (
          <p className="muted small" style={{ margin: "0.5rem 0 0" }}>
            Skipped because an earlier step stopped the run.
          </p>
        ) : (
          <div className="io">
            <div>
              <p className="label">Input</p>
              {step.input === null ? <p className="muted small">none</p> : <JsonView value={step.input} label="Step input" />}
            </div>
            <div>
              <p className="label">Output</p>
              {step.output === null ? (
                <p className="muted small">none</p>
              ) : (
                <JsonView value={step.output} label="Step output" />
              )}
            </div>
          </div>
        )}

        {step.error && <div className="error-box">Error: {step.error}</div>}
      </div>
    </li>
  );
}
