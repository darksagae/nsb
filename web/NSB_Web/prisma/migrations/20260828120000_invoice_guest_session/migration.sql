-- AlterTable
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "guest_session_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invoices_guest_session_id_idx" ON "invoices"("guest_session_id");
