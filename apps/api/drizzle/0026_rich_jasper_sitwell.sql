CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text,
	"external_customer_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"cycle" text NOT NULL,
	"currency" text NOT NULL,
	"price_cents" integer NOT NULL,
	"next_due_date" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"overdue_since" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_provider_event_uq" UNIQUE("provider","event_id")
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "plan_override" text;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_household_idx" ON "subscriptions" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_active_household_uq" ON "subscriptions" USING btree ("household_id") WHERE "subscriptions"."status" <> 'canceled';