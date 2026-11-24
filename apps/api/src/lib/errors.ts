import type { ApiErrorBody, ErrorCode, ErrorDetails } from "@flowlet/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * An error that maps directly to an HTTP response in the shared error shape.
 * Throw it from any route; the app's onError handler turns it into JSON.
 */
export class ApiError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorBody(code: ErrorCode, message: string, details: ErrorDetails = {}): ApiErrorBody {
  return { error: { code, message, details } };
}

export const notFound = (what: string): ApiError => new ApiError(404, "NOT_FOUND", `${what} not found`);
