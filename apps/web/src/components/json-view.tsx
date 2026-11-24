import type { JsonValue } from "@flowlet/shared";

export function JsonView({ value, label }: { value: JsonValue; label?: string }) {
  return (
    <pre className="json" aria-label={label} tabIndex={0}>
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
