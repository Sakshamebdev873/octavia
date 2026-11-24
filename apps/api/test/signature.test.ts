import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { sign, verifySignature } from "../src/modules/webhooks/signature";

const body = '{"event":"order.created","order":{"id":"ORD-1042","amount":4999}}';
const secret = "test-secret";
// Computed independently with: printf '%s' "$BODY" | openssl dgst -sha256 -hmac "test-secret"
const OPENSSL_DIGEST = "9055dc54f625d0be6aecfb101a26ec983c0b13cbf0aa90cb5d8c39d4022e7996";

describe("signature", () => {
  test("matches openssl and node:crypto", () => {
    expect(sign(body, secret)).toBe(OPENSSL_DIGEST);
    expect(sign(body, secret)).toBe(createHmac("sha256", secret).update(body).digest("hex"));
  });

  test("accepts a valid signature, also over raw bytes and in upper case", () => {
    expect(verifySignature(body, `sha256=${OPENSSL_DIGEST}`, secret)).toBe(true);
    expect(verifySignature(new TextEncoder().encode(body), `sha256=${OPENSSL_DIGEST}`, secret)).toBe(true);
    expect(verifySignature(body, `sha256=${OPENSSL_DIGEST.toUpperCase()}`, secret)).toBe(true);
  });

  test("rejects a missing or empty header", () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
    expect(verifySignature(body, "", secret)).toBe(false);
  });

  test("rejects a wrong digest, secret or body", () => {
    const flipped = `${OPENSSL_DIGEST.slice(0, -1)}${OPENSSL_DIGEST.endsWith("6") ? "7" : "6"}`;
    expect(verifySignature(body, `sha256=${flipped}`, secret)).toBe(false);
    expect(verifySignature(body, `sha256=${OPENSSL_DIGEST}`, "other-secret")).toBe(false);
    expect(verifySignature(`${body} `, `sha256=${OPENSSL_DIGEST}`, secret)).toBe(false);
  });

  test("rejects malformed headers without throwing", () => {
    for (const header of [OPENSSL_DIGEST, `sha1=${OPENSSL_DIGEST}`, "sha256=", "sha256=abc", `sha256=${"z".repeat(64)}`]) {
      expect(verifySignature(body, header, secret)).toBe(false);
    }
  });
});
