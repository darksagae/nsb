-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "pdf_source" TEXT;

-- Legacy web-generated PDFs must not be served as machine originals.
UPDATE "invoices" SET "pdf_url" = NULL, "pdf_generated_at" = NULL WHERE "pdf_source" IS NULL AND "pdf_url" IS NOT NULL;
