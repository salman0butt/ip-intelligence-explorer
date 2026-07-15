import type { Express } from "express";
import { createApp } from "./app.js";
import { getRuntimeEnvironment } from "./config/environment.js";
import { IpIntelligenceService } from "./modules/ip-intelligence/ip-intelligence.service.js";
import type { CachedLookup } from "./modules/ip-intelligence/ip-intelligence.types.js";
import { GeoJsProvider } from "./modules/ip-intelligence/providers/geojs.provider.js";
import { RipeStatNetworkProvider } from "./modules/ip-intelligence/providers/ripestat-network.provider.js";
import { RipeStatRoutingProvider } from "./modules/ip-intelligence/providers/ripestat-routing.provider.js";
import { MemoryCache } from "./shared/cache/memory-cache.js";

export function createProductionApp(): Express {
  const runtime = getRuntimeEnvironment();
  const service = new IpIntelligenceService({
    providers: [
      new GeoJsProvider(),
      new RipeStatNetworkProvider(),
      new RipeStatRoutingProvider(),
    ],
    cache: new MemoryCache<CachedLookup>(),
  });
  return createApp({
    lookupService: service,
    allowedOrigins: runtime.allowedOrigins,
    logger: {
      info: (event) => {
        console.log(JSON.stringify(event));
      },
      error: (event) => {
        console.error(JSON.stringify(event));
      },
    },
  });
}

export default createProductionApp();
