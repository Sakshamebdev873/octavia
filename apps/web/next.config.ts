import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

// One .env for the whole repository: load the root file so the web app sees
// NEXT_PUBLIC_API_URL without a second env file in apps/web.
// Next always runs with apps/web as the working directory.
loadEnvConfig(path.resolve(process.cwd(), "../.."));

const nextConfig: NextConfig = {
  // The shared package ships TypeScript source, so Next must compile it.
  transpilePackages: ["@flowlet/shared"],
  // Do not write an AGENTS.md into the repository on every `next dev`.
  agentRules: false,
};

export default nextConfig;
