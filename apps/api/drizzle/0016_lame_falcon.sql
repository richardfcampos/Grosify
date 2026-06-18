ALTER TABLE "price_records" ADD COLUMN "rating" integer;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD COLUMN "budget_cents" integer;--> statement-breakpoint
ALTER TABLE "shopping_sessions" ADD COLUMN "receipt_key" text;