"use client";

import type { Flow } from "@flowlet/shared";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { webhookUrl } from "@/lib/api";

export const SAMPLE_EVENT = JSON.stringify({
  event: "order.created",
  order: {
    id: "ORD-1042",
    amount: 4999,
    currency: "INR",
    customer: { name: "Asha Rao", email: "asha@example.com" },
  },
});

/** Single quotes inside a single-quoted shell string. */
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

function curlExample(flow: Flow): string {
  return [
    `SECRET=${shellQuote(flow.webhookSecret)}`,
    `BODY=${shellQuote(SAMPLE_EVENT)}`,
    `SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')`,
    "",
    `curl -i -X POST ${shellQuote(webhookUrl(flow.id))} \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -H "X-Flowlet-Signature: sha256=$SIG" \\`,
    `  -d "$BODY"`,
  ].join("\n");
}

export function WebhookPanel({ flow }: { flow: Flow }) {
  const [showSecret, setShowSecret] = useState(false);
  const url = webhookUrl(flow.id);
  const curl = curlExample(flow);

  return (
    <section className="card" aria-labelledby="webhook-heading">
      <h2 id="webhook-heading">Webhook</h2>
      <p className="muted small">
        Send a POST with a JSON body. Sign it with HMAC-SHA256 of the raw body using the secret, in the header{" "}
        <code>X-Flowlet-Signature: sha256=&lt;hex&gt;</code>.
      </p>

      <div className="field">
        <span className="label">URL</span>
        <div className="inline-code">
          <code>{url}</code>
          <CopyButton text={url} label="Copy URL" />
        </div>
      </div>

      <div className="field">
        <span className="label">Secret</span>
        <div className="inline-code">
          <code aria-label="Webhook secret">{showSecret ? flow.webhookSecret : "•".repeat(24)}</code>
          <button type="button" className="button button-small" onClick={() => setShowSecret(!showSecret)}>
            {showSecret ? "Hide" : "Show"}
          </button>
          <CopyButton text={flow.webhookSecret} label="Copy secret" />
        </div>
      </div>

      <div className="field">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="label">Example with curl</span>
          <CopyButton text={curl} label="Copy curl" />
        </div>
        <pre className="code" tabIndex={0} aria-label="curl example">
          {showSecret ? curl : curl.replace(flow.webhookSecret, "•".repeat(24))}
        </pre>
        <span className="hint">The copied command includes the real secret.</span>
      </div>
    </section>
  );
}
