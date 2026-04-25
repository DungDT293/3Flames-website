ALTER TABLE "audit_logs" ALTER COLUMN "actor_id" DROP NOT NULL;

ALTER TABLE "services" ADD COLUMN "is_margin_override" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "orders" ADD COLUMN "cost" DECIMAL(16,6) NOT NULL DEFAULT 0;

UPDATE "orders" AS o
SET "cost" = ROUND(((s."original_price" / 1000) * o."quantity")::numeric, 6)
FROM "services" AS s
WHERE o."service_id" = s."id";

CREATE TABLE "admin_settings" (
  "key" VARCHAR(100) NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "admin_settings" ("key", "value")
VALUES ('pricing.defaultProfitMargin', '10')
ON CONFLICT ("key") DO NOTHING;
