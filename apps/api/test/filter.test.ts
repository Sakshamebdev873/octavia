import { describe, expect, test } from "bun:test";
import type { FilterOperator, FilterValue } from "@flowlet/shared";
import { evaluateFilter } from "../src/modules/engine/filter";
import { orderEvent } from "./fixtures";

const data = { ...orderEvent(4999), tags: ["vip", "new"], note: "Leave at the door" };

function passes(field: string, operator: FilterOperator, value: FilterValue): boolean {
  return evaluateFilter({ type: "filter", field, operator, value }, data).passed;
}

describe("filter operators", () => {
  test("eq compares strictly", () => {
    expect(passes("order.currency", "eq", "INR")).toBe(true);
    expect(passes("order.currency", "eq", "USD")).toBe(false);
    expect(passes("order.amount", "eq", 4999)).toBe(true);
    expect(passes("order.amount", "eq", "4999")).toBe(false);
  });

  test("neq is the opposite of eq", () => {
    expect(passes("order.currency", "neq", "USD")).toBe(true);
    expect(passes("order.currency", "neq", "INR")).toBe(false);
  });

  test("gt and lt compare numbers", () => {
    expect(passes("order.amount", "gt", 1000)).toBe(true);
    expect(passes("order.amount", "gt", 4999)).toBe(false);
    expect(passes("order.amount", "lt", 5000)).toBe(true);
    expect(passes("order.amount", "lt", 4999)).toBe(false);
  });

  test("gt and lt are false when the field is not a number", () => {
    expect(passes("order.currency", "gt", 1)).toBe(false);
    expect(passes("order.missing", "lt", 1)).toBe(false);
  });

  test("contains matches substrings and array elements", () => {
    expect(passes("note", "contains", "door")).toBe(true);
    expect(passes("note", "contains", "window")).toBe(false);
    expect(passes("tags", "contains", "vip")).toBe(true);
    expect(passes("tags", "contains", "old")).toBe(false);
    expect(passes("order.amount", "contains", "49")).toBe(false);
  });

  test("a missing field reads as null", () => {
    expect(passes("order.coupon", "eq", null)).toBe(true);
    expect(passes("order.coupon", "neq", "SAVE10")).toBe(true);
  });

  test("returns the value it read, for the run timeline", () => {
    const result = evaluateFilter({ type: "filter", field: "order.amount", operator: "gt", value: 1000 }, data);
    expect(result).toEqual({ passed: true, actual: 4999 });
  });
});
