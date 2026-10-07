import { resolve } from "node:path";
import type { NextConfig } from "next";

const repoRoot = resolve(process.cwd(), "../..");

try {
  process.loadEnvFile(resolve(repoRoot, ".env"));
} catch {
  // No root .env: rely on the real environment.
}

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@ruggedfun/db", "@ruggedfun/shared", "@ruggedfun/sim"],
  turbopack: { root: repoRoot },
};

export default nextConfig;
