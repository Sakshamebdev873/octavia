import type {
  ApiErrorBody,
  CreateFlowRequest,
  ErrorCode,
  Flow,
  FlowStats,
  FlowSummary,
  Run,
  RunPage,
  RunStatus,
  TriggerResponse,
  UpdateFlowRequest,
  ValidationIssue,
} from "@flowlet/shared";

/** Where the browser reaches the Flowlet API. Set in the root .env. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

export type ClientErrorCode = ErrorCode | "NETWORK_ERROR" | "BAD_RESPONSE";

/** Any failed API call. Carries the server's error code and validation issues. */
export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: ClientErrorCode,
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const error = value.error;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  );
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal | undefined;
}

async function send(path: string, { method = "GET", body, headers = {}, signal }: RequestOptions = {}): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      body,
      signal,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
    });
  } catch (error) {
    if (signal?.aborted) throw error; // a cancelled request is not an error to show
    throw new ApiClientError(0, "NETWORK_ERROR", `Cannot reach the API at ${API_URL}. Is the backend running?`);
  }

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    if (isApiErrorBody(errorBody)) {
      const { code, message, details } = errorBody.error;
      throw new ApiClientError(response.status, code, message, details.issues ?? []);
    }
    throw new ApiClientError(response.status, "BAD_RESPONSE", `Unexpected response (HTTP ${response.status})`);
  }
  return response;
}

async function json<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await send(path, options);
  // Responses come from our own API, whose types are shared through
  // @flowlet/shared, so we trust their shape here instead of re-validating.
  return (await response.json()) as T;
}

const flowPath = (id: string) => `/api/flows/${encodeURIComponent(id)}`;

export interface RunListParams {
  status?: RunStatus | undefined;
  limit?: number;
  cursor?: string | null;
}

export const api = {
  flows: {
    list: (signal?: AbortSignal) => json<FlowSummary[]>("/api/flows", { signal }),
    get: (id: string, signal?: AbortSignal) => json<Flow>(flowPath(id), { signal }),
    create: (body: CreateFlowRequest) => json<Flow>("/api/flows", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateFlowRequest) =>
      json<Flow>(flowPath(id), { method: "PATCH", body: JSON.stringify(body) }),
    remove: async (id: string): Promise<void> => {
      await send(flowPath(id), { method: "DELETE" });
    },
    stats: (id: string, signal?: AbortSignal) => json<FlowStats>(`${flowPath(id)}/stats`, { signal }),
    runs: (id: string, { status, limit, cursor }: RunListParams, signal?: AbortSignal) => {
      const query = new URLSearchParams();
      if (status) query.set("status", status);
      if (limit) query.set("limit", String(limit));
      if (cursor) query.set("cursor", cursor);
      return json<RunPage>(`${flowPath(id)}/runs?${query.toString()}`, { signal });
    },
  },
  runs: {
    get: (id: string, signal?: AbortSignal) => json<Run>(`/api/runs/${encodeURIComponent(id)}`, { signal }),
  },
  hooks: {
    /** Sends the raw text exactly as given, so the signature matches the bytes sent. */
    trigger: (flowId: string, rawBody: string, signatureHex: string) =>
      json<TriggerResponse>(`/api/hooks/${encodeURIComponent(flowId)}`, {
        method: "POST",
        body: rawBody,
        headers: { "X-Flowlet-Signature": `sha256=${signatureHex}` },
      }),
  },
};

export const webhookUrl = (flowId: string) => `${API_URL}/api/hooks/${flowId}`;
