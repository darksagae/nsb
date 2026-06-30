-- Sales user account control fields
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "password_enc" TEXT;
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);
