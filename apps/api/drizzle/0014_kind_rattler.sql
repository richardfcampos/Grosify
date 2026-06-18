CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_household_version_idx" ON "categories" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "categories_household_idx" ON "categories" USING btree ("household_id");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER categories_server_version
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();--> statement-breakpoint
INSERT INTO categories (id, household_id, name, sort_order, is_hidden, updated_at, server_version)
SELECT gen_random_uuid(), household_id, category,
       (row_number() OVER (PARTITION BY household_id ORDER BY category)) - 1,
       false, now(), 0
FROM (SELECT DISTINCT household_id, category FROM items WHERE category IS NOT NULL AND deleted_at IS NULL) d;--> statement-breakpoint
UPDATE items i SET category_id = c.id
FROM categories c
WHERE c.household_id = i.household_id AND c.name = i.category AND i.category_id IS NULL;