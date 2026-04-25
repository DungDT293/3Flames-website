ALTER TABLE "users" ADD COLUMN "is_email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "otp_code" VARCHAR(6);
ALTER TABLE "users" ADD COLUMN "otp_expires_at" TIMESTAMP(3);

UPDATE "users" SET "is_email_verified" = true WHERE "role" IN ('SUPER_ADMIN', 'ADMIN', 'SUPPORT');
