/**
 * HMAC-SHA256 of the body with the flow's secret, as hex, using the browser's
 * WebCrypto. Same result as `openssl dgst -sha256 -hmac "$SECRET"`.
 * WebCrypto exists only in secure contexts: https, or http on localhost.
 */
export async function signBody(body: string, secret: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Signing needs a secure context. Open the app on localhost or over https.");
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
