import type { JsonObject, JsonValue, TransformStep } from "@flowlet/shared";
import { getPath } from "./path";

/**
 * Builds a new object: each mapping key is an output field, each value a dot
 * path into the current data. A missing path gives null.
 *
 * Object.fromEntries defines own properties, so no key can change the prototype.
 */
export function applyTransform(step: TransformStep, data: JsonValue): JsonObject {
  return Object.fromEntries(
    Object.entries(step.mapping).map(([outputKey, path]) => [outputKey, getPath(data, path)]),
  );
}
