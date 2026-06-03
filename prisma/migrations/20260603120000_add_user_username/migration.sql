-- AlterTable: add username column
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" TEXT;

-- Backfill existing accounts
UPDATE "users"
SET "username" = '@abdallah_zagh'
WHERE email = 'f2002.a.z@gmail.com' AND ("username" IS NULL OR "username" = '');

UPDATE "users"
SET "username" = '@user_' || REPLACE(SUBSTRING(id::text, 1, 8), '-', '')
WHERE "username" IS NULL;

-- Enforce required + unique
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_username_key" ON "users"("username");
