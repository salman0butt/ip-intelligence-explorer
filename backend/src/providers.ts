import { z } from "zod";

export type ProviderId =
  | "geojs"
  | "ripestat-network"
  | "ripestat-routing";
export type SourceStatus =
  | "available"
  | "rate_limited"
  | "timeout"
  | "unavailable";

export interface RouteEvent {
  readonly prefix: string | null;
  readonly origin: number | null;
  readonly time: string | null;
}

export interface PeerVisibility {
  readonly peersSeeing: number | null;
  readonly totalPeers: number | null;
}

export interface ProviderObservation {
  readonly source: ProviderId;
  readonly location?: Partial<{
    city: string | null;
    region: string | null;
    country: string | null;
    countryCode: string | null;
    latitude: number | null;
    longitude: number | null;
    timezone: string | null;
  }>;
  readonly network?: {
    readonly asn?: number | null;
    readonly organization?: string | null;
    readonly prefix?: string | null;
  };
  readonly routing?: {
    readonly resource: string;
    readonly queryTime: string;
    readonly firstSeen: RouteEvent | null;
    readonly lastSeen: RouteEvent | null;
    readonly origins: readonly number[];
    readonly visibility: {
      readonly ipv4: PeerVisibility;
      readonly ipv6: PeerVisibility;
    };
  };
}

type FailureStatus = Exclude<SourceStatus, "available">;

export class ProviderFailure extends Error {
  constructor(
    readonly source: ProviderId,
    readonly status: FailureStatus,
  ) {
    super(`${source} is ${status}.`);
    this.name = "ProviderFailure";
  }
}

interface ProviderOptions {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

async function fetchProviderJson(
  url: string,
  source: ProviderId,
  { fetchImpl = fetch, timeoutMs = 5_000 }: ProviderOptions,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (response.status === 429) {
      throw new ProviderFailure(source, "rate_limited");
    }
    if (!response.ok) {
      throw new ProviderFailure(source, "unavailable");
    }
    return await response.json();
  } catch (error: unknown) {
    if (error instanceof ProviderFailure) throw error;
    if (
      controller.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw new ProviderFailure(source, "timeout");
    }
    throw new ProviderFailure(source, "unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

const coordinate = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value ?? null;
    const trimmed = value.trim();
    return trimmed ? Number(trimmed) : null;
  },
  z.number().nullable(),
);

const geoSchema = z
  .object({
    ip: z.string(),
    city: z.string().nullish(),
    region: z.string().nullish(),
    country: z.string().nullish(),
    country_code: z.string().nullish(),
    latitude: coordinate,
    longitude: coordinate,
    timezone: z.string().nullish(),
    asn: z.number().int().positive().max(4_294_967_295).nullish(),
    organization_name: z.string().nullish(),
    organization: z.string().nullish(),
  })
  .loose();

export async function lookupGeoJs(
  ip: string,
  options: ProviderOptions = {},
): Promise<ProviderObservation> {
  const source = "geojs";
  const parsed = geoSchema.safeParse(
    await fetchProviderJson(
      `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`,
      source,
      options,
    ),
  );
  if (!parsed.success) throw new ProviderFailure(source, "unavailable");
  const value = parsed.data;
  const organization =
    value.organization_name ??
    value.organization?.replace(/^AS\d+\s+/, "") ??
    null;
  return {
    source,
    location: {
      city: value.city ?? null,
      region: value.region ?? null,
      country: value.country ?? null,
      countryCode: value.country_code ?? null,
      latitude: value.latitude,
      longitude: value.longitude,
      timezone: value.timezone ?? null,
    },
    network: {
      asn: value.asn === 64_512 ? null : (value.asn ?? null),
      organization: organization === "Unknown" ? null : organization,
    },
  };
}

const asnSchema = z
  .union([z.string().regex(/^\d+$/), z.number()])
  .transform(Number)
  .pipe(z.number().int().nonnegative().max(4_294_967_295));

function ripeStatUrl(
  endpoint: "network-info" | "routing-status",
  ip: string,
): string {
  const url = new URL(`https://stat.ripe.net/data/${endpoint}/data.json`);
  url.searchParams.set("resource", ip);
  url.searchParams.set("sourceapp", "ip-intelligence-explorer");
  return url.toString();
}

const networkSchema = z
  .object({
    status: z.literal("ok"),
    data: z
      .object({
        prefix: z.string().nullish(),
        asns: z.array(asnSchema),
      })
      .loose(),
  })
  .loose();

export async function lookupRipeNetwork(
  ip: string,
  options: ProviderOptions = {},
): Promise<ProviderObservation> {
  const source = "ripestat-network";
  const parsed = networkSchema.safeParse(
    await fetchProviderJson(ripeStatUrl("network-info", ip), source, options),
  );
  if (!parsed.success) throw new ProviderFailure(source, "unavailable");
  return {
    source,
    network: {
      asn: parsed.data.data.asns[0] ?? null,
      prefix: parsed.data.data.prefix ?? null,
    },
  };
}

const eventSchema = z
  .object({
    prefix: z.string(),
    origin: asnSchema,
    time: z.string(),
  })
  .nullish();

const peersSchema = z.object({
  ris_peers_seeing: z.number().int().nonnegative(),
  total_ris_peers: z.number().int().nonnegative(),
});

const routingSchema = z
  .object({
    status: z.literal("ok"),
    data: z
      .object({
        resource: z.string(),
        query_time: z.string(),
        first_seen: eventSchema,
        last_seen: eventSchema,
        origins: z
          .array(z.object({ origin: asnSchema }).loose())
          .default([]),
        visibility: z.object({ v4: peersSchema, v6: peersSchema }),
      })
      .loose(),
  })
  .loose();

export async function lookupRipeRouting(
  ip: string,
  options: ProviderOptions = {},
): Promise<ProviderObservation> {
  const source = "ripestat-routing";
  const parsed = routingSchema.safeParse(
    await fetchProviderJson(ripeStatUrl("routing-status", ip), source, options),
  );
  if (!parsed.success) throw new ProviderFailure(source, "unavailable");
  const value = parsed.data.data;
  return {
    source,
    routing: {
      resource: value.resource,
      queryTime: value.query_time,
      firstSeen: value.first_seen ?? null,
      lastSeen: value.last_seen ?? null,
      origins: value.origins.map(({ origin }) => origin),
      visibility: {
        ipv4: {
          peersSeeing: value.visibility.v4.ris_peers_seeing,
          totalPeers: value.visibility.v4.total_ris_peers,
        },
        ipv6: {
          peersSeeing: value.visibility.v6.ris_peers_seeing,
          totalPeers: value.visibility.v6.total_ris_peers,
        },
      },
    },
  };
}
