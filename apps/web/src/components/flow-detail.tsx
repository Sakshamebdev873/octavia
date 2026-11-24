"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EnabledBadge } from "@/components/badges";
import { RunHistory } from "@/components/run-history";
import { StatsPanel } from "@/components/stats-panel";
import { Alert, ErrorState, Loading } from "@/components/states";
import { TestEvent } from "@/components/test-event";
import { WebhookPanel } from "@/components/webhook-panel";
import { api } from "@/lib/api";
import { describeStep, errorMessage, formatDateTime, STEP_TYPE_LABELS } from "@/lib/format";
import { useApi } from "@/lib/use-api";

export function FlowDetail({ id }: { id: string }) {
  const router = useRouter();
  const flowState = useApi((signal) => api.flows.get(id, signal), [id]);
  const statsState = useApi((signal) => api.flows.stats(id, signal), [id]);
  const [runsVersion, setRunsVersion] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const flow = flowState.data;
  if (flowState.error && !flow) {
    return <ErrorState error={flowState.error} onRetry={flowState.reload} title="Could not load the flow" />;
  }
  if (!flow) return <Loading label="Loading flow…" />;

  async function toggleEnabled() {
    if (!flow) return;
    setBusy(true);
    setActionError(null);
    try {
      flowState.setData(await api.flows.update(flow.id, { enabled: !flow.enabled }));
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function deleteFlow() {
    if (!flow || !window.confirm(`Delete "${flow.name}" and its run history? This cannot be undone.`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.flows.remove(flow.id);
      router.push("/flows");
    } catch (error) {
      setActionError(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <p className="breadcrumb">
          <Link href="/flows">← All flows</Link>
        </p>
        <div className="page-header">
          <div className="row">
            <h1>{flow.name}</h1>
            <EnabledBadge enabled={flow.enabled} />
          </div>
          <div className="actions">
            <button type="button" className="button" onClick={toggleEnabled} disabled={busy}>
              {flow.enabled ? "Disable" : "Enable"}
            </button>
            <Link className="button" href={`/flows/${flow.id}/edit`}>
              Edit
            </Link>
            <button type="button" className="button button-danger" onClick={deleteFlow} disabled={busy}>
              Delete
            </button>
          </div>
        </div>
        {flow.description && <p className="muted">{flow.description}</p>}
        <p className="muted small">
          Created {formatDateTime(flow.createdAt)} · Updated {formatDateTime(flow.updatedAt)}
        </p>
        {actionError && <Alert>{actionError}</Alert>}
      </div>

      <section className="card" aria-labelledby="steps-heading">
        <h2 id="steps-heading">Steps</h2>
        <ol style={{ margin: 0, paddingLeft: "1.25rem" }}>
          {flow.steps.map((step, index) => (
            <li key={index} style={{ marginBottom: "0.35rem", overflowWrap: "anywhere" }}>
              <strong>{STEP_TYPE_LABELS[step.type]}</strong>: <span className="mono">{describeStep(step)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading">Summary</h2>
        {statsState.error && !statsState.data ? (
          <ErrorState error={statsState.error} onRetry={statsState.reload} title="Could not load the summary" />
        ) : statsState.data ? (
          <StatsPanel stats={statsState.data} />
        ) : (
          <Loading label="Loading summary…" />
        )}
      </section>

      <WebhookPanel flow={flow} />

      <TestEvent
        flow={flow}
        onSent={() => {
          statsState.reload();
          setRunsVersion((v) => v + 1);
        }}
      />

      <RunHistory flowId={flow.id} refreshKey={runsVersion} />
    </div>
  );
}
