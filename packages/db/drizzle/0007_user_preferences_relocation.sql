ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "willing_to_relocate" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_preferences"
  ADD COLUMN IF NOT EXISTS "has_car" boolean DEFAULT false NOT NULL;

