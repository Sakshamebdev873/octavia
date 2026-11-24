import type { HttpRequestStep, JsonValue } from "@flowlet/shared";

export const HTTP_TIMEOUT_MS = 5000;
export const MAX_RESPONSE_BODY_BYTES = 2048;

export interface HttpRequestOptions {
  /** Injectable for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

// A type alias (not an interface) so it is assignable to JsonValue and can be stored as step output.
export type HttpStepOutput = {
  status: number;
  /** The first 2 KB of the response body. */
  body: string;
};

export interface HttpStepResult {
  ok: boolean;
  /** null when no response arrived (network error or timeout). */
  output: HttpStepOutput | null;
  error: string | null;
}

/**
 * Sends the current data as JSON. A network error, a timeout or a non-2xx
 * response fails the step. Redirects are not followed: a 3xx is a non-2xx
 * response, and following it could send the data somewhere the user never configured.
 */
export async function executeHttpRequest(
  step: HttpRequestStep,
  data: JsonValue,
  { fetch: fetchFn = fetch, timeoutMs = HTTP_TIMEOUT_MS }: HttpRequestOptions = {},
): Promise<HttpStepResult> {
  // One signal for the whole exchange: connecting, waiting and reading the body.
  const signal = AbortSignal.timeout(timeoutMs);

  try {
    const response = await fetchFn(step.url, {
      method: step.method,
      headers: { "Content-Type": "application/json", "User-Agent": "Flowlet/1.0" },
      body: JSON.stringify(data),
      redirect: "manual",
      signal,
    });
    const output: HttpStepOutput = { status: response.status, body: await readBodyPrefix(response) };
    if (response.ok) return { ok: true, output, error: null };
    return { ok: false, output, error: `HTTP ${response.status}` };
  } catch (error) {
    if (signal.aborted) return { ok: false, output: null, error: `Timed out after ${timeoutMs} ms` };
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, output: null, error: `Network error: ${message}` };
  }
}

/**
 * Reads at most MAX_RESPONSE_BODY_BYTES from the body stream, then cancels it.
 * Memory stays bounded even if the target sends megabytes.
 */
async function readBodyPrefix(response: Response): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_RESPONSE_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const bytes = Buffer.concat(chunks).subarray(0, MAX_RESPONSE_BODY_BYTES);
  // stream: true drops a multi-byte character cut in half at the 2 KB boundary
  // instead of turning it into a replacement character.
  return new TextDecoder().decode(bytes, { stream: true });
}
