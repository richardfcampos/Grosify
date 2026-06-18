ALTER TABLE "shopping_lists" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD COLUMN "recurrence" text;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD COLUMN "recurrence_day" integer;--> statement-breakpoint
UPDATE "shopping_lists" SET "recurrence" = 'monthly' WHERE "is_recurring" = true AND "recurrence" IS NULL;