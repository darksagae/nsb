-- AlterTable
ALTER TABLE "sales_users"
  ADD COLUMN "security_question" TEXT,
  ADD COLUMN "security_answer_hash" TEXT,
  ADD COLUMN "security_failed_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "security_locked_until" TIMESTAMP(3);
