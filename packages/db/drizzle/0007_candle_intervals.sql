ALTER TABLE "candles" ALTER COLUMN "interval" SET DATA TYPE integer;--> statement-breakpoint
-- Backfill 5m and 1d candles from the stored 1m candles, so charts for existing tokens have history.
INSERT INTO "candles" ("token_id", "interval", "ts", "open", "high", "low", "close", "volume")
SELECT "token_id", b.secs, to_timestamp(floor(extract(epoch FROM "ts") / b.secs) * b.secs),
       (array_agg("open" ORDER BY "ts"))[1], max("high"), min("low"),
       (array_agg("close" ORDER BY "ts" DESC))[1], sum("volume")
FROM "candles" CROSS JOIN (VALUES (300), (86400)) AS b(secs)
WHERE "interval" = 60
GROUP BY "token_id", b.secs, floor(extract(epoch FROM "ts") / b.secs)
ON CONFLICT DO NOTHING;
