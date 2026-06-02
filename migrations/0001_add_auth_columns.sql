ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password" varchar;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "display_name" varchar;
