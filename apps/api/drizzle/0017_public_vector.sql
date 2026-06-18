CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_id" text,
	"actor_name" text,
	"action" text NOT NULL,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"author_id" text,
	"author_name" text,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"server_version" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shopping_list_entries" ADD COLUMN "assigned_to" text;--> statement-breakpoint
ALTER TABLE "shopping_list_entries" ADD COLUMN "assigned_to_name" text;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_comments" ADD CONSTRAINT "item_comments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_comments" ADD CONSTRAINT "item_comments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_household_idx" ON "activities" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "item_comments_household_version_idx" ON "item_comments" USING btree ("household_id","server_version");--> statement-breakpoint
CREATE INDEX "item_comments_item_idx" ON "item_comments" USING btree ("item_id");--> statement-breakpoint
CREATE TRIGGER item_comments_server_version
  BEFORE INSERT OR UPDATE ON item_comments
  FOR EACH ROW EXECUTE FUNCTION assign_server_version();
