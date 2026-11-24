import type { RunStatus, Step, StepStatus } from "@flowlet/shared";
import { ApiClientError } from "./api";

export function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError || error instanceof Error) return error.message;
  return "Something went wrong";
}

export const STATUS_LABELS: Record<RunStatus | StepStatus, string> = {
  running: "Running",
  success: "Success",
  filtered: "Filtered",
  failed: "Failed",
  skipped: "Skipped",
};

export const STEP_TYPE_LABELS: Record<Step["type"], string> = {
  filter: "Filter",
  transform: "Transform",
  http_request: "HTTP request",
};

const OPERATOR_LABELS = { eq: "equals", neq: "does not equal", gt: "is greater than", lt: "is less than", contains: "contains" };

/** One line that says what a step does, for the flow page. */
export function describeStep(step: Step): string {
  switch (step.type) {
    case "filter":
      return `Continue only if ${step.field} ${OPERATOR_LABELS[step.operator]} ${JSON.stringify(step.value)}`;
    case "transform":
      return `Reshape into { ${Object.entries(step.mapping)
        .map(([key, path]) => `${key} ← ${path}`)
        .join(", ")} }`;
    case "http_request":
      return `${step.method} the data to ${step.url}`;
  }
}
