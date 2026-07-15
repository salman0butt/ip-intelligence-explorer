import type { SourceStatus as Status } from "../types/ipIntelligence";

const labels: Record<Status, string> = {
  available: "Available",
  rate_limited: "Rate limited",
  timeout: "Timed out",
  unavailable: "Unavailable",
};

const tones: Record<Status, string> = {
  available: "border-teal-400/30 bg-teal-400/10 text-teal-200",
  rate_limited: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  timeout: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  unavailable: "border-slate-600 bg-slate-800 text-slate-300",
};

export function SourceStatus({
  label,
  status,
}: {
  readonly label: string;
  readonly status: Status;
}) {
  return (
    <div className={"rounded-xl border px-4 py-3 " + tones[status]}>
      <span className="block text-xs font-semibold uppercase tracking-wider">
        {label}
      </span>
      <span className="mt-1 block text-sm">{labels[status]}</span>
    </div>
  );
}
