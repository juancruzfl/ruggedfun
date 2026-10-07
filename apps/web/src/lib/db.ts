import "server-only";
import { createDb } from "@ruggedfun/db";

if (!process.env.DATABASE_URL) throw new Error("Missing env var DATABASE_URL (see .env.example)");

// Reuse one pool across dev hot reloads.
const cache = globalThis as unknown as { ruggedfunDb?: ReturnType<typeof createDb> };
export const { db } = (cache.ruggedfunDb ??= createDb(process.env.DATABASE_URL));
