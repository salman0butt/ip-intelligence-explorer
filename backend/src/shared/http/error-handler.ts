import { randomUUID } from "node:crypto";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ApplicationError } from "../errors/application-error.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export interface HttpLogger {
  info(event: Readonly<Record<string, unknown>>): void;
  error(event: Readonly<Record<string, unknown>>): void;
}

export function requestIdOf(request: Express.Request): string {
  return request.requestId ?? "unknown";
}

function safePath(path: string): string {
  return path === "/api/v1/health" || path === "/api/v1/ip-lookups"
    ? path
    : "/unmatched";
}

export function createRequestContext(
  logger: HttpLogger,
  options: { requestIdFactory?: () => string; clock?: () => number } = {},
): RequestHandler {
  const makeId = options.requestIdFactory ?? randomUUID;
  const clock = options.clock ?? (() => performance.now());
  return (request, response, next) => {
    const incoming = request.get("x-request-id") ?? "";
    request.requestId = /^[A-Za-z0-9_-]{1,100}$/.test(incoming)
      ? incoming
      : makeId();
    response.setHeader("x-request-id", request.requestId);
    const started = clock();
    const path = safePath(request.path);
    response.once("finish", () => {
      logger.info({
        event: "request_completed",
        requestId: requestIdOf(request),
        method: request.method,
        path,
        status: response.statusCode,
        durationMs: Math.max(0, Math.round(clock() - started)),
      });
    });
    next();
  };
}

function errorType(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "type" in error &&
    typeof error.type === "string"
    ? error.type
    : undefined;
}

export function createErrorHandler(logger: HttpLogger): ErrorRequestHandler {
  return (error, request, response, _next) => {
    void _next;
    const mapped =
      error instanceof ApplicationError
        ? error
        : errorType(error) === "entity.parse.failed"
          ? new ApplicationError(
              400,
              "MALFORMED_JSON",
              "Request body contains invalid JSON.",
            )
          : errorType(error) === "entity.too.large"
            ? new ApplicationError(
                413,
                "BODY_TOO_LARGE",
                "Request body exceeds the 4 KB limit.",
              )
            : new ApplicationError(
                500,
                "INTERNAL_ERROR",
                "An unexpected error occurred.",
              );
    const requestId = requestIdOf(request);
    logger.error({ event: "request_failed", requestId, code: mapped.code });
    response.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message, requestId },
    });
  };
}
