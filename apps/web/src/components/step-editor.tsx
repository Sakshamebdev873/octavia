"use client";

import { FILTER_OPERATORS, filterOperatorSchema, HTTP_METHODS, STEP_TYPES, stepTypeSchema, type FilterOperator } from "@flowlet/shared";
import { describedBy, Field, FieldError } from "@/components/field";
import { newMappingRow, newStep, type FieldErrors, type StepDraft, type ValueType } from "@/lib/flow-draft";
import { STEP_TYPE_LABELS } from "@/lib/format";

const OPERATOR_TEXT: Record<FilterOperator, string> = {
  eq: "equals (eq)",
  neq: "does not equal (neq)",
  gt: "greater than (gt)",
  lt: "less than (lt)",
  contains: "contains",
};

const VALUE_TYPES: { value: ValueType; label: string }[] = [
  { value: "string", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "True / false" },
  { value: "null", label: "Null" },
];

interface StepEditorProps {
  step: StepDraft;
  index: number;
  count: number;
  errors: FieldErrors;
  onChange: (step: StepDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}

export function StepEditor({ step, index, count, errors, onChange, onMove, onRemove }: StepEditorProps) {
  const id = (field: string) => `step-${step.key}-${field}`;
  const error = (field: string) => errors[`steps.${index}.${field}`];
  const position = index + 1;

  return (
    <li className="card step-card">
      <fieldset>
        <div className="step-card-header">
          <legend>
            Step {position}: {STEP_TYPE_LABELS[step.type]}
          </legend>
          <div className="actions">
            <button
              type="button"
              className="button button-small"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              aria-label={`Move step ${position} up`}
            >
              ↑ Up
            </button>
            <button
              type="button"
              className="button button-small"
              onClick={() => onMove(1)}
              disabled={index === count - 1}
              aria-label={`Move step ${position} down`}
            >
              ↓ Down
            </button>
            <button
              type="button"
              className="button button-small button-danger"
              onClick={onRemove}
              disabled={count === 1}
              aria-label={`Remove step ${position}`}
            >
              Remove
            </button>
          </div>
        </div>

        <Field id={id("type")} label="Step type" error={error("type")}>
          <select
            {...describedBy(id("type"), error("type"))}
            value={step.type}
            onChange={(e) => onChange({ ...newStep(stepTypeSchema.parse(e.target.value)), key: step.key })}
          >
            {STEP_TYPES.map((type) => (
              <option key={type} value={type}>
                {STEP_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Field>

        {step.type === "filter" && (
          <>
            <Field
              id={id("field")}
              label="Field"
              error={error("field")}
              hint="Dot path into the current data, for example order.amount"
            >
              <input
                type="text"
                {...describedBy(id("field"), error("field"))}
                value={step.field}
                placeholder="order.amount"
                onChange={(e) => onChange({ ...step, field: e.target.value })}
              />
            </Field>
            <div className="grid-3">
              <Field id={id("operator")} label="Operator" error={error("operator")}>
                <select
                  {...describedBy(id("operator"), error("operator"))}
                  value={step.operator}
                  onChange={(e) => {
                    const operator = filterOperatorSchema.parse(e.target.value);
                    // gt and lt only compare numbers, so switch the value type for the user.
                    const valueType = operator === "gt" || operator === "lt" ? "number" : step.valueType;
                    onChange({ ...step, operator, valueType });
                  }}
                >
                  {FILTER_OPERATORS.map((operator) => (
                    <option key={operator} value={operator}>
                      {OPERATOR_TEXT[operator]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id={id("valueType")} label="Value type">
                <select
                  id={id("valueType")}
                  value={step.valueType}
                  onChange={(e) => {
                    const valueType = VALUE_TYPES.find((option) => option.value === e.target.value)?.value ?? "string";
                    onChange({ ...step, valueType, value: valueType === "boolean" ? "true" : step.value });
                  }}
                >
                  {VALUE_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              {step.valueType === "boolean" ? (
                <Field id={id("value")} label="Value" error={error("value")}>
                  <select
                    {...describedBy(id("value"), error("value"))}
                    value={step.value}
                    onChange={(e) => onChange({ ...step, value: e.target.value })}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </Field>
              ) : step.valueType === "null" ? (
                <div className="field">
                  <span className="label">Value</span>
                  <span className="muted">null (matches a missing field)</span>
                  <FieldError id={id("value")} error={error("value")} />
                </div>
              ) : (
                <Field id={id("value")} label="Value" error={error("value")}>
                  <input
                    type="text"
                    inputMode={step.valueType === "number" ? "decimal" : "text"}
                    {...describedBy(id("value"), error("value"))}
                    value={step.value}
                    placeholder={step.valueType === "number" ? "1000" : "text"}
                    onChange={(e) => onChange({ ...step, value: e.target.value })}
                  />
                </Field>
              )}
            </div>
          </>
        )}

        {step.type === "transform" && (
          <div>
            <p className="label">Mapping</p>
            <p className="hint">Each output field takes its value from a dot path. A missing path gives null.</p>
            {step.rows.map((row, rowIndex) => {
              const outputId = id(`row-${row.key}-output`);
              const pathId = id(`row-${row.key}-path`);
              const outputError = error(`rows.${rowIndex}.output`);
              const pathError = error(`rows.${rowIndex}.path`);
              const updateRow = (patch: Partial<typeof row>) =>
                onChange({ ...step, rows: step.rows.map((r) => (r.key === row.key ? { ...r, ...patch } : r)) });
              return (
                <div key={row.key} className="mapping-row">
                  <Field id={outputId} label={`Output field ${rowIndex + 1}`} error={outputError}>
                    <input
                      type="text"
                      {...describedBy(outputId, outputError)}
                      value={row.output}
                      placeholder="orderId"
                      onChange={(e) => updateRow({ output: e.target.value })}
                    />
                  </Field>
                  <Field id={pathId} label={`Source path ${rowIndex + 1}`} error={pathError}>
                    <input
                      type="text"
                      {...describedBy(pathId, pathError)}
                      value={row.path}
                      placeholder="order.id"
                      onChange={(e) => updateRow({ path: e.target.value })}
                    />
                  </Field>
                  <button
                    type="button"
                    className="button button-small"
                    onClick={() => onChange({ ...step, rows: step.rows.filter((r) => r.key !== row.key) })}
                    aria-label={`Remove mapping field ${rowIndex + 1}`}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
            <MappingErrors errors={errors} prefix={`steps.${index}.mapping`} id={id("mapping")} />
            <button
              type="button"
              className="button button-small"
              onClick={() => onChange({ ...step, rows: [...step.rows, newMappingRow()] })}
            >
              + Add field
            </button>
          </div>
        )}

        {step.type === "http_request" && (
          <div className="grid-2">
            <Field id={id("url")} label="URL" error={error("url")} hint="The current data is sent as JSON">
              <input
                type="url"
                {...describedBy(id("url"), error("url"))}
                value={step.url}
                placeholder="https://example.com/webhook"
                onChange={(e) => onChange({ ...step, url: e.target.value })}
              />
            </Field>
            <Field id={id("method")} label="Method" error={error("method")}>
              <select
                {...describedBy(id("method"), error("method"))}
                value={step.method}
                onChange={(e) => onChange({ ...step, method: e.target.value === "PUT" ? "PUT" : "POST" })}
              >
                {HTTP_METHODS.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </fieldset>
    </li>
  );
}

/** Errors about the mapping as a whole (from the schema or the server). */
function MappingErrors({ errors, prefix, id }: { errors: FieldErrors; prefix: string; id: string }) {
  const messages = Object.entries(errors)
    .filter(([path]) => path === prefix || path.startsWith(`${prefix}.`))
    .map(([path, message]) => (path === prefix ? message : `${path.slice(prefix.length + 1)}: ${message}`));
  if (messages.length === 0) return null;
  return (
    <div id={`${id}-error`} className="field-error" role="alert">
      {messages.map((message) => (
        <p key={message} className="field-error">
          {message}
        </p>
      ))}
    </div>
  );
}
