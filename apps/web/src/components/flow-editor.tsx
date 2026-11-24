"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlowForm } from "@/components/flow-form";
import { ErrorState, Loading } from "@/components/states";
import { api } from "@/lib/api";
import { emptyDraft, flowToDraft } from "@/lib/flow-draft";
import { useApi } from "@/lib/use-api";

export function NewFlow() {
  const router = useRouter();
  const [initial] = useState(emptyDraft);

  return (
    <>
      <div className="page-header">
        <h1>New flow</h1>
      </div>
      <FlowForm
        initial={initial}
        submitLabel="Create flow"
        cancelHref="/flows"
        onSubmit={async (request) => {
          const flow = await api.flows.create(request);
          router.push(`/flows/${flow.id}`);
        }}
      />
    </>
  );
}

export function EditFlow({ id }: { id: string }) {
  const router = useRouter();
  const { data: flow, error, reload } = useApi((signal) => api.flows.get(id, signal), [id]);

  if (error && !flow) return <ErrorState error={error} onRetry={reload} title="Could not load the flow" />;
  if (!flow) return <Loading label="Loading flow…" />;

  return (
    <>
      <p className="breadcrumb">
        <Link href={`/flows/${id}`}>← {flow.name}</Link>
      </p>
      <div className="page-header">
        <h1>Edit flow</h1>
      </div>
      <FlowForm
        initial={flowToDraft(flow)}
        submitLabel="Save changes"
        cancelHref={`/flows/${id}`}
        onSubmit={async (request) => {
          await api.flows.update(id, request);
          router.push(`/flows/${id}`);
        }}
      />
    </>
  );
}
