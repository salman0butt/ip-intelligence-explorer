import { describe, expect, it } from "vitest";
import {
  lookupGeoJs,
  lookupRipeNetwork,
  lookupRipeRouting,
} from "../src/providers.js";

function jsonFetch(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json", ...headers },
    })) as typeof fetch;
}

describe("GeoJS provider", () => {
  it("normalizes location and organization data", async () => {
    const result = await lookupGeoJs("8.8.8.8", {
      fetchImpl: jsonFetch({
        ip: "8.8.8.8",
        city: "Mountain View",
        region: "California",
        country: "United States",
        country_code: "US",
        latitude: "37.386",
        longitude: "-122.0838",
        timezone: "America/Los_Angeles",
        asn: 15_169,
        organization: "AS15169 Google LLC",
      }),
    });

    expect(result).toEqual({
      source: "geojs",
      location: {
        city: "Mountain View",
        region: "California",
        country: "United States",
        countryCode: "US",
        latitude: 37.386,
        longitude: -122.0838,
        timezone: "America/Los_Angeles",
      },
      network: { asn: 15_169, organization: "Google LLC" },
    });
  });

  it("classifies invalid upstream data as unavailable", async () => {
    await expect(
      lookupGeoJs("8.8.8.8", { fetchImpl: jsonFetch({ ip: 123 }) }),
    ).rejects.toMatchObject({ source: "geojs", status: "unavailable" });
  });

  it("classifies HTTP 429 as rate limited", async () => {
    await expect(
      lookupGeoJs("8.8.8.8", { fetchImpl: jsonFetch({}, 429) }),
    ).rejects.toMatchObject({ source: "geojs", status: "rate_limited" });
  });

  it("classifies other unsuccessful HTTP responses as unavailable", async () => {
    await expect(
      lookupGeoJs("8.8.8.8", { fetchImpl: jsonFetch({}, 503) }),
    ).rejects.toMatchObject({ source: "geojs", status: "unavailable" });
  });

  it("classifies an aborted request as a timeout", async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });

    await expect(
      lookupGeoJs("8.8.8.8", { fetchImpl, timeoutMs: 1 }),
    ).rejects.toMatchObject({ source: "geojs", status: "timeout" });
  });
});

describe("RIPEstat providers", () => {
  it("normalizes network information", async () => {
    const result = await lookupRipeNetwork("8.8.8.8", {
      fetchImpl: jsonFetch({
        status: "ok",
        data: { prefix: "8.8.8.0/24", asns: ["15169"] },
      }),
    });

    expect(result).toEqual({
      source: "ripestat-network",
      network: { asn: 15_169, prefix: "8.8.8.0/24" },
    });
  });

  it("classifies invalid network information as unavailable", async () => {
    await expect(
      lookupRipeNetwork("8.8.8.8", {
        fetchImpl: jsonFetch({ status: "ok", data: { asns: "15169" } }),
      }),
    ).rejects.toMatchObject({
      source: "ripestat-network",
      status: "unavailable",
    });
  });

  it("normalizes routing information", async () => {
    const result = await lookupRipeRouting("8.8.8.8", {
      fetchImpl: jsonFetch({
        status: "ok",
        data: {
          resource: "8.8.8.0/24",
          query_time: "2026-07-16T12:00:00.000Z",
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
      }),
    });

    expect(result).toEqual({
      source: "ripestat-routing",
      routing: {
        resource: "8.8.8.0/24",
        queryTime: "2026-07-16T12:00:00.000Z",
        firstSeen: null,
        lastSeen: {
          prefix: "8.8.8.0/24",
          origin: 15_169,
          time: "2026-07-16T11:00:00.000Z",
        },
        origins: [15_169],
        visibility: {
          ipv4: { peersSeeing: 100, totalPeers: 100 },
          ipv6: { peersSeeing: 0, totalPeers: 100 },
        },
      },
    });
  });

  it("classifies invalid routing information as unavailable", async () => {
    await expect(
      lookupRipeRouting("8.8.8.8", {
        fetchImpl: jsonFetch({ status: "ok", data: { resource: 123 } }),
      }),
    ).rejects.toMatchObject({
      source: "ripestat-routing",
      status: "unavailable",
    });
  });
});
