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
  readonly warnings: readonly {
    readonly source: ProviderId;
    readonly code: SourceStatus;
    readonly message: string;
  }[];
}

export interface HealthResponse {
  readonly status: "ok";
  readonly service: string;
  readonly timestamp: string;
}
