CREATE TABLE "inventory_counts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty_on_hand" numeric(10, 3) DEFAULT '0' NOT NULL,
	"counted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "inventory_counts_household_item_uq" UNIQUE("household_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "price_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"price_cents" integer NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_list_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"list_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"qty" numeric(10, 3) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "shopping_list_entries_list_item_uq" UNIQUE("list_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_records" ADD CONSTRAINT "price_records_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_entries" ADD CONSTRAINT "shopping_list_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_entries" ADD CONSTRAINT "shopping_list_entries_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_entries" ADD CONSTRAINT "shopping_list_entries_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_counts_household_version_idx" ON "inventory_counts" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "price_records_household_version_idx" ON "price_records" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "price_records_lookup_idx" ON "price_records" USING btree ("household_id","item_id","store_id","recorded_at");--> statement-breakpoint
CREATE INDEX "shopping_list_entries_household_version_idx" ON "shopping_list_entries" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "shopping_list_entries_list_idx" ON "shopping_list_entries" USING btree ("list_id");--> statement-breakpoint
CREATE INDEX "shopping_lists_household_version_idx" ON "shopping_lists" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "shopping_lists_household_idx" ON "shopping_lists" USING btree ("household_id");