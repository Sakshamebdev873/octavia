import type { JsonValue } from "@flowlet/shared";
import { SQL } from "bun";
import { retry } from "../lib/retry";

/** Opens a Bun.SQL connection pool and waits until PostgreSQL accepts queries. */
export async function connectPostgres(url: string): Promise<SQL> {
  const sql = new SQL({ url, max: 10, idleTimeout: 30, connectionTimeout: 5 });
  await retry("PostgreSQL", async () => {
    await sql`SELECT 1`;
  });
  return sql;
}

/**
 * JSON going into a jsonb column. We send text and cast it in SQL with
 * `::text::jsonb`, so PostgreSQL parses it. That stores every JSON type
 * correctly (objects, strings, numbers, booleans, null) and does not depend
 * on how a given Bun version encodes parameters. SQL NULL stays NULL.
 */
export function toJsonb(value: JsonValue | null): string | null {
  return value === null ? null : JSON.stringify(value);
}

/** JSON coming out of a jsonb column that was selected as `column::text`. */
export function fromJsonb(text: string | null): JsonValue | null {
  // JSON.parse is typed `any`; text produced by PostgreSQL's jsonb output is always valid JSON.
  return text === null ? null : (JSON.parse(text) as JsonValue);
}
