import { isJsonObject, type JsonValue } from "@flowlet/shared";

/**
 * Reads a dot path such as `order.customer.email` or `items.0.sku` from JSON data.
 *
 * - Objects: only own properties are read (Object.hasOwn), so `__proto__`,
 *   `constructor` or `toString` can never reach the prototype.
 * - Arrays: a segment made of digits is an index.
 * - A missing key, an index out of range, or walking into a primitive gives null.
 */
export function getPath(data: JsonValue, path: string): JsonValue {
  let current: JsonValue = data;

  for (const segment of path.split(".")) {
    let next: JsonValue | undefined;

    if (Array.isArray(current)) {
      next = /^\d+$/.test(segment) ? current[Number(segment)] : undefined;
    } else if (isJsonObject(current) && Object.hasOwn(current, segment)) {
      next = current[segment];
    }

    if (next === undefined) return null;
    current = next;
  }

  return current;
}
