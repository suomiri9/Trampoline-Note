CREATE TABLE IF NOT EXISTS "whoop_tokens" (
  "user_id" varchar PRIMARY KEY,
  "access_token" text NOT NULL,
  "refresh_token" text,
  "expires_at" timestamp NOT NULL,
  "scope" text,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
