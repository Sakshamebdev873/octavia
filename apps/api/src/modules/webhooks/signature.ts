import { timingSafeEqual } from "node:crypto";

/** `sha256=` followed by exactly 64 hex characters (a SHA-256 digest). */
const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i;

export const SIGNATURE_HEADER = "X-Flowlet-Signature";

/** Hex HMAC-SHA256 of the raw body bytes, keyed by the flow's webhook secret. */
export function sign(rawBody: Uint8Array | string, secret: string): string {
  return new Bun.CryptoHasher("sha256", secret).update(rawBody).digest("hex");
}

/**
 * Checks an X-Flowlet-Signature header against the raw request body.
 *
 * - The HMAC is computed over the exact bytes received. Parsing and
 *   re-serialising the JSON would change whitespace or key order and break it.
 * - The comparison is constant time (timingSafeEqual). `===` stops at the first
 *   different character, and that timing difference can leak the signature.
 * - Bad input never throws: a missing or malformed header is simply invalid.
 */
export function verifySignature(rawBody: Uint8Array | string, header: string | undefined, secret: string): boolean {
  const hex = header ? SIGNATURE_PATTERN.exec(header.trim())?.[1] : undefined;
  if (!hex) return false;

  const expected = Buffer.from(sign(rawBody, secret), "hex");
  const received = Buffer.from(hex, "hex");
  // Both are 32 bytes thanks to the pattern; the length check keeps timingSafeEqual from throwing.
  return expected.length === received.length && timingSafeEqual(expected, received);
}
