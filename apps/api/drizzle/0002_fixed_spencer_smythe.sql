CREATE TABLE "item_barcodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"barcode" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "item_barcodes_household_barcode_uq" UNIQUE("household_id","barcode")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"photo_key" text,
	"unit" text DEFAULT 'un' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"neighborhood" text,
	"lat" double precision,
	"lng" double precision,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_barcodes" ADD CONSTRAINT "item_barcodes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_barcodes" ADD CONSTRAINT "item_barcodes_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "item_barcodes_household_version_idx" ON "item_barcodes" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "item_barcodes_item_idx" ON "item_barcodes" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "items_household_version_idx" ON "items" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "items_household_idx" ON "items" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "stores_household_version_idx" ON "stores" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "stores_household_idx" ON "stores" USING btree ("household_id");