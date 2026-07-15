import { Router } from "express";
import { createLookupController } from "./ip-intelligence.controller.js";
import type { IpIntelligenceService } from "./ip-intelligence.service.js";

export function createIpIntelligenceRouter(
  service: Pick<IpIntelligenceService, "lookup">,
): Router {
  const router = Router();
  router.post("/", createLookupController(service));
  return router;
}
