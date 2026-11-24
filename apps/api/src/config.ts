import { z } from "zod";

/**
 * Environment, parsed once at startup. Defaults match .env.example so the API
 * also starts without a .env file. A bad value stops the process with a clear message.
 */
const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1).default("postgres://flowlet:flowlet@localhost:5432/flowlet"),
  MONGO_URL: z.string().min(1).default("mongodb://localhost:27017"),
  MONGO_DB: z.string().min(1).default("flowlet"),
  WEB_ORIGIN: z.string().min(1).default("http://localhost:3000"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${problems.join("\n")}`);
  }
  return result.data;
}
