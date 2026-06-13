CREATE TABLE "shopping_session_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"needed_qty" numeric(10, 3) NOT NULL,
	"estimated_unit_price_cents" integer,
	"estimated_price_store_id" uuid,
	"checked_at" timestamp with time zone,
	"actual_qty" numeric(10, 3),
	"actual_unit_price_cents" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "shopping_session_items_session_item_uq" UNIQUE("session_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "shopping_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"list_id" uuid,
	"store_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_session_items" ADD CONSTRAINT "shopping_session_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_session_items" ADD CONSTRAINT "shopping_session_items_session_id_shopping_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."shopping_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_session_items" ADD CONSTRAINT "shopping_session_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_list_id_shopping_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."shopping_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_sessions" ADD CONSTRAINT "shopping_sessions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopping_session_items_household_version_idx" ON "shopping_session_items" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "shopping_session_items_session_idx" ON "shopping_session_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "shopping_sessions_household_version_idx" ON "shopping_sessions" USING btree ("household_id","server_version");