import { IntelligenceDashboard } from "./features/ip-intelligence/components/IntelligenceDashboard";
import { LookupForm } from "./features/ip-intelligence/components/LookupForm";
import { useApiHealth } from "./features/ip-intelligence/hooks/useApiHealth";
import { useIpLookup } from "./features/ip-intelligence/hooks/useIpLookup";
import type { ApiError } from "./shared/api/apiClient";

function errorCopy(error: ApiError): string {
  if (error.code === "UPSTREAM_RATE_LIMITED") {
    return "The intelligence providers are rate-limited. Please try again later.";
  }
  if (error.code === "UPSTREAM_UNAVAILABLE") {
    return "The intelligence providers are temporarily unavailable.";
  }
  if (error.code === "NETWORK_ERROR") {
    return "The API could not be reached. Check the frontend API configuration.";
  }
  if (error.code === "ORIGIN_NOT_ALLOWED") {
    return "This frontend origin is not allowed by the API configuration.";
  }
  return "The lookup could not be completed.";
}

function EmptyWorkspace() {
  return (
    <section className="surface rounded-2xl p-6 sm:p-8">
      <div className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
          Ready to explore
        </p>
        <h2 className="mt-3 text-2xl font-semibold text-white">
          One lookup, three perspectives
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Search a public IP to combine GeoJS location data with RIPEstat
          network ownership and routing visibility.
        </p>
      </div>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {([
          ["Location", "City, country, coordinates, and timezone"],
          ["Network", "ASN, organization, and announced prefix"],
          ["Routing", "Visibility plus first and last observations"],
        ] as const).map(([title, copy]) => (
          <div
            key={title}
            className="rounded-xl border border-slate-700 bg-slate-950/40 p-4"
          >
            <h3 className="font-semibold text-slate-100">{title}</h3>
            <p className="mt-2 text-sm text-slate-400">{copy}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const health = useApiHealth();
  const lookup = useIpLookup();
  const healthLabel = health.isPending
    ? "Checking API"
    : health.isSuccess
      ? "API online"
      : "API unavailable";
  const healthTone = health.isSuccess
    ? "border-teal-400/30 bg-teal-400/10 text-teal-200"
    : health.isPending
      ? "border-slate-600 bg-slate-800 text-slate-300"
      : "border-red-400/30 bg-red-400/10 text-red-200";
  const formError = lookup.error?.status === 400 ? lookup.error : null;
  const panelError = lookup.error?.status === 400 ? null : lookup.error;

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <header className="mx-auto flex max-w-[1180px] items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 place-items-center rounded-xl border border-teal-300/30 bg-teal-300/10 text-teal-200"
          >
            ◉
          </span>
          <p className="font-semibold text-white">IP Intelligence Explorer</p>
        </div>
        <div
          role="status"
          className={"rounded-full border px-3 py-1.5 text-xs font-semibold " +
            healthTone}
        >
          {healthLabel}
        </div>
      </header>

      <main className="mx-auto mt-10 max-w-[1180px] space-y-8">
        <section className="surface overflow-hidden rounded-3xl p-6 sm:p-10">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-300">
              Open-source IP intelligence
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Explore any public IP
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
              Combine GeoJS geolocation with RIPEstat network and routing
              data in one resilient, normalized report.
            </p>
          </div>
          <div className="mt-8">
            <LookupForm
              onSubmit={lookup.lookup}
              isPending={lookup.isPending}
              serverError={formError}
              onInputChange={lookup.reset}
            />
          </div>
          <div className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
            {([
              ["IPv4 + IPv6", "Strict backend validation"],
              ["3 open sources", "GeoJS and RIPEstat"],
              ["Partial resilient", "Useful data during outages"],
            ] as const).map(([title, copy]) => (
              <div
                key={title}
                className="rounded-xl border border-slate-700/70 bg-slate-950/35 px-4 py-3"
              >
                <p className="font-semibold text-slate-100">{title}</p>
                <p className="mt-1 text-xs text-slate-400">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <div aria-live="polite" aria-busy={lookup.isPending}>
          {lookup.isPending ? (
            <section className="surface grid min-h-64 place-items-center rounded-2xl p-8 text-center">
              <div>
                <div
                  aria-hidden="true"
                  className="mx-auto size-10 animate-pulse rounded-full border-4 border-teal-300/25 border-t-teal-300"
                />
                <p className="mt-4 font-semibold text-white">
                  Analyzing IP intelligence…
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Location, network, and routing sources are running concurrently.
                </p>
              </div>
            </section>
          ) : lookup.data ? (
            <IntelligenceDashboard response={lookup.data} />
          ) : panelError ? (
            <section
              role="alert"
              className="rounded-2xl border border-red-400/30 bg-red-400/10 p-6 text-red-100"
            >
              <h2 className="text-lg font-semibold">Lookup unavailable</h2>
              <p className="mt-2 text-sm">{errorCopy(panelError)}</p>
              {panelError.requestId ? (
                <p className="mt-3 font-mono text-xs text-red-200/80">
                  {"Reference: " + panelError.requestId}
                </p>
              ) : null}
            </section>
          ) : (
            <EmptyWorkspace />
          )}
        </div>
      </main>

      <footer className="mx-auto mt-10 flex max-w-[1180px] flex-wrap justify-between gap-3 border-t border-slate-800 py-6 text-xs text-slate-400">
        <span>GeoJS + RIPEstat open data</span>
        <span>No account or API key required</span>
      </footer>
    </div>
  );
}
