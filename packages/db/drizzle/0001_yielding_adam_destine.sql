DO $$ BEGIN
 CREATE TYPE "employment_type" AS ENUM('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'UNKNOWN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "remote_preference" AS ENUM('REMOTE', 'HYBRID', 'ONSITE', 'ANY');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "run_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "seniority" AS ENUM('INTERN', 'ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'STAFF', 'PRINCIPAL', 'DIRECTOR', 'VP', 'C_LEVEL', 'UNKNOWN');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "source_status" AS ENUM('ACTIVE', 'BROKEN', 'VALIDATING', 'DISABLED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "source_type" AS ENUM('COMPANY', 'AGGREGATOR', 'COMMUNITY', 'CUSTOM');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "strict_filter_level" AS ENUM('STRICT', 'SEMI_STRICT', 'OFF');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "work_authorization" AS ENUM('US_CITIZEN', 'GREEN_CARD', 'H1B', 'OPT', 'EAD', 'OTHER');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"source_id" uuid,
	"user_id" uuid NOT NULL,
	"title" varchar(512) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"source_url" text NOT NULL,
	"location" varchar(255),
	"remote_type" varchar(32),
	"seniority" "seniority",
	"employment_type" "employment_type",
	"visa_sponsorship" varchar(16),
	"description" text,
	"requirements" jsonb,
	"posted_date" date,
	"salary_min" numeric(12, 2),
	"salary_max" numeric(12, 2),
	"salary_currency" varchar(8),
	"department" varchar(255),
	"team" varchar(255),
	"apply_url" text,
	"raw_extract" jsonb,
	"evidence_refs" jsonb,
	"confidence" numeric(3, 2),
	"dedupe_key" varchar(64),
	"match_score" numeric(5, 2),
	"score_breakdown" jsonb,
	"score_explanation" text,
	"strict_filter_pass" boolean,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(64),
	"location" varchar(255) NOT NULL,
	"work_authorization" "work_authorization" NOT NULL,
	"seniority" "seniority",
	"target_roles" jsonb DEFAULT '[]'::jsonb,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"highlighted_skills" jsonb DEFAULT '[]'::jsonb,
	"suggested_skills" jsonb DEFAULT '[]'::jsonb,
	"experience" jsonb DEFAULT '[]'::jsonb,
	"education" jsonb DEFAULT '[]'::jsonb,
	"projects" jsonb DEFAULT '[]'::jsonb,
	"certifications" jsonb DEFAULT '[]'::jsonb,
	"industries" jsonb DEFAULT '[]'::jsonb,
	"languages" jsonb DEFAULT '[]'::jsonb,
	"salary_range" jsonb,
	"employment_type" jsonb DEFAULT '[]'::jsonb,
	"remote_preference" "remote_preference",
	"linkedin_url" varchar(512),
	"github_url" varchar(512),
	"portfolio_url" varchar(512),
	"resume_raw_text" text,
	"resume_file_ref" varchar(512),
	"resume_parsed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"source_ids" jsonb DEFAULT '[]'::jsonb,
	"events" jsonb,
	"error_message" text,
	"plan_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"url" text NOT NULL,
	"type" "source_type" DEFAULT 'CUSTOM' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_blessed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"last_scanned_at" timestamp,
	"last_validated_at" timestamp,
	"status" "source_status" DEFAULT 'ACTIVE' NOT NULL,
	"corrected_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_authorization" "work_authorization" NOT NULL,
	"target_locations" jsonb DEFAULT '[]'::jsonb,
	"remote_preference" "remote_preference" DEFAULT 'ANY' NOT NULL,
	"target_seniority" jsonb DEFAULT '[]'::jsonb,
	"target_roles" jsonb DEFAULT '[]'::jsonb,
	"skills" jsonb DEFAULT '[]'::jsonb,
	"industries" jsonb DEFAULT '[]'::jsonb,
	"employment_types" jsonb DEFAULT '[]'::jsonb,
	"salary_min" numeric(12, 2),
	"salary_max" numeric(12, 2),
	"salary_currency" varchar(8),
	"strict_filter_level" "strict_filter_level" DEFAULT 'STRICT' NOT NULL,
	"max_contacts_per_job" integer DEFAULT 2 NOT NULL,
	"outreach_tone" varchar(64) DEFAULT 'PROFESSIONAL_CONCISE',
	"synced_from_profile_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_profile_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"total_years_experience" integer DEFAULT 0 NOT NULL,
	"seniority" varchar(32) DEFAULT 'Unknown' NOT NULL,
	"keyword_depth" integer DEFAULT 0 NOT NULL,
	"strength_score" integer DEFAULT 0 NOT NULL,
	"overall_score" integer DEFAULT 0 NOT NULL,
	"resume_rating" text,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_insights_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"password_hash" text,
	"name" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sources" ADD CONSTRAINT "sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_profile_insights" ADD CONSTRAINT "user_profile_insights_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
