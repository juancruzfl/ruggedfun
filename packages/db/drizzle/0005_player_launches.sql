ALTER TABLE "tokens" ADD COLUMN "creator_user_id" uuid;--> statement-breakpoint
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tokens_creator_user_idx" ON "tokens" USING btree ("creator_user_id","created_at" DESC NULLS LAST);