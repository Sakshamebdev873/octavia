/**
 * bun run migrate
 *
 * 1. Waits for PostgreSQL (it may still be starting after `docker compose up -d`).
 * 2. Applies every migrations/*.sql file not applied yet, in name order, in one
 *    transaction together with their schema_migrations rows. If any file
 *    fails, nothing is applied (PostgreSQL DDL is transactional).
 * 3. Waits for MongoDB and creates its indexes (createIndex is idempotent).
 *
 * Running it twice is a no-op.
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../src/config";
import { connectMongo } from "../src/db/mongo";
import { connectPostgres } from "../src/db/postgres";
import { ensureFlowIndexes } from "../src/modules/flows/flow.mongo";

const MIGRATIONS_DIR = join(import.meta.dir, "..", "migrations");
// Arbitrary constant: two migrate processes started at once take turns instead of racing.
const MIGRATION_LOCK_ID = 727_001;

async function migratePostgres(url: string): Promise<void> {
  const sql = await connectPostgres(url);
  try {
    await sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`;
      await tx`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          name       text        PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )`;

      const appliedRows = await tx<{ name: string }[]>`SELECT name FROM schema_migrations`;
      const applied = new Set(appliedRows.map((row) => row.name));
      const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith(".sql")).sort();
      const pending = files.filter((file) => !applied.has(file));

      for (const file of pending) {
        const text = await Bun.file(join(MIGRATIONS_DIR, file)).text();
        await tx.unsafe(text);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
        console.log(`  applied ${file}`);
      }
      console.log(pending.length ? `PostgreSQL: ${pending.length} migration(s) applied` : "PostgreSQL: up to date");
    });
  } finally {
    await sql.close();
  }
}

async function migrateMongo(url: string, dbName: string): Promise<void> {
  const { client, db } = await connectMongo(url, dbName);
  try {
    const indexes = await ensureFlowIndexes(db);
    console.log(`MongoDB: indexes ready (${indexes.join(", ")})`);
  } finally {
    await client.close();
  }
}

try {
  const config = loadConfig();
  await migratePostgres(config.DATABASE_URL);
  await migrateMongo(config.MONGO_URL, config.MONGO_DB);
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
}
