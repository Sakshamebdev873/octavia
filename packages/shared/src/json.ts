/**
 * A value that can be represented in JSON. Used everywhere we hold user data
 * (webhook payloads, step input and output) instead of `any` or `unknown`.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
