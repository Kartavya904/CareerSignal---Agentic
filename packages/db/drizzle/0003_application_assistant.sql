CREATE TABLE IF NOT EXISTS "application_assistant_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"job_summary" jsonb,
	"match_score" integer,
	"match_grade" varchar(8),
	"match_breakdown" jsonb,
	"resume_suggestions" jsonb,
	"cover_letters" jsonb,
	"contacts" jsonb,
	"keywords_to_add" jsonb,
	"salary_level_check" text,
	"application_checklist" jsonb,
	"interview_prep_bullets" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "application_assistant_analyses" ADD CONSTRAINT "application_assistant_analyses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
