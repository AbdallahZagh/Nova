"use client";

export function formatAdminDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatBytes(bytes?: number | null) {
  const value = Number(bytes ?? 0);
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-glass-card bg-glass-card p-4">
      <p className="text-[11px] font-medium uppercase tracking-wider text-primary/45">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-primary">{value}</p>
      {hint ? <p className="mt-1 text-xs text-primary/50">{hint}</p> : null}
    </div>
  );
}
