import { describe, expect, test } from "bun:test";
import { applyTransform } from "../src/modules/engine/transform";
import { orderEvent } from "./fixtures";

describe("transform mapping", () => {
  test("builds the object from the brief's example", () => {
    const result = applyTransform(
      {
        type: "transform",
        mapping: { orderId: "order.id", total: "order.amount", email: "order.customer.email" },
      },
      orderEvent(),
    );
    expect(result).toEqual({ orderId: "ORD-1042", total: 4999, email: "asha@example.com" });
  });

  test("a missing path gives null", () => {
    const result = applyTransform({ type: "transform", mapping: { phone: "order.customer.phone" } }, orderEvent());
    expect(result).toEqual({ phone: null });
  });

  test("can copy whole objects and rename fields", () => {
    const result = applyTransform({ type: "transform", mapping: { buyer: "order.customer" } }, orderEvent());
    expect(result).toEqual({ buyer: { name: "Asha Rao", email: "asha@example.com" } });
  });
});
