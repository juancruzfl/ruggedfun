import "server-only";
import { createDb, type Db } from "@ruggedfun/db";

// Reuse one pool across dev hot reloads.
const cache = globalThis as unknown as { ruggedfunDb?: ReturnType<typeof createDb> };

function connect(): Db {
  if (!process.env.DATABASE_URL) throw new Error("Missing env var DATABASE_URL (see .env.example)");
  return (cache.ruggedfunDb ??= createDb(process.env.DATABASE_URL)).db;
}

/**
 * Connects on first use, not at import: `next build` loads every route module and must work
 * without a database.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = connect();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
