-- Drop all old unique constraints/indexes on username before migration
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_key";
DROP INDEX IF EXISTS "users_username_key";
