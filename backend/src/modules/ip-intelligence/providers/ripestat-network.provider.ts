import { z } from "zod";
import { ProviderError } from "../../../shared/errors/provider-error.js";
import { fetchJson } from "../../../shared/http/fetch-json.js";
import type { IntelligenceProvider, IpAddress, ProviderObservation } from "../ip-intelligence.types.js";

export const asnSchema = z.union([z.string().regex(/^\d+$/), z.number()])
  .transform(Number)
  .pipe(z.number().int().nonnegative().max(4_294_967_295));

export function ripeStatUrl(endpoint: "network-info" | "routing-status", ip: IpAddress): string {
  const url = new URL(`https://stat.ripe.net/data/${endpoint}/data.json`);
  url.searchParams.set("resource", ip);
  url.searchParams.set("sourceapp", "ip-intelligence-explorer");
  return url.toString();
}

const schema = z.object({
  status: z.literal("ok"),
  data: z.object({
    prefix: z.string().nullish(),
    asns: z.array(asnSchema),
  }).loose(),
}).loose();

export class RipeStatNetworkProvider implements IntelligenceProvider {
  readonly id = "ripestat-network" as const;

  constructor(private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {}

  async lookup(ip: IpAddress): Promise<ProviderObservation> {
    const parsed = schema.safeParse(await fetchJson({
      url: ripeStatUrl("network-info", ip),
      source: this.id,
      ...this.options,
    }));
    if (!parsed.success) {
      throw new ProviderError(this.id, "invalid_response", "RIPEstat network response failed validation.");
    }
    return {
      source: this.id,
      network: {
        asn: parsed.data.data.asns[0] ?? null,
        prefix: parsed.data.data.prefix ?? null,
      },
    };
  }
}
