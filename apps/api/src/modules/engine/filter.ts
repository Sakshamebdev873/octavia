import type { FilterOperator, FilterStep, FilterValue, JsonValue } from "@flowlet/shared";
import { getPath } from "./path";

export interface FilterResult {
  passed: boolean;
  /** The value read from the data, stored as the step output so the timeline shows why. */
  actual: JsonValue;
}

export function evaluateFilter(step: FilterStep, data: JsonValue): FilterResult {
  const actual = getPath(data, step.field);
  return { passed: compare(step.operator, actual, step.value), actual };
}

const isFiniteNumber = (value: JsonValue): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * eq / neq: strict equality, no type conversion ("1000" is not 1000).
 * gt / lt: both sides must be numbers, otherwise false.
 * contains: substring for strings, element match for arrays, otherwise false.
 */
export function compare(operator: FilterOperator, actual: JsonValue, expected: FilterValue): boolean {
  switch (operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "gt":
      return isFiniteNumber(actual) && isFiniteNumber(expected) && actual > expected;
    case "lt":
      return isFiniteNumber(actual) && isFiniteNumber(expected) && actual < expected;
    case "contains":
      if (typeof actual === "string") return typeof expected === "string" && actual.includes(expected);
      if (Array.isArray(actual)) return actual.some((item) => item === expected);
      return false;
    default: {
      // Exhaustiveness check: adding an operator to the schema is a compile error here until handled.
      const unhandled: never = operator;
      throw new Error(`Unknown operator: ${String(unhandled)}`);
    }
  }
}
