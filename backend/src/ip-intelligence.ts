import ipaddr from "ipaddr.js";
import {
  ProviderFailure,
  type PeerVisibility,
  type ProviderId,
  type ProviderObservation,
  type RouteEvent,
  type SourceStatus,
} from "./providers.js";

const COMPLETE_CACHE_TTL_MS = 60 * 60 * 1_000;
const PARTIAL_CACHE_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_ENTRIES = 1_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface IntelligenceReport {
  readonly ip: string;
  readonly location: {
    readonly city: string | null;
    readonly region: string | null;
    readonly country: string | null;
    readonly countryCode: string | null;
    readonly latitude: number | null;
    readonly longitude: number | null;
    readonly timezone: string | null;
  };
  readonly network: {
    readonly asn: number | null;
    readonly organization: string | null;
    readonly prefix: string | null;
  };
  readonly routing: {
    readonly announced: boolean | null;
    readonly queryTime: string | null;
    readonly firstSeen: RouteEvent | null;
    readonly lastSeen: RouteEvent | null;
    readonly visibility: {
      readonly ipv4: PeerVisibility;
      readonly ipv6: PeerVisibility;
    };
  };
}

interface CachedLookup {
  readonly data: IntelligenceReport;
  readonly status: "complete" | "partial";
  readonly sources: Readonly<Record<ProviderId, SourceStatus>>;
  readonly warnings: readonly {
    readonly source: ProviderId;
    readonly code: SourceStatus;
    readonly message: string;
  }[];
  readonly lookedUpAt: string;
}

export interface LookupResponse {
  readonly data: IntelligenceReport;
  readonly meta: {
    readonly status: "complete" | "partial";
    readonly cached: boolean;
    readonly sources: {
      readonly geojs: SourceStatus;
      readonly ripestatNetwork: SourceStatus;
      readonly ripestatRouting: SourceStatus;
    };
    readonly requestId: string;
    readonly lookedUpAt: string;
  };
  readonly warnings: CachedLookup["warnings"];
}

type ProviderLookup = (ip: string) => Promise<ProviderObservation>;

export interface ProviderLookups {
  readonly geojs: ProviderLookup;
  readonly ripestatNetwork: ProviderLookup;
  readonly ripestatRouting: ProviderLookup;
}

export type LookupIp = (input: {
  readonly ip: string;
  readonly requestId: string;
}) => Promise<LookupResponse>;

interface CacheEntry {
  readonly value: CachedLookup;
  readonly expiresAt: number;
}

function parseIpAddress(value: string): string {
  const input = value.trim();
  if (
    !input ||
    input.includes("/") ||
    input.includes("%") ||
    !ipaddr.isValid(input)
  ) {
    throw new ApiError(
      400,
      "INVALID_IP",
      "Enter a valid IPv4 or IPv6 address.",
    );
  }
  const parsed = ipaddr.parse(input);
  const dottedSuffix = input.slice(input.lastIndexOf(":") + 1);
  const ipv4Text = parsed.kind() === "ipv4" ? input : dottedSuffix;
  if (
    (parsed.kind() === "ipv4" || input.includes(".")) &&
    !ipaddr.IPv4.isValidFourPartDecimal(ipv4Text)
  ) {
    throw new ApiError(
      400,
      "INVALID_IP",
      "Enter a valid IPv4 or IPv6 address.",
    );
  }
  return parsed.toString();
}

const copyEvent = (
  value: RouteEvent | null | undefined,
): RouteEvent | null =>
  value
    ? {
        prefix: value.prefix ?? null,
        origin: value.origin ?? null,
        time: value.time ?? null,
      }
    : null;

const emptyPeers = (): PeerVisibility => ({
  peersSeeing: null,
  totalPeers: null,
});

function assemble(
  ip: string,
  observations: readonly ProviderObservation[],
): IntelligenceReport {
  const geo = observations.find(({ source }) => source === "geojs");
  const network = observations.find(
    ({ source }) => source === "ripestat-network",
  );
  const routing = observations.find(
    ({ source }) => source === "ripestat-routing",
  )?.routing;
  const peerCounts = routing
    ? [
        routing.visibility.ipv4.peersSeeing,
        routing.visibility.ipv6.peersSeeing,
      ]
    : [];
  const announced = !routing
    ? null
    : routing.origins.length > 0 &&
        peerCounts.some((value) => value !== null && value > 0)
      ? true
      : routing.origins.length === 0 &&
          peerCounts.every((value) => value === 0)
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

function failureStatus(reason: unknown): Exclude<SourceStatus, "available"> {
  return reason instanceof ProviderFailure ? reason.status : "unavailable";
}

function responseFrom(
  value: CachedLookup,
  cached: boolean,
  requestId: string,
): LookupResponse {
  return {
    data: value.data,
    meta: {
      status: value.status,
      cached,
      sources: {
        geojs: value.sources.geojs,
        ripestatNetwork: value.sources["ripestat-network"],
        ripestatRouting: value.sources["ripestat-routing"],
      },
      requestId,
      lookedUpAt: value.lookedUpAt,
    },
    warnings: value.warnings,
  };
}

export function createIpLookup({
  providers,
  clock = () => new Date(),
  cacheClock = Date.now,
  maxEntries = DEFAULT_MAX_ENTRIES,
}: {
  readonly providers: ProviderLookups;
  readonly clock?: () => Date;
  readonly cacheClock?: () => number;
  readonly maxEntries?: number;
}): LookupIp {
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new Error("Cache max entries must be a positive integer.");
  }
  const cache = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<CachedLookup>>();
  const providerEntries: readonly {
    readonly id: ProviderId;
    readonly lookup: ProviderLookup;
  }[] = [
    { id: "geojs", lookup: providers.geojs },
    { id: "ripestat-network", lookup: providers.ripestatNetwork },
    { id: "ripestat-routing", lookup: providers.ripestatRouting },
  ];

  async function loadProviders(ip: string): Promise<CachedLookup> {
    const settled = await Promise.allSettled(
      providerEntries.map(({ lookup }) => lookup(ip)),
    );
    const observations: ProviderObservation[] = [];
    const sources: Record<ProviderId, SourceStatus> = {
      geojs: "unavailable",
      "ripestat-network": "unavailable",
      "ripestat-routing": "unavailable",
    };
    const warnings: Array<CachedLookup["warnings"][number]> = [];

    providerEntries.forEach(({ id }, index) => {
      const result = settled[index];
      if (result?.status === "fulfilled") {
        sources[id] = "available";
        observations.push(result.value);
        return;
      }
      const status = failureStatus(result?.reason);
      sources[id] = status;
      warnings.push({
        source: id,
        code: status,
        message: `${id} data is temporarily unavailable.`,
      });
    });

    if (observations.length === 0) {
      const rateLimited = Object.values(sources).every(
        (status) => status === "rate_limited",
      );
      throw new ApiError(
        rateLimited ? 429 : 502,
        rateLimited ? "UPSTREAM_RATE_LIMITED" : "UPSTREAM_UNAVAILABLE",
        rateLimited
          ? "External data providers are rate-limited. Try again later."
          : "External data providers are unavailable. Try again.",
      );
    }

    return {
      data: assemble(ip, observations),
      status: observations.length === providerEntries.length
        ? "complete"
        : "partial",
      sources,
      warnings,
      lookedUpAt: clock().toISOString(),
    };
  }

  function store(key: string, value: CachedLookup): void {
    const now = cacheClock();
    for (const [storedKey, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(storedKey);
    }
    cache.delete(key);
    const ttl = value.status === "complete"
      ? COMPLETE_CACHE_TTL_MS
      : PARTIAL_CACHE_TTL_MS;
    cache.set(key, { value, expiresAt: now + ttl });
    while (cache.size > maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  return async ({ ip: input, requestId }) => {
    const ip = parseIpAddress(input);
    const entry = cache.get(ip);
    if (entry) {
      if (entry.expiresAt > cacheClock()) {
        return responseFrom(entry.value, true, requestId);
      }
      cache.delete(ip);
    }

    let operation = pending.get(ip);
    if (!operation) {
      operation = loadProviders(ip)
        .then((value) => {
          store(ip, value);
          return value;
        })
        .finally(() => pending.delete(ip));
      pending.set(ip, operation);
    }
    return responseFrom(await operation, false, requestId);
  };
}
