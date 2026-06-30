ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "machine_locked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "lock_message" TEXT;
ALTER TABLE "sales_users" ADD COLUMN IF NOT EXISTS "banned_until" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "admin_commands" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "command" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    CONSTRAINT "admin_commands_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "admin_commands_user_id_status_idx" ON "admin_commands"("user_id", "status");

DO $$ BEGIN
  ALTER TABLE "admin_commands" ADD CONSTRAINT "admin_commands_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "sales_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
