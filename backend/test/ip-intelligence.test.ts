import { describe, expect, it, vi } from "vitest";
import {
  createIpLookup,
  type ProviderLookups,
} from "../src/ip-intelligence.js";
import {
  ProviderFailure,
  type ProviderObservation,
} from "../src/providers.js";

const fixedDate = new Date("2026-07-16T12:00:00.000Z");

const geoObservation: ProviderObservation = {
  source: "geojs",
  location: {
    city: "Mountain View",
    country: "United States",
    latitude: 37.386,
    longitude: -122.0838,
  },
  network: { organization: "Google LLC" },
};

const networkObservation: ProviderObservation = {
  source: "ripestat-network",
  network: { asn: 15_169, prefix: "8.8.8.0/24" },
};

const routingObservation: ProviderObservation = {
  source: "ripestat-routing",
  routing: {
    resource: "8.8.8.0/24",
    queryTime: fixedDate.toISOString(),
    firstSeen: null,
    lastSeen: null,
    origins: [15_169],
    visibility: {
      ipv4: { peersSeeing: 100, totalPeers: 100 },
      ipv6: { peersSeeing: 0, totalPeers: 100 },
    },
  },
};

function completeProviders(
  overrides: Partial<ProviderLookups> = {},
): ProviderLookups {
  return {
    geojs: vi.fn(async () => geoObservation),
    ripestatNetwork: vi.fn(async () => networkObservation),
    ripestatRouting: vi.fn(async () => routingObservation),
    ...overrides,
  };
}

describe("IP intelligence lookup", () => {
  it("normalizes an IP and merges all provider observations", async () => {
    const lookup = createIpLookup({
      providers: completeProviders(),
      clock: () => fixedDate,
    });

    const response = await lookup({ ip: " 8.8.8.8 ", requestId: "req-1" });

    expect(response).toMatchObject({
      data: {
        ip: "8.8.8.8",
        location: {
          city: "Mountain View",
          country: "United States",
          latitude: 37.386,
          longitude: -122.0838,
        },
        network: {
          asn: 15_169,
          organization: "Google LLC",
          prefix: "8.8.8.0/24",
        },
        routing: { announced: true },
      },
      meta: {
        status: "complete",
        cached: false,
        requestId: "req-1",
        lookedUpAt: fixedDate.toISOString(),
        sources: {
          geojs: "available",
          ripestatNetwork: "available",
          ripestatRouting: "available",
        },
      },
      warnings: [],
    });
  });

  it("rejects CIDR input before calling providers", async () => {
    const providers = completeProviders();
    const lookup = createIpLookup({ providers });

    await expect(
      lookup({ ip: "8.8.8.0/24", requestId: "req-2" }),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_IP" });
    expect(providers.geojs).not.toHaveBeenCalled();
  });

  it("returns a partial report with source warnings", async () => {
    const lookup = createIpLookup({
      providers: completeProviders({
        ripestatNetwork: vi.fn(async () => {
          throw new ProviderFailure("ripestat-network", "timeout");
        }),
      }),
      clock: () => fixedDate,
    });

    const response = await lookup({ ip: "8.8.8.8", requestId: "req-3" });

    expect(response.meta.status).toBe("partial");
    expect(response.meta.sources.ripestatNetwork).toBe("timeout");
    expect(response.data.network.asn).toBeNull();
    expect(response.warnings).toEqual([
      {
        source: "ripestat-network",
        code: "timeout",
        message: "ripestat-network data is temporarily unavailable.",
      },
    ]);
  });

  it("returns 429 when every provider is rate limited", async () => {
    const rateLimited = async (): Promise<never> => {
      throw new ProviderFailure("geojs", "rate_limited");
    };
    const lookup = createIpLookup({
      providers: {
        geojs: rateLimited,
        ripestatNetwork: async () => {
          throw new ProviderFailure("ripestat-network", "rate_limited");
        },
        ripestatRouting: async () => {
          throw new ProviderFailure("ripestat-routing", "rate_limited");
        },
      },
    });

    await expect(
      lookup({ ip: "8.8.8.8", requestId: "req-4" }),
    ).rejects.toMatchObject({ status: 429, code: "UPSTREAM_RATE_LIMITED" });
  });

  it("returns 502 when every provider fails for mixed reasons", async () => {
    const lookup = createIpLookup({
      providers: {
        geojs: async () => {
          throw new ProviderFailure("geojs", "unavailable");
        },
        ripestatNetwork: async () => {
          throw new ProviderFailure("ripestat-network", "rate_limited");
        },
        ripestatRouting: async () => {
          throw new ProviderFailure("ripestat-routing", "timeout");
        },
      },
    });

    await expect(
      lookup({ ip: "8.8.8.8", requestId: "req-5" }),
    ).rejects.toMatchObject({ status: 502, code: "UPSTREAM_UNAVAILABLE" });
  });
});

describe("lookup cache", () => {
  it("caches complete reports for 60 minutes", async () => {
    let now = 0;
    const providers = completeProviders();
    const lookup = createIpLookup({
      providers,
      clock: () => fixedDate,
      cacheClock: () => now,
    });

    const first = await lookup({ ip: "8.8.8.8", requestId: "first" });
    const second = await lookup({ ip: "8.8.8.8", requestId: "second" });
    now = 60 * 60 * 1_000;
    const expired = await lookup({ ip: "8.8.8.8", requestId: "third" });

    expect(first.meta.cached).toBe(false);
    expect(second.meta.cached).toBe(true);
    expect(second.meta.requestId).toBe("second");
    expect(expired.meta.cached).toBe(false);
    expect(providers.geojs).toHaveBeenCalledTimes(2);
  });

  it("caches partial reports for five minutes", async () => {
    let now = 0;
    const providers = completeProviders({
      ripestatNetwork: vi.fn(async () => {
        throw new ProviderFailure("ripestat-network", "unavailable");
      }),
    });
    const lookup = createIpLookup({
      providers,
      cacheClock: () => now,
    });

    await lookup({ ip: "8.8.8.8", requestId: "first" });
    const cached = await lookup({ ip: "8.8.8.8", requestId: "second" });
    now = 5 * 60 * 1_000;
    const expired = await lookup({ ip: "8.8.8.8", requestId: "third" });

    expect(cached.meta.cached).toBe(true);
    expect(expired.meta.cached).toBe(false);
    expect(providers.geojs).toHaveBeenCalledTimes(2);
  });

  it("evicts the oldest entry when the cache is full", async () => {
    const providers = completeProviders();
    const lookup = createIpLookup({ providers, maxEntries: 1 });

    await lookup({ ip: "8.8.8.8", requestId: "one" });
    await lookup({ ip: "1.1.1.1", requestId: "two" });
    await lookup({ ip: "8.8.8.8", requestId: "three" });

    expect(providers.geojs).toHaveBeenCalledTimes(3);
  });

  it("coalesces simultaneous lookups for the same IP", async () => {
    let resolveGeo: ((value: ProviderObservation) => void) | undefined;
    const pendingGeo = new Promise<ProviderObservation>((resolve) => {
      resolveGeo = resolve;
    });
    const providers = completeProviders({
      geojs: vi.fn(() => pendingGeo),
    });
    const lookup = createIpLookup({ providers, clock: () => fixedDate });

    const first = lookup({ ip: "8.8.8.8", requestId: "first" });
    const second = lookup({ ip: "8.8.8.8", requestId: "second" });
    resolveGeo?.(geoObservation);
    const [firstResponse, secondResponse] = await Promise.all([first, second]);

    expect(providers.geojs).toHaveBeenCalledTimes(1);
    expect(firstResponse.meta.cached).toBe(false);
    expect(secondResponse.meta.cached).toBe(false);
    expect(secondResponse.meta.requestId).toBe("second");
  });
});
