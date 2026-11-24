import type { JsonObject, Step } from "@flowlet/shared";

/** The example event from the brief. */
export function orderEvent(amount = 4999): JsonObject {
  return {
    event: "order.created",
    order: {
      id: "ORD-1042",
      amount,
      currency: "INR",
      customer: { name: "Asha Rao", email: "asha@example.com" },
    },
  };
}

/** The example flow's steps from the brief, with a configurable http target. */
export function exampleSteps(url: string): Step[] {
  return [
    { type: "filter", field: "order.amount", operator: "gt", value: 1000 },
    {
      type: "transform",
      mapping: { orderId: "order.id", total: "order.amount", email: "order.customer.email" },
    },
    { type: "http_request", url, method: "POST" },
  ];
}
