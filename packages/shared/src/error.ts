import type { z } from "zod";

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "INVALID_JSON",
  "INVALID_SIGNATURE",
  "NOT_FOUND",
  "FLOW_DISABLED",
  "DUPLICATE_EVENT",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** One validation problem. `path` is a dot path such as `steps.0.value`. */
export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ErrorDetails {
  issues?: ValidationIssue[];
  [key: string]: unknown;
}

/** The one error shape every endpoint returns. */
export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details: ErrorDetails;
  };
}

/** Turns Zod issues into `{ path, message }` pairs. Used by the API and by the web form. */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    // A bad record key only says "Invalid key in record"; the real reason
    // (for example "This name is reserved") is in the nested key issue.
    message: issue.code === "invalid_key" ? (issue.issues[0]?.message ?? issue.message) : issue.message,
  }));
}
