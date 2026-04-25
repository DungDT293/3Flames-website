DROP INDEX IF EXISTS "users_api_key_idx";
ALTER TABLE "users" DROP COLUMN IF EXISTS "api_key";
