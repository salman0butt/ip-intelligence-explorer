import { z } from "zod";
import { ProviderError } from "../../../shared/errors/provider-error.js";
import { fetchJson } from "../../../shared/http/fetch-json.js";
import type { IntelligenceProvider, IpAddress, ProviderObservation } from "../ip-intelligence.types.js";

const coordinate = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value ?? null;
    const trimmed = value.trim();
    return trimmed ? Number(trimmed) : null;
  },
  z.number().nullable(),
);
const schema = z.object({
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
}).loose();

export class GeoJsProvider implements IntelligenceProvider {
  readonly id = "geojs" as const;

  constructor(private readonly options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {}

  async lookup(ip: IpAddress): Promise<ProviderObservation> {
    const parsed = schema.safeParse(await fetchJson({
      url: `https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`,
      source: this.id,
      ...this.options,
    }));
    if (!parsed.success) throw new ProviderError(this.id, "invalid_response", "GeoJS response failed validation.");
    const value = parsed.data;
    const organization = value.organization_name ?? value.organization?.replace(/^AS\d+\s+/, "") ?? null;
    return {
      source: this.id,
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
        asn: value.asn === 64_512 ? null : value.asn ?? null,
        organization: organization === "Unknown" ? null : organization,
      },
    };
  }
}
