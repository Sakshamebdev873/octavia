import type { LastRun } from "@flowlet/shared";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { connectMongo } from "./db/mongo";
import { ensureFlowIndexes, MongoFlowRepository } from "./modules/flows/flow.mongo";
import type { FlowRunsPort } from "./modules/flows/flow.repository";

const config = loadConfig();

const mongo = await connectMongo(config.MONGO_URL, config.MONGO_DB);
await ensureFlowIndexes(mongo.db);

// Temporary until the Postgres run repository exists (Phase 5).
const runs: FlowRunsPort = {
  latestByFlowIds: async () => new Map<string, LastRun>(),
  deleteByFlow: async () => {},
};

const app = createApp({
  flows: new MongoFlowRepository(mongo.db),
  runs,
  webOrigin: config.WEB_ORIGIN,
  logRequests: true,
});

const server = Bun.serve({ port: config.PORT, fetch: app.fetch });

console.log(`Flowlet API listening on http://localhost:${server.port}`);

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  void server
    .stop()
    .then(() => mongo.client.close())
    .then(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
