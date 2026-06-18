CREATE TABLE "item_brands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_barcodes" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "price_records" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "shopping_session_items" ADD COLUMN "actual_brand_id" uuid;--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_brands" ADD CONSTRAINT "item_brands_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_brands_household_version_idx" ON "item_brands" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "item_brands_item_idx" ON "item_brands" USING btree ("item_id");--> statement-breakpoint
ALTER TABLE "item_barcodes" ADD CONSTRAINT "item_barcodes_brand_id_item_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."item_brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_brand_id_item_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."item_brands"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_session_items" ADD CONSTRAINT "shopping_session_items_actual_brand_id_item_brands_id_fk" FOREIGN KEY ("actual_brand_id") REFERENCES "public"."item_brands"("id") ON DELETE set null ON UPDATE no action;