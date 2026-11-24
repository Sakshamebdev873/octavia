import Link from "next/link";
import type { ReactNode } from "react";
import { ApiClientError } from "@/lib/api";
import { errorMessage } from "@/lib/format";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="state state-empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, title }: { error: unknown; onRetry?: () => void; title?: string }) {
  const notFound = error instanceof ApiClientError && error.status === 404;
  return (
    <div className="state state-error" role="alert">
      <h2>{notFound ? "Not found" : (title ?? "Something went wrong")}</h2>
      <p>{errorMessage(error)}</p>
      {notFound ? (
        <Link className="button" href="/flows">
          Back to flows
        </Link>
      ) : (
        onRetry && (
          <button type="button" className="button" onClick={onRetry}>
            Try again
          </button>
        )
      )}
    </div>
  );
}

/** An inline message for a failed action (save, delete, toggle). */
export function Alert({ children, tone = "error" }: { children: ReactNode; tone?: "error" | "info" }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
