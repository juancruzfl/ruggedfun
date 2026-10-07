CREATE TABLE "net_worth_snapshots" (
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"net_worth_sol" double precision NOT NULL,
	CONSTRAINT "net_worth_snapshots_user_id_at_pk" PRIMARY KEY("user_id","at")
);
--> statement-breakpoint
CREATE TABLE "rug_victims" (
	"user_id" uuid NOT NULL,
	"token_id" uuid NOT NULL,
	"token_amount" double precision NOT NULL,
	"cost_basis_sol" double precision NOT NULL,
	"rugged_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rug_victims_user_id_token_id_pk" PRIMARY KEY("user_id","token_id")
);
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "realized_pnl_sol" double precision;--> statement-breakpoint
ALTER TABLE "net_worth_snapshots" ADD CONSTRAINT "net_worth_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rug_victims" ADD CONSTRAINT "rug_victims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rug_victims" ADD CONSTRAINT "rug_victims_token_id_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "net_worth_snapshots_at_idx" ON "net_worth_snapshots" USING btree ("at");