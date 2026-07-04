ALTER TABLE "household_invites" ADD COLUMN "token" text;--> statement-breakpoint
ALTER TABLE "household_invites" ADD COLUMN "invited_email" text;--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_token_unique" UNIQUE("token");