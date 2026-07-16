import { randomUUID } from "node:crypto";
import cors from "cors";
import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
} from "express";
import * as helmet from "helmet";
import { ApiError, type LookupIp } from "./ip-intelligence.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

function requestIdOf(request: Request): string {
  return request.requestId ?? "unknown";
}

function parserErrorType(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "type" in error &&
    typeof error.type === "string"
    ? error.type
    : undefined;
}

function ipFromBody(body: unknown): string {
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).length !== 1 ||
    !("ip" in body) ||
    typeof body.ip !== "string"
  ) {
    throw new ApiError(
      400,
      "INVALID_REQUEST",
      "Request body must contain only an IP value.",
    );
  }
  return body.ip;
}

export function createApp({
  lookup,
  allowedOrigins = [],
  clock = () => new Date(),
  requestIdFactory = randomUUID,
}: {
  readonly lookup: LookupIp;
  readonly allowedOrigins?: readonly string[];
  readonly clock?: () => Date;
  readonly requestIdFactory?: () => string;
}): Express {
  const app = express();
  const allowed = new Set(allowedOrigins);

  app.use((request, response, next) => {
    const incoming = request.get("x-request-id") ?? "";
    request.requestId = /^[A-Za-z0-9_-]{1,100}$/.test(incoming)
      ? incoming
      : requestIdFactory();
    response.setHeader("x-request-id", request.requestId);
    next();
  });
  app.use(helmet.default());
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowed.has(origin)) {
          callback(null, true);
          return;
        }
        callback(
          new ApiError(
            403,
            "ORIGIN_NOT_ALLOWED",
            "The request origin is not allowed.",
          ),
        );
      },
    }),
  );
  app.use(express.json({ limit: "4kb" }));

  app.get("/api/v1/health", (_request, response) => {
    response.json({
      status: "ok",
      service: "ip-intelligence-api",
      timestamp: clock().toISOString(),
    });
  });

  app.post("/api/v1/ip-lookups", async (request, response) => {
    response.status(200).json(
      await lookup({
        ip: ipFromBody(request.body as unknown),
        requestId: requestIdOf(request),
      }),
    );
  });

  app.use((_request, _response, next) => {
    next(new ApiError(404, "NOT_FOUND", "Route not found."));
  });

  const errorHandler: ErrorRequestHandler = (
    error,
    request,
    response,
    _next,
  ) => {
    void _next;
    const known = error instanceof ApiError;
    const type = parserErrorType(error);
    const mapped = known
      ? error
      : type === "entity.parse.failed"
        ? new ApiError(400, "MALFORMED_JSON", "Request body contains invalid JSON.")
        : type === "entity.too.large"
          ? new ApiError(
              413,
              "BODY_TOO_LARGE",
              "Request body exceeds the 4 KB limit.",
            )
          : new ApiError(
              500,
              "INTERNAL_ERROR",
              "An unexpected error occurred.",
            );
    if (!known && type !== "entity.parse.failed" && type !== "entity.too.large") {
      console.error(error);
    }
    response.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId: requestIdOf(request),
      },
    });
  };
  app.use(errorHandler);
  return app;
}
