ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "desktop_last_seen_at" TIMESTAMP(3);
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "web_last_seen_at" TIMESTAMP(3);
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "last_machine_name" TEXT;
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "last_ip" TEXT;
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "last_app_version" TEXT;
