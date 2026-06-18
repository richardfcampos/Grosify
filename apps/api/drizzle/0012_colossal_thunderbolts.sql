ALTER TABLE "item_brands" ADD COLUMN "is_preferred" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "notes" text;