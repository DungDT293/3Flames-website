ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(20);

-- Drop old case-sensitive unique constraint before creating case-insensitive index
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_key";

-- Resolve any case-insensitive username duplicates by appending suffix to all but the oldest
UPDATE "users" u
SET "username" = concat(lower(u."username"), '_', left(replace(u."id"::text, '-', ''), 8))
WHERE u."id" IN (
  SELECT id FROM (
    SELECT
      "id",
      row_number() OVER (PARTITION BY lower("username") ORDER BY "created_at", "id") AS rn
    FROM "users"
  ) ranked
  WHERE rn > 1
);

-- Lowercase all remaining usernames (those that are unique case-insensitively)
UPDATE "users"
SET "username" = lower("username")
WHERE lower("username") <> "username";

CREATE UNIQUE INDEX IF NOT EXISTS "users_username_lower_key" ON "users" (lower("username"));
CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_key" ON "users"("phone");
CREATE INDEX IF NOT EXISTS "users_phone_idx" ON "users"("phone");
