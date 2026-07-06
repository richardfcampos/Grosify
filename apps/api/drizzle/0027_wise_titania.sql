CREATE TABLE "nfce_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"uf" text NOT NULL,
	"store_cnpj" text,
	"store_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"item_count" integer DEFAULT 0 NOT NULL,
	"raw_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nfce_imports_household_chave_uq" UNIQUE("household_id","chave")
);
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "embedding" jsonb;--> statement-breakpoint
ALTER TABLE "stores" ADD COLUMN "cnpj" text;--> statement-breakpoint
ALTER TABLE "nfce_imports" ADD CONSTRAINT "nfce_imports_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "nfce_imports_household_created_idx" ON "nfce_imports" USING btree ("household_id","created_at");