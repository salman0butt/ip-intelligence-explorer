import type { ReactNode } from "react";
import type {
  LookupResponse,
  RouteEvent,
} from "../types/ipIntelligence";
import { ExplorerMap } from "./ExplorerMap";
import { SourceStatus } from "./SourceStatus";

function isFiniteNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function formatValue(value: string | number | null): string {
  if (
    value === null ||
    value === "" ||
    (typeof value === "number" && !Number.isFinite(value))
  ) {
    return "Unavailable";
  }
  return String(value);
}

function formatTimestamp(value: string | null): string {
  if (value === null) return "Unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAsn(value: number | null): string {
  return isFiniteNumber(value) ? "AS" + String(value) : "Unavailable";
}

function visibility(
  peersSeeing: number | null,
  totalPeers: number | null,
): string {
  if (
    !isFiniteNumber(peersSeeing) ||
    !isFiniteNumber(totalPeers) ||
    totalPeers <= 0
  ) {
    return "Unavailable";
  }
  return String(peersSeeing) + " / " + String(totalPeers) + " peers";
}

function routeEvent(event: RouteEvent | null): ReactNode {
  if (!event) return "Unavailable";
  return (
    <span className="space-y-1">
      <span className="block font-mono">
        {formatValue(event.prefix)}
      </span>
      <span className="block text-xs text-slate-400">
        {formatAsn(event.origin)}
        {" · "}
        {formatTimestamp(event.time)}
      </span>
    </span>
  );
}

function Fact({
  label,
  value,
  mono = false,
  className = "",
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly mono?: boolean;
  readonly className?: string;
}) {
  return (
    <div
      className={"rounded-xl border border-slate-700/80 bg-slate-950/45 p-4 " +
        className}
    >
      <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </dt>
      <dd className={"mt-2 text-sm text-slate-100 " + (mono ? "font-mono" : "")}>
        {value}
      </dd>
    </div>
  );
}

export function IntelligenceDashboard({
  response,
}: {
  readonly response: LookupResponse;
}) {
  const { data, meta, warnings } = response;
  const partial = meta.status === "partial";
  const locationName = [
    data.location.city,
    data.location.region,
    data.location.country,
  ].filter(Boolean).join(", ") || "Unavailable";
  const announced = data.routing.announced === null
    ? "Unavailable"
    : data.routing.announced
      ? "Announced"
      : "Not announced";
  const coordinates = isFiniteNumber(data.location.latitude) &&
      isFiniteNumber(data.location.longitude)
    ? String(data.location.latitude) + ", " + String(data.location.longitude)
    : "Unavailable";

  return (
    <section aria-labelledby="result-title" className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-sm text-teal-200">{data.ip}</p>
          <h2 id="result-title" className="mt-1 text-2xl font-semibold text-white">
            {partial ? "Partial intelligence" : "Complete intelligence"}
          </h2>
        </div>
        <div className="text-left text-xs text-slate-400 sm:text-right">
          <p>{meta.cached ? "Cached result" : "Fresh result"}</p>
          <p className="mt-1 font-mono">{formatTimestamp(meta.lookedUpAt)}</p>
        </div>
      </div>

      {partial ? (
        <div
          role="status"
          className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-4 text-amber-100"
        >
          <p className="font-semibold">Some sources were unavailable.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {warnings.map((warning) => (
              <li key={warning.source}>{warning.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <ExplorerMap report={data} />
        <div className="grid gap-4">
          <section className="surface rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-white">Location</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Fact label="Reported location" value={locationName} />
              <Fact
                label="Country code"
                value={formatValue(data.location.countryCode)}
                mono
              />
              <Fact
                label="Timezone"
                value={formatValue(data.location.timezone)}
              />
              <Fact label="Coordinates" value={coordinates} mono />
            </dl>
          </section>

          <section className="surface rounded-2xl p-5">
            <h3 className="text-lg font-semibold text-white">Network</h3>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <Fact label="ASN" value={formatAsn(data.network.asn)} mono />
              <Fact
                label="Prefix"
                value={formatValue(data.network.prefix)}
                mono
              />
              <Fact
                label="Organization"
                value={formatValue(data.network.organization)}
                className="sm:col-span-2"
              />
            </dl>
          </section>
        </div>
      </div>

      <section className="surface rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Routing</h3>
          <span className="rounded-full border border-slate-600 px-3 py-1 text-xs text-slate-300">
            {announced}
          </span>
        </div>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Fact
            label="Query time"
            value={formatTimestamp(data.routing.queryTime)}
            mono
          />
          <Fact label="First seen" value={routeEvent(data.routing.firstSeen)} />
          <Fact label="Last seen" value={routeEvent(data.routing.lastSeen)} />
          <Fact
            label="IPv4 visibility"
            value={visibility(
              data.routing.visibility.ipv4.peersSeeing,
              data.routing.visibility.ipv4.totalPeers,
            )}
            mono
          />
          <Fact
            label="IPv6 visibility"
            value={visibility(
              data.routing.visibility.ipv6.peersSeeing,
              data.routing.visibility.ipv6.totalPeers,
            )}
            mono
          />
          <Fact
            label="Request reference"
            value={formatValue(meta.requestId)}
            mono
          />
        </dl>
      </section>

      <section aria-labelledby="sources-title" className="surface rounded-2xl p-5">
        <h3 id="sources-title" className="text-lg font-semibold text-white">
          Data sources
        </h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SourceStatus label="GeoJS" status={meta.sources.geojs} />
          <SourceStatus
            label="RIPEstat Network"
            status={meta.sources.ripestatNetwork}
          />
          <SourceStatus
            label="RIPEstat Routing"
            status={meta.sources.ripestatRouting}
          />
        </div>
      </section>
    </section>
  );
}
