import { pathToFileURL } from "node:url";
import type { Express } from "express";
import type { Server } from "node:http";
import { getRuntimeEnvironment } from "./config/environment.js";
import defaultApp from "./index.js";

export interface SignalTarget {
  once(event: "SIGTERM", listener: () => void): unknown;
  removeListener(event: "SIGTERM", listener: () => void): unknown;
}

export function startServer({
  app = defaultApp,
  port = getRuntimeEnvironment().port,
  signalTarget = process,
}: {
  app?: Express;
  port?: number;
  signalTarget?: SignalTarget;
} = {}): Server {
  const server = app.listen(port, "0.0.0.0");
  const close = (): void => {
    server.close();
  };
  signalTarget.once("SIGTERM", close);
  server.once("close", () => signalTarget.removeListener("SIGTERM", close));
  return server;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entryUrl) {
  const server = startServer();
  server.once("listening", () => {
    const address = server.address();
    const port =
      typeof address === "object" && address
        ? address.port
        : getRuntimeEnvironment().port;
    console.log(JSON.stringify({ event: "server_started", port }));
  });
}
