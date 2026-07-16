import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import productionApp from "../src/index.js";
import { createApp } from "../src/create-app.js";
import { readConfig } from "../src/config.js";
import {
  ApiError,
  type LookupIp,
  type LookupResponse,
} from "../src/ip-intelligence.js";

const fixedDate = new Date("2026-07-16T12:00:00.000Z");

function lookupResponse(requestId: string): LookupResponse {
  return {
    data: {
      ip: "8.8.8.8",
      location: {
        city: "Mountain View",
        region: "California",
        country: "United States",
        countryCode: "US",
        latitude: 37.386,
        longitude: -122.0838,
        timezone: "America/Los_Angeles",
      },
      network: {
        asn: 15_169,
        organization: "Google LLC",
        prefix: "8.8.8.0/24",
      },
      routing: {
        announced: true,
        queryTime: fixedDate.toISOString(),
        firstSeen: null,
        lastSeen: null,
        visibility: {
          ipv4: { peersSeeing: 100, totalPeers: 100 },
          ipv6: { peersSeeing: 0, totalPeers: 100 },
        },
      },
    },
    meta: {
      status: "complete",
      cached: false,
      sources: {
        geojs: "available",
        ripestatNetwork: "available",
        ripestatRouting: "available",
      },
      requestId,
      lookedUpAt: fixedDate.toISOString(),
    },
    warnings: [],
  };
}

function successfulLookup(): LookupIp {
  return vi.fn(async ({ requestId }) => lookupResponse(requestId));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("production composition", () => {
  it("uses all three upstream endpoints through the production app", async () => {
    const geoUrl = "https://get.geojs.io/v1/ip/geo/8.8.8.8.json";
    const networkUrl =
      "https://stat.ripe.net/data/network-info/data.json?resource=8.8.8.8&sourceapp=ip-intelligence-explorer";
    const routingUrl =
      "https://stat.ripe.net/data/routing-status/data.json?resource=8.8.8.8&sourceapp=ip-intelligence-explorer";
    const payloads = new Map<string, unknown>([
      [
        geoUrl,
        {
          ip: "8.8.8.8",
          city: "Mountain View",
          region: "California",
          country: "United States",
          country_code: "US",
          latitude: "37.386",
          longitude: "-122.0838",
          timezone: "America/Los_Angeles",
          asn: 13_335,
          organization: "AS15169 Google LLC",
        },
      ],
      [
        networkUrl,
        {
          status: "ok",
          data: { prefix: "8.8.8.0/24", asns: ["15169"] },
        },
      ],
      [
        routingUrl,
        {
          status: "ok",
          data: {
            resource: "8.8.8.0/24",
            query_time: fixedDate.toISOString(),
            first_seen: null,
            last_seen: {
              prefix: "8.8.8.0/24",
              origin: "15169",
              time: "2026-07-16T11:00:00.000Z",
            },
            origins: [{ origin: "15169" }],
            visibility: {
              v4: { ris_peers_seeing: 100, total_ris_peers: 100 },
              v6: { ris_peers_seeing: 0, total_ris_peers: 100 },
            },
          },
        },
      ],
    ]);
    const upstreamRequests: string[] = [];
    const fetchStub: typeof fetch = async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      upstreamRequests.push(url);
      const payload = payloads.get(url);
      if (payload === undefined) {
        throw new Error(`Unexpected upstream request: ${url}`);
      }
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
      });
    };
    vi.stubGlobal("fetch", vi.fn(fetchStub));

    const response = await request(productionApp)
      .post("/api/v1/ip-lookups")
      .set("x-request-id", "production-composition")
      .send({ ip: "8.8.8.8" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      data: {
        ip: "8.8.8.8",
        location: {
          city: "Mountain View",
          region: "California",
          country: "United States",
          countryCode: "US",
          latitude: 37.386,
          longitude: -122.0838,
          timezone: "America/Los_Angeles",
        },
        network: {
          asn: 15_169,
          organization: "Google LLC",
          prefix: "8.8.8.0/24",
        },
        routing: {
          announced: true,
          queryTime: fixedDate.toISOString(),
          firstSeen: null,
          lastSeen: {
            prefix: "8.8.8.0/24",
            origin: 15_169,
            time: "2026-07-16T11:00:00.000Z",
          },
          visibility: {
            ipv4: { peersSeeing: 100, totalPeers: 100 },
            ipv6: { peersSeeing: 0, totalPeers: 100 },
          },
        },
      },
      meta: {
        status: "complete",
        cached: false,
        sources: {
          geojs: "available",
          ripestatNetwork: "available",
          ripestatRouting: "available",
        },
        requestId: "production-composition",
        lookedUpAt: expect.any(String),
      },
      warnings: [],
    });
    expect(upstreamRequests).toEqual([geoUrl, networkUrl, routingUrl]);
  });
});

describe("health route", () => {
  it("returns health without calling the lookup", async () => {
    const lookup = successfulLookup();
    const app = createApp({ lookup, clock: () => fixedDate });

    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      service: "ip-intelligence-api",
      timestamp: fixedDate.toISOString(),
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("lookup route", () => {
  it("passes the IP and incoming request ID to the lookup", async () => {
    const lookup = successfulLookup();
    const app = createApp({ lookup });

    const response = await request(app)
      .post("/api/v1/ip-lookups")
      .set("x-request-id", "client-request")
      .send({ ip: "8.8.8.8" });

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("client-request");
    expect(response.body.meta.requestId).toBe("client-request");
    expect(lookup).toHaveBeenCalledWith({
      ip: "8.8.8.8",
      requestId: "client-request",
    });
  });

  it("generates a request ID when the incoming value is unsafe", async () => {
    const lookup = successfulLookup();
    const app = createApp({
      lookup,
      requestIdFactory: () => "generated-request",
    });

    const response = await request(app)
      .post("/api/v1/ip-lookups")
      .set("x-request-id", "contains spaces")
      .send({ ip: "8.8.8.8" });

    expect(response.headers["x-request-id"]).toBe("generated-request");
    expect(response.body.meta.requestId).toBe("generated-request");
  });

  it("rejects bodies with extra fields", async () => {
    const lookup = successfulLookup();
    const app = createApp({ lookup, requestIdFactory: () => "body-request" });

    const response = await request(app)
      .post("/api/v1/ip-lookups")
      .send({ ip: "8.8.8.8", extra: true });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Request body must contain only an IP value.",
        requestId: "body-request",
      },
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("maps expected lookup errors without leaking details", async () => {
    const lookup: LookupIp = async () => {
      throw new ApiError(
        502,
        "UPSTREAM_UNAVAILABLE",
        "External data providers are unavailable. Try again.",
      );
    };
    const app = createApp({ lookup, requestIdFactory: () => "error-request" });

    const response = await request(app)
      .post("/api/v1/ip-lookups")
      .send({ ip: "8.8.8.8" });

    expect(response.status).toBe(502);
    expect(response.body).toEqual({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "External data providers are unavailable. Try again.",
        requestId: "error-request",
      },
    });
  });
});

describe("HTTP safeguards", () => {
  it("rejects a disallowed browser origin", async () => {
    const app = createApp({
      lookup: successfulLookup(),
      allowedOrigins: ["https://allowed.example"],
      requestIdFactory: () => "cors-request",
    });

    const response = await request(app)
      .post("/api/v1/ip-lookups")
      .set("origin", "https://blocked.example")
      .send({ ip: "8.8.8.8" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ORIGIN_NOT_ALLOWED");
  });

  it("returns 404 for an unknown route", async () => {
    const app = createApp({
      lookup: successfulLookup(),
      requestIdFactory: () => "not-found-request",
    });

    const response = await request(app).get("/missing");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
  });

  it("returns 400 for malformed JSON", async () => {
    const app = createApp({
      lookup: successfulLookup(),
      requestIdFactory: () => "json-request",
    });

    const response = await request(app)
      .post("/api/v1/ip-lookups")
      .set("content-type", "application/json")
      .send("{");

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("MALFORMED_JSON");
  });

  it("returns 413 for a body larger than 4 KB", async () => {
    const app = createApp({
      lookup: successfulLookup(),
      requestIdFactory: () => "large-request",
    });

    const response = await request(app)
      .post("/api/v1/ip-lookups")
      .send({ ip: "x".repeat(5_000) });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("BODY_TOO_LARGE");
  });

  it("sanitizes and logs unexpected errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApp({
      lookup: async () => {
        throw new Error("secret provider detail");
      },
      requestIdFactory: () => "unexpected-request",
    });

    const response = await request(app)
      .post("/api/v1/ip-lookups")
      .send({ ip: "8.8.8.8" });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
        requestId: "unexpected-request",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("secret provider detail");
    expect(log).toHaveBeenCalled();
  });
});

describe("runtime configuration", () => {
  it("parses the port and comma-separated HTTP origins", () => {
    expect(
      readConfig({
        PORT: "8080",
        ALLOWED_ORIGINS: "http://localhost:5173, https://example.com/path",
      }),
    ).toEqual({
      port: 8080,
      allowedOrigins: ["http://localhost:5173", "https://example.com"],
    });
  });

  it("uses local defaults", () => {
    expect(readConfig({})).toEqual({
      port: 3000,
      allowedOrigins: ["http://localhost:5173"],
    });
  });

  it("rejects port zero", () => {
    expect(() => readConfig({ PORT: "0" })).toThrow();
  });

  it("rejects non-HTTP origins", () => {
    expect(() =>
      readConfig({ ALLOWED_ORIGINS: "ftp://example.com" }),
    ).toThrow("ALLOWED_ORIGINS contains an invalid HTTP(S) origin.");
  });
});
