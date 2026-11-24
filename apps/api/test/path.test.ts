import { describe, expect, test } from "bun:test";
import { getPath } from "../src/modules/engine/path";
import { orderEvent } from "./fixtures";

describe("getPath", () => {
  const data = { ...orderEvent(), items: [{ sku: "A1" }, { sku: "B2" }] };

  test("reads nested fields", () => {
    expect(getPath(data, "order.customer.email")).toBe("asha@example.com");
    expect(getPath(data, "order.amount")).toBe(4999);
    expect(getPath(data, "order")).toEqual(orderEvent().order ?? null);
  });

  test("reads array items by index", () => {
    expect(getPath(data, "items.1.sku")).toBe("B2");
    expect(getPath(data, "items.5.sku")).toBeNull();
    expect(getPath(data, "items.first")).toBeNull();
  });

  test("returns null for missing paths and paths through primitives", () => {
    expect(getPath(data, "order.missing")).toBeNull();
    expect(getPath(data, "order.amount.value")).toBeNull();
    expect(getPath(null, "anything")).toBeNull();
  });

  test("keeps falsy values that exist", () => {
    expect(getPath({ a: 0, b: false, c: "" }, "a")).toBe(0);
    expect(getPath({ a: 0, b: false, c: "" }, "b")).toBe(false);
    expect(getPath({ a: 0, b: false, c: "" }, "c")).toBe("");
  });

  test("never reads from the prototype", () => {
    expect(getPath({}, "constructor")).toBeNull();
    expect(getPath({}, "toString")).toBeNull();
    expect(getPath({}, "__proto__")).toBeNull();
  });
});
