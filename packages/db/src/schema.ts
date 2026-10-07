import {
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Money is play money, so doubles are fine and keep the math simple.

export const fateEnum = pgEnum("fate", ["rug", "slow_death", "survive", "moon"]);
export const tokenStatusEnum = pgEnum("token_status", ["live", "graduated", "rugged", "dead"]);
export const tradeSideEnum = pgEnum("trade_side", ["buy", "sell"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    /** sha256 of the session token in the user's cookie. */
    sessionHash: text("session_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // "Degen" and "degen" are the same name.
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`)],
);

export const wallets = pgTable("wallets", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull().unique(),
  solBalance: doublePrecision("sol_balance").notNull(),
  lastFaucetAt: timestamp("last_faucet_at", { withTimezone: true }),
});

export const tokens = pgTable(
  "tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    ticker: text("ticker").notNull().unique(),
    imageUrl: text("image_url").notNull(),
    description: text("description").notNull(),
    creatorHandle: text("creator_handle").notNull(),
    // Server-only: never select these into anything sent to clients.
    seed: text("seed").notNull(),
    fate: fateEnum("fate").notNull(),

    status: tokenStatusEnum("status").notNull().default("live"),
    virtualSol: doublePrecision("virtual_sol").notNull(),
    virtualTokens: doublePrecision("virtual_tokens").notNull(),
    tokensLeft: doublePrecision("tokens_left").notNull(),
    price: doublePrecision("price").notNull(),
    athPrice: doublePrecision("ath_price").notNull(),
    marketCap: doublePrecision("market_cap").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    graduatedAt: timestamp("graduated_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (t) => [
    index("tokens_status_created_idx").on(t.status, t.createdAt.desc()),
    index("tokens_market_cap_idx").on(t.marketCap.desc()),
    index("tokens_ended_idx").on(t.endedAt),
    // Trigram indexes for ILIKE '%q%' search (needs the pg_trgm extension, migration 0002).
    index("tokens_ticker_trgm_idx").using("gin", t.ticker.op("gin_trgm_ops")),
    index("tokens_name_trgm_idx").using("gin", t.name.op("gin_trgm_ops")),
  ],
);

export const candles = pgTable(
  "candles",
  {
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    /** Seconds per candle. */
    interval: smallint("interval").notNull(),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    open: doublePrecision("open").notNull(),
    high: doublePrecision("high").notNull(),
    low: doublePrecision("low").notNull(),
    close: doublePrecision("close").notNull(),
    volume: doublePrecision("volume").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tokenId, t.interval, t.ts] })],
);

export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    /** Null for bot trades. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    botHandle: text("bot_handle"),
    side: tradeSideEnum("side").notNull(),
    solAmount: doublePrecision("sol_amount").notNull(),
    tokenAmount: doublePrecision("token_amount").notNull(),
    price: doublePrecision("price").notNull(),
    /** Player sells only: proceeds minus the cost basis of the tokens sold. */
    realizedPnlSol: doublePrecision("realized_pnl_sol"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trades_created_idx").on(t.createdAt.desc()),
    index("trades_token_created_idx").on(t.tokenId, t.createdAt.desc()),
    index("trades_user_created_idx").on(t.userId, t.createdAt.desc()),
  ],
);

export const positions = pgTable(
  "positions",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    tokenAmount: doublePrecision("token_amount").notNull(),
    costBasisSol: doublePrecision("cost_basis_sol").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tokenId] })],
);

/** Players holding a token at the moment it rugged, for the wall of shame. */
export const rugVictims = pgTable(
  "rug_victims",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => tokens.id, { onDelete: "cascade" }),
    tokenAmount: doublePrecision("token_amount").notNull(),
    costBasisSol: doublePrecision("cost_basis_sol").notNull(),
    ruggedAt: timestamp("rugged_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tokenId] })],
);

/** Net worth (SOL + positions at the last stored price), sampled every few minutes for 24h PnL. */
export const netWorthSnapshots = pgTable(
  "net_worth_snapshots",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    at: timestamp("at", { withTimezone: true }).notNull(),
    netWorthSol: doublePrecision("net_worth_sol").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.at] }), index("net_worth_snapshots_at_idx").on(t.at)],
);
