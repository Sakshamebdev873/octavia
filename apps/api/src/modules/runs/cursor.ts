import { z } from "zod";

/** The sort key of the last run on a page: where the next page starts. */
export interface RunCursor {
  startedAt: Date;
  id: string;
}

const cursorSchema = z.object({ t: z.iso.datetime(), id: z.uuid() });

/** Opaque to clients: base64url of {"t": ISO time, "id": run id}. */
export function encodeCursor(cursor: RunCursor): string {
  const json = JSON.stringify({ t: cursor.startedAt.toISOString(), id: cursor.id });
  return Buffer.from(json, "utf8").toString("base64url");
}

/** null when the string is not a cursor we issued. */
export function decodeCursor(value: string): RunCursor | null {
  try {
    const json: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const parsed = cursorSchema.safeParse(json);
    return parsed.success ? { startedAt: new Date(parsed.data.t), id: parsed.data.id } : null;
  } catch {
    return null;
  }
}
