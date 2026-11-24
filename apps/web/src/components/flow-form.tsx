"use client";

import { DESCRIPTION_MAX, MAX_STEPS, NAME_MAX, type CreateFlowRequest } from "@flowlet/shared";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { describedBy, Field } from "@/components/field";
import { StepEditor } from "@/components/step-editor";
import { Alert } from "@/components/states";
import { ApiClientError } from "@/lib/api";
import { issuesToErrors, newStep, validateDraft, type FieldErrors, type FlowDraft, type StepDraft } from "@/lib/flow-draft";
import { errorMessage } from "@/lib/format";

interface FlowFormProps {
  initial: FlowDraft;
  submitLabel: string;
  cancelHref: string;
  onSubmit: (request: CreateFlowRequest) => Promise<void>;
}

export function FlowForm({ initial, submitLabel, cancelHref, onSubmit }: FlowFormProps) {
  const [draft, setDraft] = useState<FlowDraft>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const setSteps = (steps: StepDraft[]) => setDraft((d) => ({ ...d, steps }));

  function moveStep(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= draft.steps.length) return;
    const steps = [...draft.steps];
    const [moved] = steps.splice(index, 1);
    if (moved) steps.splice(target, 0, moved);
    setSteps(steps);
    setErrors({}); // paths like steps.1.value no longer point at the same step
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const { request, errors: found } = validateDraft(draft);
    setErrors(found);
    if (!request) {
      setFormError("Please fix the highlighted fields.");
      return;
    }

    setSaving(true);
    try {
      await onSubmit(request);
    } catch (error) {
      if (error instanceof ApiClientError && error.issues.length > 0) {
        setErrors(issuesToErrors(error.issues, draft));
        setFormError("The server rejected some fields. Please fix them.");
      } else {
        setFormError(errorMessage(error));
      }
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="stack">
      {formError && <Alert>{formError}</Alert>}

      <section className="card">
        <Field id="flow-name" label="Name" error={errors.name} hint={`3 to ${NAME_MAX} characters`}>
          <input
            type="text"
            {...describedBy("flow-name", errors.name)}
            value={draft.name}
            maxLength={NAME_MAX + 20}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </Field>
        <Field id="flow-description" label="Description (optional)" error={errors.description}>
          <textarea
            {...describedBy("flow-description", errors.description)}
            value={draft.description}
            rows={2}
            style={{ minHeight: "4rem", fontFamily: "inherit", fontSize: "1rem" }}
            maxLength={DESCRIPTION_MAX + 20}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </Field>
        <label className="checkbox" htmlFor="flow-enabled">
          <input
            id="flow-enabled"
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
          />
          Enabled (accepts webhook events)
        </label>
      </section>

      <section aria-labelledby="steps-heading">
        <div className="page-header">
          <h2 id="steps-heading">
            Steps ({draft.steps.length} of {MAX_STEPS})
          </h2>
          <button
            type="button"
            className="button"
            disabled={draft.steps.length >= MAX_STEPS}
            onClick={() => setSteps([...draft.steps, newStep("filter")])}
          >
            + Add step
          </button>
        </div>
        {errors.steps && <Alert>{errors.steps}</Alert>}
        <ol className="card-list">
          {draft.steps.map((step, index) => (
            <StepEditor
              key={step.key}
              step={step}
              index={index}
              count={draft.steps.length}
              errors={errors}
              onChange={(next) => setSteps(draft.steps.map((s) => (s.key === step.key ? next : s)))}
              onMove={(direction) => moveStep(index, direction)}
              onRemove={() => {
                setSteps(draft.steps.filter((s) => s.key !== step.key));
                setErrors({});
              }}
            />
          ))}
        </ol>
      </section>

      <div className="actions">
        <button type="submit" className="button button-primary" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        <Link href={cancelHref} className="button">
          Cancel
        </Link>
      </div>
    </form>
  );
}
