import { z } from "zod";
import { ProviderError } from "../../../shared/errors/provider-error.js";
import { fetchJson } from "../../../shared/http/fetch-json.js";
import type { IntelligenceProvider, IpAddress, ProviderObservation } from "../ip-intelligence.types.js";
import { asnSchema, ripeStatUrl } from "./ripestat-network.provider.js";

const event = z.object({
  prefix: z.string(),
  origin: asnSchema,
  time: z.string(),
}).nullish();
const peers = z.object({
  ris_peers_seeing: z.number().int().nonnegative(),
  total_ris_peers: z.number().int().nonnegative(),
});
const schema = z.object({
  status: z.literal("ok"),
  data: z.object({
    resource: z.string(),
    query_time: z.string(),
    first_seen: event,
    last_seen: event,
    origins: z.array(z.object({ origin: asnSchema }).loose()).default([]),
    visibility: z.object({ v4: peers, v6: peers }),
  }).loose(),
}).loose();

export class RipeStatRoutingProvider implements IntelligenceProvider {
  readonly id = "ripestat-routing" as const;

  constructor(private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {}

  async lookup(ip: IpAddress): Promise<ProviderObservation> {
    const parsed = schema.safeParse(await fetchJson({
      url: ripeStatUrl("routing-status", ip),
      source: this.id,
      ...this.options,
    }));
    if (!parsed.success) {
      throw new ProviderError(this.id, "invalid_response", "RIPEstat routing response failed validation.");
    }
    const value = parsed.data.data;
    return {
      source: this.id,
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
}
