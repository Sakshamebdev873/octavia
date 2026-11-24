import type { FinalRunStatus, JsonValue, Step, StepStatus, StepType } from "@flowlet/shared";
import { evaluateFilter } from "./filter";
import { executeHttpRequest, type HttpRequestOptions } from "./http-request";
import { applyTransform } from "./transform";

/** The record of one step, as stored in run_steps. */
export interface StepOutcome {
  position: number;
  type: StepType;
  status: StepStatus;
  input: JsonValue | null;
  output: JsonValue | null;
  error: string | null;
  durationMs: number;
}

export interface RunResult {
  status: FinalRunStatus;
  /** Set only when status is failed. */
  error: string | null;
  steps: StepOutcome[];
}

export interface RunnerOptions {
  http?: HttpRequestOptions;
}

/** What one step did, before it is turned into a StepOutcome. */
interface StepExecution {
  status: "success" | "failed";
  output: JsonValue | null;
  error: string | null;
  /** The data for the next step. */
  data: JsonValue;
  /** Set when this step ends the run. */
  stop?: "filtered" | "failed";
}

async function executeStep(step: Step, data: JsonValue, options: RunnerOptions): Promise<StepExecution> {
  switch (step.type) {
    case "filter": {
      const result = evaluateFilter(step, data);
      return {
        status: "success",
        output: { passed: result.passed, actual: result.actual },
        error: null,
        data,
        ...(result.passed ? {} : { stop: "filtered" as const }),
      };
    }
    case "transform": {
      const next = applyTransform(step, data);
      return { status: "success", output: next, error: null, data: next };
    }
    case "http_request": {
      const result = await executeHttpRequest(step, data, options.http);
      // The data passes through unchanged: the response is stored as output only.
      return result.ok
        ? { status: "success", output: result.output, error: null, data }
        : { status: "failed", output: result.output, error: result.error, data, stop: "failed" };
    }
    default: {
      const unhandled: never = step;
      throw new Error(`Unknown step type: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * Runs the steps in order. A filter that does not match ends the run as
 * `filtered`; a failing step ends it as `failed`. Either way every remaining
 * step is recorded as `skipped`.
 */
export async function runSteps(steps: Step[], payload: JsonValue, options: RunnerOptions = {}): Promise<RunResult> {
  const outcomes: StepOutcome[] = [];
  let data = payload;
  let status: FinalRunStatus = "success";
  let error: string | null = null;

  for (const [index, step] of steps.entries()) {
    const position = index + 1;

    if (status !== "success") {
      outcomes.push({ position, type: step.type, status: "skipped", input: null, output: null, error: null, durationMs: 0 });
      continue;
    }

    const startedAt = performance.now();
    let execution: StepExecution;
    try {
      execution = await executeStep(step, data, options);
    } catch (thrown) {
      // A bug in a step must not crash the request: record it as a failed step.
      const message = thrown instanceof Error ? thrown.message : String(thrown);
      execution = { status: "failed", output: null, error: message, data, stop: "failed" };
    }

    outcomes.push({
      position,
      type: step.type,
      status: execution.status,
      input: data,
      output: execution.output,
      error: execution.error,
      durationMs: Math.round(performance.now() - startedAt),
    });

    data = execution.data;
    if (execution.stop) {
      status = execution.stop;
      if (execution.stop === "failed") error = `Step ${position} (${step.type}): ${execution.error ?? "failed"}`;
    }
  }

  return { status, error, steps: outcomes };
}
