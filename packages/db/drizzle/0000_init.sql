CREATE TYPE "public"."fate" AS ENUM('rug', 'slow_death', 'survive', 'moon');--> statement-breakpoint
CREATE TYPE "public"."token_status" AS ENUM('live', 'graduated', 'rugged', 'dead');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('buy', 'sell');--> statement-breakpoint
CREATE TABLE "candles" (
	"token_id" uuid NOT NULL,
	"interval" smallint NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision DEFAULT 0 NOT NULL,
	CONSTRAINT "candles_token_id_interval_ts_pk" PRIMARY KEY("token_id","interval","ts")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"user_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"token_amount" double precision NOT NULL,
	"cost_basis_sol" double precision NOT NULL,
	CONSTRAINT "positions_user_id_token_id_pk" PRIMARY KEY("user_id","token_id")
);
--> statement-breakpoint
CREATE TABLE "tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ticker" text NOT NULL,
	"image_url" text NOT NULL,
	"description" text NOT NULL,
	"creator_handle" text NOT NULL,
	"seed" text NOT NULL,
	"fate" "fate" NOT NULL,
	"status" "token_status" DEFAULT 'live' NOT NULL,
	"virtual_sol" double precision NOT NULL,
	"virtual_tokens" double precision NOT NULL,
	"tokens_left" double precision NOT NULL,
	"price" double precision NOT NULL,
	"ath_price" double precision NOT NULL,
	"market_cap" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"graduated_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "tokens_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_id" uuid NOT NULL,
	"user_id" uuid,
	"bot_handle" text,
	"side" "trade_side" NOT NULL,
	"sol_amount" double precision NOT NULL,
	"token_amount" double precision NOT NULL,
	"price" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"session_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"sol_balance" double precision NOT NULL,
	"last_faucet_at" timestamp with time zone,
	CONSTRAINT "wallets_address_unique" UNIQUE("address")
);
--> statement-breakpoint
ALTER TABLE "candles" ADD CONSTRAINT "candles_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tokens_status_created_idx" ON "tokens" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tokens_market_cap_idx" ON "tokens" USING btree ("market_cap" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tokens_ended_idx" ON "tokens" USING btree ("ended_at");--> statement-breakpoint
CREATE INDEX "trades_created_idx" ON "trades" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trades_token_created_idx" ON "trades" USING btree ("token_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "trades_user_created_idx" ON "trades" USING btree ("user_id","created_at" DESC NULLS LAST);