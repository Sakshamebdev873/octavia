import { describe, expect, test } from "bun:test";
import { issuesToErrors, newKey, validateDraft, type FlowDraft } from "../src/lib/flow-draft";

function transformDraft(rows: { output: string; path: string }[]): FlowDraft {
  return {
    name: "Test flow",
    description: "",
    enabled: true,
    steps: [{ key: newKey(), type: "transform", rows: rows.map((row) => ({ key: newKey(), ...row })) }],
  };
}

describe("validateDraft: transform mapping errors", () => {
  test("a bad source path is reported once, next to its input", () => {
    const { request, errors } = validateDraft(transformDraft([{ output: "orderId", path: "order..id" }]));
    expect(request).toBeNull();
    expect(errors).toEqual({ "steps.0.rows.0.path": "Use a dot path such as order.amount" });
  });

  test("a reserved output field is reported next to the output input, with the reason", () => {
    const { errors } = validateDraft(transformDraft([{ output: "constructor", path: "order.id" }]));
    expect(errors).toEqual({ "steps.0.rows.0.output": "This name is reserved" });
  });

  test("an output field over 100 characters is reported next to the output input", () => {
    const { errors } = validateDraft(transformDraft([{ output: "k".repeat(101), path: "order.id" }]));
    expect(errors).toEqual({ "steps.0.rows.0.output": "Output field must be at most 100 characters" });
  });

  test("an empty mapping is still reported for the mapping as a whole", () => {
    const { errors } = validateDraft(transformDraft([]));
    expect(errors).toEqual({ "steps.0.mapping": "Add at least one field" });
  });

  test("server issues about a mapping entry land on the matching row", () => {
    const draft = transformDraft([
      { output: "orderId", path: "order.id" },
      { output: "total", path: "order.amount" },
    ]);
    const errors = issuesToErrors([{ path: "steps.0.mapping.total", message: "Use a dot path such as order.amount" }], draft);
    expect(errors).toEqual({ "steps.0.rows.1.path": "Use a dot path such as order.amount" });
  });
});
