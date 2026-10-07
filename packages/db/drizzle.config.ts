import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

try {
  process.loadEnvFile(resolve(process.cwd(), "../../.env"));
} catch {
  // No .env file: rely on the real environment.
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
