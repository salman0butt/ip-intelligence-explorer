import { requestJson } from "../../../shared/api/apiClient";
import type {
  HealthResponse,
  LookupResponse,
} from "../types/ipIntelligence";

export const ipIntelligenceService = {
  getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return requestJson<HealthResponse>(
      "/api/v1/health",
      signal ? { signal } : {},
    );
  },

  lookupIp({
    ip,
    signal,
  }: {
    readonly ip: string;
    readonly signal: AbortSignal;
  }): Promise<LookupResponse> {
    return requestJson<LookupResponse>("/api/v1/ip-lookups", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ip }),
    });
  },
};
