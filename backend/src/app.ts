import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { createIpIntelligenceRouter } from "./modules/ip-intelligence/ip-intelligence.routes.js";
import type { IpIntelligenceService } from "./modules/ip-intelligence/ip-intelligence.service.js";
import { ApplicationError } from "./shared/errors/application-error.js";
import {
  createErrorHandler,
  createRequestContext,
  type HttpLogger,
} from "./shared/http/error-handler.js";

const quiet: HttpLogger = {
  info: () => undefined,
  error: () => undefined,
};

export function createApp({
  lookupService,
  allowedOrigins = [],
  logger = quiet,
  requestIdFactory,
  healthClock,
}: {
  lookupService: Pick<IpIntelligenceService, "lookup">;
  allowedOrigins?: readonly string[];
  logger?: HttpLogger;
  requestIdFactory?: () => string;
  healthClock?: () => Date;
}): Express {
  const app = express();
  const allowed = new Set(allowedOrigins);
  app.use(
    createRequestContext(logger, {
      ...(requestIdFactory ? { requestIdFactory } : {}),
    }),
  );
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowed.has(origin)) {
          callback(null, true);
          return;
        }
        callback(
          new ApplicationError(
            403,
            "ORIGIN_NOT_ALLOWED",
            "The request origin is not allowed.",
          ),
        );
      },
    }),
  );
  app.use(express.json({ limit: "4kb" }));
  app.use("/api/v1/health", createHealthRouter(healthClock));
  app.use("/api/v1/ip-lookups", createIpIntelligenceRouter(lookupService));
  app.use((_request, _response, next) => {
    next(new ApplicationError(404, "NOT_FOUND", "Route not found."));
  });
  app.use(createErrorHandler(logger));
  return app;
}
