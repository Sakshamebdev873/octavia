import { createApp } from "./app";
import { loadConfig } from "./config";
import { connectMongo } from "./db/mongo";
import { connectPostgres } from "./db/postgres";
import { ensureFlowIndexes, MongoFlowRepository } from "./modules/flows/flow.mongo";
import { PostgresRunRepository } from "./modules/runs/run.postgres";

const config = loadConfig();

const [mongo, sql] = await Promise.all([
  connectMongo(config.MONGO_URL, config.MONGO_DB),
  connectPostgres(config.DATABASE_URL),
]);
await ensureFlowIndexes(mongo.db);

const app = createApp({
  flows: new MongoFlowRepository(mongo.db),
  runs: new PostgresRunRepository(sql),
  webOrigin: config.WEB_ORIGIN,
  logRequests: true,
});

const server = Bun.serve({ port: config.PORT, fetch: app.fetch });

console.log(`Flowlet API listening on http://localhost:${server.port}`);

function shutdown(signal: string): void {
  console.log(`${signal} received, shutting down`);
  void server
    .stop()
    .then(() => Promise.all([mongo.client.close(), sql.close()]))
    .then(() => process.exit(0));
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
