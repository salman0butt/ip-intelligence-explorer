import type { MemoryCache } from "../../shared/cache/memory-cache.js";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { ProviderError } from "../../shared/errors/provider-error.js";
import type {
  CachedLookup,
  IntelligenceProvider,
  IntelligenceReport,
  IpAddress,
  LookupResponse,
  PeerVisibility,
  ProviderId,
  ProviderObservation,
  RouteEvent,
  SourceStatus,
} from "./ip-intelligence.types.js";

export const COMPLETE_CACHE_TTL_MS = 60 * 60 * 1_000;
export const PARTIAL_CACHE_TTL_MS = 5 * 60 * 1_000;

function statusOf(result: PromiseSettledResult<ProviderObservation>): SourceStatus {
  if (result.status === "fulfilled") return "available";
  if (result.reason instanceof ProviderError && result.reason.kind === "rate_limited") return "rate_limited";
  if (result.reason instanceof ProviderError && result.reason.kind === "timeout") return "timeout";
  return "unavailable";
}

const copyEvent = (value: RouteEvent | null | undefined): RouteEvent | null =>
  value ? { prefix: value.prefix ?? null, origin: value.origin ?? null, time: value.time ?? null } : null;

const emptyPeers = (): PeerVisibility => ({ peersSeeing: null, totalPeers: null });

function assemble(ip: IpAddress, observations: readonly ProviderObservation[]): IntelligenceReport {
  const geo = observations.find(({ source }) => source === "geojs");
  const network = observations.find(({ source }) => source === "ripestat-network");
  const routing = observations.find(({ source }) => source === "ripestat-routing")?.routing;
  const peers = routing ? [routing.visibility.ipv4.peersSeeing, routing.visibility.ipv6.peersSeeing] : [];
  const announced = !routing
    ? null
    : routing.origins.length > 0 && peers.some((value) => value !== null && value > 0)
      ? true
      : routing.origins.length === 0 && peers.every((value) => value === 0)
        ? false
        : null;
  return {
    ip,
    location: {
      city: geo?.location?.city ?? null,
      region: geo?.location?.region ?? null,
      country: geo?.location?.country ?? null,
      countryCode: geo?.location?.countryCode ?? null,
      latitude: geo?.location?.latitude ?? null,
      longitude: geo?.location?.longitude ?? null,
      timezone: geo?.location?.timezone ?? null,
    },
    network: {
      asn: network?.network?.asn ?? geo?.network?.asn ?? null,
      organization: geo?.network?.organization ?? null,
      prefix: network?.network?.prefix ?? routing?.resource ?? null,
    },
    routing: {
      announced,
      queryTime: routing?.queryTime ?? null,
      firstSeen: copyEvent(routing?.firstSeen),
      lastSeen: copyEvent(routing?.lastSeen),
      visibility: {
        ipv4: routing ? { ...routing.visibility.ipv4 } : emptyPeers(),
        ipv6: routing ? { ...routing.visibility.ipv6 } : emptyPeers(),
      },
    },
  };
}

export class IpIntelligenceService {
  constructor(
    private readonly dependencies: {
      readonly providers: readonly IntelligenceProvider[];
      readonly cache: MemoryCache<CachedLookup>;
      readonly clock?: () => Date;
    },
  ) {
    const ids = new Set(dependencies.providers.map(({ id }) => id));
    if (
      dependencies.providers.length !== 3 ||
      ["geojs", "ripestat-network", "ripestat-routing"].some((id) => !ids.has(id as ProviderId))
    ) {
      throw new Error("Exactly one provider for each intelligence source is required.");
    }
  }

  async lookup({ ip, requestId }: { ip: IpAddress; requestId: string }): Promise<LookupResponse> {
    const loaded = await this.dependencies.cache.load({
      key: `ip:${ip}`,
      loader: () => this.loadProviders(ip),
      ttlFor: ({ status }) => (status === "complete" ? COMPLETE_CACHE_TTL_MS : PARTIAL_CACHE_TTL_MS),
    });
    const sources = loaded.value.sources;
    return {
      data: loaded.value.data,
      meta: {
        status: loaded.value.status,
        cached: loaded.cached,
        sources: {
          geojs: sources.geojs,
          ripestatNetwork: sources["ripestat-network"],
          ripestatRouting: sources["ripestat-routing"],
        },
        requestId,
        lookedUpAt: loaded.value.lookedUpAt,
      },
      warnings: loaded.value.warnings,
    };
  }

  private async loadProviders(ip: IpAddress): Promise<CachedLookup> {
    const settled = await Promise.allSettled(this.dependencies.providers.map((provider) => provider.lookup(ip)));
    const pairs = this.dependencies.providers.map((provider, index) => ({ provider, result: settled[index] }));
    const successes = pairs.filter(
      (pair): pair is { provider: IntelligenceProvider; result: PromiseFulfilledResult<ProviderObservation> } =>
        pair.result?.status === "fulfilled",
    );
    if (successes.length === 0) {
      const limited = pairs.every(
        ({ result }) =>
          result?.status === "rejected" &&
          result.reason instanceof ProviderError &&
          result.reason.kind === "rate_limited",
      );
      throw new ApplicationError(
        limited ? 429 : 502,
        limited ? "UPSTREAM_RATE_LIMITED" : "UPSTREAM_UNAVAILABLE",
        limited
          ? "External data providers are rate-limited. Try again later."
          : "External data providers are unavailable. Try again.",
      );
    }
    const sources = Object.fromEntries(
      pairs.map(({ provider, result }) => [provider.id, result ? statusOf(result) : "unavailable"]),
    ) as Record<ProviderId, SourceStatus>;
    const warnings = pairs.flatMap(({ provider, result }) =>
      !result || result.status === "fulfilled"
        ? []
        : [
            {
              source: provider.id,
              code: statusOf(result),
              message: `${provider.id} data is temporarily unavailable.`,
            },
          ],
    );
    return {
      data: assemble(
        ip,
        successes.map(({ result }) => result.value),
      ),
      status: successes.length === 3 ? "complete" : "partial",
      sources,
      warnings,
      lookedUpAt: (this.dependencies.clock ?? (() => new Date()))().toISOString(),
    };
  }
}
