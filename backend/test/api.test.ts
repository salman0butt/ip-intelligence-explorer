import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { IpIntelligenceService } from "../src/modules/ip-intelligence/ip-intelligence.service.js";
import type {
  CachedLookup,
  IntelligenceProvider,
} from "../src/modules/ip-intelligence/ip-intelligence.types.js";
import { MemoryCache } from "../src/shared/cache/memory-cache.js";

const fixedDate = new Date("2026-07-16T12:00:00.000Z");

const providers: readonly IntelligenceProvider[] = [
  {
    id: "geojs",
    lookup: async () => ({
      source: "geojs",
      location: {
        city: "Mountain View",
        country: "United States",
        latitude: 37.386,
        longitude: -122.0838,
      },
      network: { organization: "Google LLC" },
    }),
  },
  {
    id: "ripestat-network",
    lookup: async () => ({
      source: "ripestat-network",
      network: { asn: 15_169, prefix: "8.8.8.0/24" },
    }),
  },
  {
    id: "ripestat-routing",
    lookup: async () => ({
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
    }),
  },
];

function createTestApp() {
  const service = new IpIntelligenceService({
    providers,
    cache: new MemoryCache<CachedLookup>(() => 0),
    clock: () => fixedDate,
  });
  return createApp({
    lookupService: service,
    requestIdFactory: () => "smoke-request",
    healthClock: () => fixedDate,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public API smoke test", () => {
  it("serves health without a provider request", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await request(createTestApp()).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "ip-intelligence-api",
      timestamp: fixedDate.toISOString(),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a normalized lookup from fake providers", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await request(createTestApp())
      .post("/api/v1/ip-lookups")
      .send({ ip: "8.8.8.8" });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
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
        sources: {
          geojs: "available",
          ripestatNetwork: "available",
          ripestatRouting: "available",
        },
        requestId: "smoke-request",
        lookedUpAt: fixedDate.toISOString(),
      },
      warnings: [],
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
