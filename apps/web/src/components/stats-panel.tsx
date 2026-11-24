import type { FlowStats } from "@flowlet/shared";
import { formatDateTime, formatDuration, formatRelative } from "@/lib/format";

export function StatsPanel({ stats }: { stats: FlowStats }) {
  const items: { label: string; value: string; title?: string }[] = [
    { label: "Total runs", value: String(stats.total) },
    { label: "Success", value: String(stats.success) },
    { label: "Filtered", value: String(stats.filtered) },
    { label: "Failed", value: String(stats.failed) },
    { label: "Average duration", value: formatDuration(stats.avgDurationMs) },
    stats.lastRunAt
      ? { label: "Last run", value: formatRelative(stats.lastRunAt), title: formatDateTime(stats.lastRunAt) }
      : { label: "Last run", value: "never" },
  ];

  return (
    <dl className="stats">
      {items.map((item) => (
        <div key={item.label} className="stat">
          <dt>{item.label}</dt>
          <dd title={item.title}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
