import type { RequestHandler } from "express";
import { ApplicationError } from "../../shared/errors/application-error.js";
import { requestIdOf } from "../../shared/http/error-handler.js";
import { lookupRequestSchema, parseIpAddress } from "./ip-intelligence.schemas.js";
import type { IpIntelligenceService } from "./ip-intelligence.service.js";

export function createLookupController(
  service: Pick<IpIntelligenceService, "lookup">,
): RequestHandler {
  return async (request, response) => {
    const parsed = lookupRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApplicationError(
        400,
        "INVALID_REQUEST",
        "Request body must contain only an IP value.",
      );
    }
    response.status(200).json(
      await service.lookup({
        ip: parseIpAddress(parsed.data.ip),
        requestId: requestIdOf(request),
      }),
    );
  };
}
