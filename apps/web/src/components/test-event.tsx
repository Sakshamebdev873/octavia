"use client";

import type { Flow, TriggerResponse } from "@flowlet/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { StatusBadge } from "@/components/badges";
import { describedBy, FieldError } from "@/components/field";
import { Alert } from "@/components/states";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/format";
import { signBody } from "@/lib/sign";
import { SAMPLE_EVENT } from "@/components/webhook-panel";

/**
 * Sends the textarea content to the real webhook endpoint, signed in the
 * browser with the flow's secret: the same path an external system takes.
 */
export function TestEvent({ flow, onSent }: { flow: Flow; onSent: () => void }) {
  const [body, setBody] = useState(() => JSON.stringify(JSON.parse(SAMPLE_EVENT), null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<TriggerResponse | null>(null);
  const [sending, setSending] = useState(false);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setSendError(null);
    try {
      JSON.parse(body);
      setJsonError(null);
    } catch (error) {
      setJsonError(`This is not valid JSON: ${errorMessage(error)}`);
      return;
    }

    setSending(true);
    try {
      // The exact text is signed and sent, so the signature matches the bytes the server receives.
      const signature = await signBody(body, flow.webhookSecret);
      setResult(await api.hooks.trigger(flow.id, body, signature));
      onSent();
    } catch (error) {
      setSendError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card" aria-labelledby="test-heading">
      <h2 id="test-heading">Send test event</h2>
      <form onSubmit={send} noValidate>
        <div className="field">
          <label htmlFor="test-event-body">Event JSON</label>
          <textarea
            {...describedBy("test-event-body", jsonError ?? undefined)}
            value={body}
            rows={10}
            spellCheck={false}
            onChange={(e) => setBody(e.target.value)}
          />
          <FieldError id="test-event-body" error={jsonError ?? undefined} />
        </div>
        {!flow.enabled && (
          <Alert tone="info">This flow is disabled, so the webhook will answer 409 until you enable it.</Alert>
        )}
        <div className="actions">
          <button type="submit" className="button button-primary" disabled={sending}>
            {sending ? "Sending…" : "Send test event"}
          </button>
          {result && (
            <span className="row" role="status">
              Run finished: <StatusBadge status={result.status} />
              <Link href={`/runs/${result.runId}`}>View run →</Link>
            </span>
          )}
        </div>
      </form>
      {sendError && (
        <div style={{ marginTop: "1rem" }}>
          <Alert>{sendError}</Alert>
        </div>
      )}
    </section>
  );
}
