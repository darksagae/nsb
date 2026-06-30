-- Bind each sales user to one desktop machine (device id).
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "assigned_machine_id" TEXT;
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "assigned_machine_name" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sales_users_assigned_machine_id_key" ON "sales_users"("assigned_machine_id");
