import { Router } from "express";

export function createHealthRouter(clock: () => Date = () => new Date()): Router {
  const router = Router();
  router.get("/", (_request, response) =>
    response.json({
      status: "ok",
      service: "ip-intelligence-api",
      timestamp: clock().toISOString(),
    }),
  );
  return router;
}
