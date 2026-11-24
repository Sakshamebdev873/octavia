import { toValidationIssues, type JsonValue } from "@flowlet/shared";
import type { Context } from "hono";
import type { z } from "zod";
import { ApiError } from "./errors";

/** Parses a JSON string, or throws 400 INVALID_JSON. */
export function parseJson(raw: string): JsonValue {
  try {
    // JSON.parse is typed as `any`, but without a reviver its result is always
    // a JSON value, so narrowing it to JsonValue is exact, not a guess.
    return JSON.parse(raw) as JsonValue;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body is not valid JSON");
  }
}

/** Reads the raw body and parses it as JSON. Returns both, because webhooks need the raw text. */
export async function readJson(c: Context): Promise<{ raw: string; value: JsonValue }> {
  const raw = await c.req.text();
  return { raw, value: parseJson(raw) };
}

/**
 * Validates input with a Zod schema, or throws 400 VALIDATION_ERROR.
 * The message is the first issue; details.issues lists every issue with its path.
 */
export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues = toValidationIssues(result.error);
  throw new ApiError(400, "VALIDATION_ERROR", issues[0]?.message ?? "Invalid input", { issues });
}
