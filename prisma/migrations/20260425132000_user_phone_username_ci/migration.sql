ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(20);

WITH ranked_users AS (
  SELECT
    "id",
    lower("username") AS normalized_username,
    row_number() OVER (PARTITION BY lower("username") ORDER BY "created_at", "id") AS duplicate_rank
  FROM "users"
)
UPDATE "users" u
SET "username" = CASE
  WHEN r.duplicate_rank = 1 THEN r.normalized_username
  ELSE concat(r.normalized_username, '_', left(replace(u."id"::text, '-', ''), 8))
END
FROM ranked_users r
WHERE u."id" = r."id"
  AND u."username" <> CASE
    WHEN r.duplicate_rank = 1 THEN r.normalized_username
    ELSE concat(r.normalized_username, '_', left(replace(u."id"::text, '-', ''), 8))
  END;

CREATE UNIQUE INDEX "users_username_lower_key" ON "users" (lower("username"));
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "users_phone_idx" ON "users"("phone");
