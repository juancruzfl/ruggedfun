import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export * from "./schema";
export { schema };

export function createDb(url: string) {
  const client = postgres(url, { max: 10 });
  return { db: drizzle(client, { schema }), client };
}

export type Db = ReturnType<typeof createDb>["db"];
export type SqlClient = ReturnType<typeof createDb>["client"];
export type TokenRow = typeof schema.tokens.$inferSelect;
