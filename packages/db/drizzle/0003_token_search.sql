CREATE INDEX "tokens_ticker_trgm_idx" ON "tokens" USING gin ("ticker" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "tokens_name_trgm_idx" ON "tokens" USING gin ("name" gin_trgm_ops);