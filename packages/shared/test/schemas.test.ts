import { describe, expect, test } from "bun:test";
import {
  createFlowSchema,
  runListQuerySchema,
  stepSchema,
  toValidationIssues,
  updateFlowSchema,
} from "../src";

const filterStep = { type: "filter", field: "order.amount", operator: "gt", value: 1000 } as const;

function firstIssue(input: unknown, schema: typeof createFlowSchema | typeof updateFlowSchema = createFlowSchema) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error("expected validation to fail");
  return toValidationIssues(result.error)[0];
}

describe("createFlowSchema", () => {
  test("accepts the example flow from the brief and defaults enabled to true", () => {
    const flow = createFlowSchema.parse({
      name: "High value orders",
      steps: [
        filterStep,
        { type: "transform", mapping: { orderId: "order.id", total: "order.amount" } },
        { type: "http_request", url: "http://localhost:4000/api/mock/receiver", method: "POST" },
      ],
    });
    expect(flow.enabled).toBe(true);
    expect(flow.steps).toHaveLength(3);
  });

  test("name must be 3 to 80 characters", () => {
    expect(firstIssue({ name: "ab", steps: [filterStep] })).toEqual({
      path: "name",
      message: "Name must be at least 3 characters",
    });
    expect(firstIssue({ name: "x".repeat(81), steps: [filterStep] })?.message).toBe(
      "Name must be at most 80 characters",
    );
    expect(createFlowSchema.safeParse({ name: "abc", steps: [filterStep] }).success).toBe(true);
    expect(createFlowSchema.safeParse({ name: "x".repeat(80), steps: [filterStep] }).success).toBe(true);
  });

  test("needs between one and five steps", () => {
    expect(firstIssue({ name: "Valid", steps: [] })?.message).toBe("Add at least one step");
    expect(firstIssue({ name: "Valid", steps: Array(6).fill(filterStep) })?.message).toBe(
      "A flow can have at most 5 steps",
    );
  });

  test("rejects unknown keys such as a client-chosen webhookSecret", () => {
    expect(createFlowSchema.safeParse({ name: "Valid", steps: [filterStep], webhookSecret: "x" }).success).toBe(false);
  });

  test("stores an empty description as null", () => {
    expect(createFlowSchema.parse({ name: "Valid", description: "  ", steps: [filterStep] }).description).toBeNull();
  });
});

describe("stepSchema", () => {
  test("gt and lt need a numeric value, reported on the value field", () => {
    const result = stepSchema.safeParse({ ...filterStep, value: "1000" });
    expect(result.success).toBe(false);
    if (!result.success) expect(toValidationIssues(result.error)[0]?.path).toBe("value");
  });

  test("contains and eq accept strings", () => {
    expect(stepSchema.safeParse({ ...filterStep, operator: "contains", value: "abc" }).success).toBe(true);
    expect(stepSchema.safeParse({ ...filterStep, operator: "eq", value: null }).success).toBe(true);
  });

  test("rejects bad dot paths and reserved names", () => {
    expect(stepSchema.safeParse({ ...filterStep, field: "order..amount" }).success).toBe(false);
    expect(stepSchema.safeParse({ ...filterStep, field: "order.__proto__" }).success).toBe(false);
    expect(stepSchema.safeParse({ type: "transform", mapping: { ["__proto__"]: "a" } }).success).toBe(false);
  });

  test("transform needs at least one mapping field", () => {
    expect(stepSchema.safeParse({ type: "transform", mapping: {} }).success).toBe(false);
  });

  test("http_request allows only http(s) URLs and POST or PUT", () => {
    const ok = { type: "http_request", url: "https://example.com/hook", method: "PUT" };
    expect(stepSchema.safeParse(ok).success).toBe(true);
    expect(stepSchema.safeParse({ ...ok, url: "ftp://example.com" }).success).toBe(false);
    expect(stepSchema.safeParse({ ...ok, method: "GET" }).success).toBe(false);
  });
});

describe("updateFlowSchema", () => {
  test("accepts a partial update without adding defaults", () => {
    expect(updateFlowSchema.parse({ name: "Renamed" })).toEqual({ name: "Renamed" });
  });

  test("rejects an empty update", () => {
    expect(firstIssue({}, updateFlowSchema)?.message).toBe("Nothing to update");
  });
});

describe("runListQuerySchema", () => {
  test("defaults the limit to 20 and clamps it to 100", () => {
    expect(runListQuerySchema.parse({}).limit).toBe(20);
    expect(runListQuerySchema.parse({ limit: "500" }).limit).toBe(100);
    expect(runListQuerySchema.parse({ limit: "5" }).limit).toBe(5);
  });

  test("rejects a bad limit or status", () => {
    expect(runListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(runListQuerySchema.safeParse({ limit: "abc" }).success).toBe(false);
    expect(runListQuerySchema.safeParse({ status: "done" }).success).toBe(false);
  });
});

describe("toValidationIssues", () => {
  test("gives the real reason for a bad mapping key, not Zod's generic record message", () => {
    const result = stepSchema.safeParse({ type: "transform", mapping: { constructor: "order.id" } });
    if (result.success) throw new Error("expected validation to fail");
    expect(toValidationIssues(result.error)).toEqual([
      { path: "mapping.constructor", message: "This name is reserved" },
    ]);
  });
});
