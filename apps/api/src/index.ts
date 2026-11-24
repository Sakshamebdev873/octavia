import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();

const app = createApp({ webOrigin: config.WEB_ORIGIN, logRequests: true });

const server = Bun.serve({ port: config.PORT, fetch: app.fetch });

console.log(`Flowlet API listening on http://localhost:${server.port}`);

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  void server.stop().then(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
