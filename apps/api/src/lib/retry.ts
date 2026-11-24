/**
 * Retries an async operation until it succeeds or the attempts run out.
 * Used to wait for databases that were just started by `docker compose up -d`.
 */
export async function retry<T>(
  label: string,
  operation: () => Promise<T>,
  { attempts = 30, delayMs = 1000 }: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        if (attempt === 1) console.log(`Waiting for ${label}...`);
        await Bun.sleep(delayMs);
      }
    }
  }
  throw new Error(`${label} is not reachable after ${attempts} attempts`, { cause: lastError });
}
