import {
  createFlowSchema,
  dotPathSchema,
  toValidationIssues,
  type CreateFlowRequest,
  type FilterOperator,
  type FilterValue,
  type Flow,
  type Step,
  type StepType,
  type ValidationIssue,
} from "@flowlet/shared";
import { API_URL } from "./api";

/**
 * The form works on "drafts": plain strings that map one-to-one to inputs.
 * validateDraft turns a draft into the API request, using the same Zod
 * schema as the server, and collects errors keyed by field path.
 */

export type ValueType = "string" | "number" | "boolean" | "null";

export interface MappingRow {
  key: string;
  output: string;
  path: string;
}

export type StepDraft =
  | { key: string; type: "filter"; field: string; operator: FilterOperator; valueType: ValueType; value: string }
  | { key: string; type: "transform"; rows: MappingRow[] }
  | { key: string; type: "http_request"; url: string; method: "POST" | "PUT" };

export interface FlowDraft {
  name: string;
  description: string;
  enabled: boolean;
  steps: StepDraft[];
}

/** Error message per field path, for example "name" or "steps.1.value". */
export type FieldErrors = Record<string, string>;

// React keys for list items. A counter (not crypto.randomUUID) works outside secure contexts too.
let sequence = 0;
export const newKey = (): string => `k${++sequence}`;

export const newMappingRow = (): MappingRow => ({ key: newKey(), output: "", path: "" });

export function newStep(type: StepType): StepDraft {
  switch (type) {
    case "filter":
      return { key: newKey(), type, field: "", operator: "eq", valueType: "string", value: "" };
    case "transform":
      return { key: newKey(), type, rows: [newMappingRow()] };
    case "http_request":
      return { key: newKey(), type, url: `${API_URL}/api/mock/receiver`, method: "POST" };
  }
}

export const emptyDraft = (): FlowDraft => ({ name: "", description: "", enabled: true, steps: [newStep("filter")] });

function valueTypeOf(value: FilterValue): ValueType {
  if (value === null) return "null";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

function stepToDraft(step: Step): StepDraft {
  switch (step.type) {
    case "filter":
      return {
        key: newKey(),
        type: "filter",
        field: step.field,
        operator: step.operator,
        valueType: valueTypeOf(step.value),
        value: step.value === null ? "" : String(step.value),
      };
    case "transform":
      return {
        key: newKey(),
        type: "transform",
        rows: Object.entries(step.mapping).map(([output, path]) => ({ key: newKey(), output, path })),
      };
    case "http_request":
      return { key: newKey(), type: "http_request", url: step.url, method: step.method };
  }
}

export function flowToDraft(flow: Flow): FlowDraft {
  return {
    name: flow.name,
    description: flow.description ?? "",
    enabled: flow.enabled,
    steps: flow.steps.map(stepToDraft),
  };
}

function toStepInput(step: StepDraft, index: number, errors: FieldErrors): Step {
  const at = (field: string) => `steps.${index}.${field}`;

  switch (step.type) {
    case "filter": {
      let value: FilterValue;
      switch (step.valueType) {
        case "number":
          value = step.value.trim() === "" ? Number.NaN : Number(step.value);
          if (!Number.isFinite(value)) errors[at("value")] = "Enter a number";
          break;
        case "boolean":
          value = step.value === "true";
          break;
        case "null":
          value = null;
          break;
        case "string":
          value = step.value;
          break;
      }
      return { type: "filter", field: step.field, operator: step.operator, value };
    }
    case "transform": {
      const seen = new Set<string>();
      step.rows.forEach((row, rowIndex) => {
        const output = row.output.trim();
        if (!output) errors[at(`rows.${rowIndex}.output`)] = "Output field is required";
        else if (seen.has(output)) errors[at(`rows.${rowIndex}.output`)] = "Each output field must be unique";
        seen.add(output);
        const path = dotPathSchema.safeParse(row.path);
        if (!path.success) errors[at(`rows.${rowIndex}.path`)] = path.error.issues[0]?.message ?? "Invalid path";
      });
      // Object.fromEntries: an output field named "__proto__" becomes a key, not the prototype.
      const mapping = Object.fromEntries(
        step.rows.filter((row) => row.output.trim()).map((row) => [row.output.trim(), row.path.trim()]),
      );
      return { type: "transform", mapping };
    }
    case "http_request":
      return { type: "http_request", url: step.url.trim(), method: step.method };
  }
}

export function issuesToErrors(issues: ValidationIssue[], into: FieldErrors = {}): FieldErrors {
  for (const issue of issues) into[issue.path] ??= issue.message;
  return into;
}

/** Validates the draft with the shared schema. Returns the request, or the errors per field. */
export function validateDraft(draft: FlowDraft): { request: CreateFlowRequest | null; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const request: CreateFlowRequest = {
    name: draft.name,
    description: draft.description,
    enabled: draft.enabled,
    steps: draft.steps.map((step, index) => toStepInput(step, index, errors)),
  };
  const result = createFlowSchema.safeParse(request);
  if (!result.success) issuesToErrors(toValidationIssues(result.error), errors);
  return Object.keys(errors).length > 0 ? { request: null, errors } : { request, errors };
}
