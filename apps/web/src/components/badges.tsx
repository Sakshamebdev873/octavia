import type { RunStatus, StepStatus } from "@flowlet/shared";
import { STATUS_LABELS } from "@/lib/format";

/** Status as text plus colour, never colour alone. */
export function StatusBadge({ status }: { status: RunStatus | StepStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status]}</span>;
}

export function EnabledBadge({ enabled }: { enabled: boolean }) {
  return <span className={`badge ${enabled ? "badge-enabled" : "badge-disabled"}`}>{enabled ? "Enabled" : "Disabled"}</span>;
}
