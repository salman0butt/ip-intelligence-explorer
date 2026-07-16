import type { Express } from "express";
import { createApp } from "./create-app.js";
import { readConfig } from "./config.js";
import { createIpLookup } from "./ip-intelligence.js";
import {
  lookupGeoJs,
  lookupRipeNetwork,
  lookupRipeRouting,
} from "./providers.js";

export function createProductionApp(): Express {
  const runtime = readConfig();
  const lookup = createIpLookup({
    providers: {
      geojs: lookupGeoJs,
      ripestatNetwork: lookupRipeNetwork,
      ripestatRouting: lookupRipeRouting,
    },
  });
  return createApp({
    lookup,
    allowedOrigins: runtime.allowedOrigins,
  });
}

export default createProductionApp();
