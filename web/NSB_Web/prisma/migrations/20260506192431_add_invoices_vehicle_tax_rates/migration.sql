-- Tables already exist in production; this migration ensures indexes and constraints are present.

CREATE TABLE IF NOT EXISTS "invoices" (
    "id" SERIAL NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "vehicle_id" INTEGER,
    "consignee_name" TEXT NOT NULL,
    "consignee_address" TEXT,
    "consignee_city" TEXT,
    "consignee_country" TEXT,
    "consignee_phone" TEXT,
    "consignee_email" TEXT,
    "notify_party" TEXT DEFAULT 'SAME AS CONSIGNEE',
    "port_from" TEXT,
    "port_to" TEXT,
    "final_destination" TEXT,
    "bl_issue_at" TEXT,
    "prepaid_at" TEXT,
    "shipping_mark" TEXT,
    "chassis_no" TEXT,
    "ref_no" TEXT,
    "vehicle_make" TEXT,
    "vehicle_model" TEXT,
    "vehicle_year" INTEGER,
    "vehicle_color" TEXT,
    "vehicle_mileage" INTEGER,
    "vehicle_transmission" TEXT,
    "vehicle_drive_type" TEXT,
    "vehicle_doors" INTEGER,
    "vehicle_passengers" INTEGER,
    "vehicle_fuel_type" TEXT,
    "vehicle_steering" TEXT,
    "vehicle_engine_cc" INTEGER,
    "vehicle_weight_kg" DOUBLE PRECISION,
    "vehicle_dimension" TEXT,
    "vehicle_inspection" TEXT DEFAULT 'With Pre-ship Inspection',
    "cf_mombasa_usd" DOUBLE PRECISION,
    "clearance_fee_usd" DOUBLE PRECISION,
    "tt_charges_usd" DOUBLE PRECISION,
    "exchange_rate" DOUBLE PRECISION,
    "first_installment_ugx" DOUBLE PRECISION,
    "cf_price_usd" DOUBLE PRECISION,
    "quantity_units" INTEGER NOT NULL DEFAULT 1,
    "payment_terms" TEXT,
    "payment_due_date" TIMESTAMP(3),
    "taxes_ura" DOUBLE PRECISION,
    "number_plates_fee" DOUBLE PRECISION DEFAULT 714300,
    "third_party_insurance" DOUBLE PRECISION,
    "agency_fees" DOUBLE PRECISION,
    "import_duty_ugx" DOUBLE PRECISION,
    "excise_duty_ugx" DOUBLE PRECISION,
    "vat_ugx" DOUBLE PRECISION,
    "infrastructure_levy" DOUBLE PRECISION,
    "environmental_levy" DOUBLE PRECISION,
    "withholding_tax" DOUBLE PRECISION,
    "registration_fee" DOUBLE PRECISION,
    "total_tax_ugx" DOUBLE PRECISION,
    "second_installment_ugx" DOUBLE PRECISION,
    "grand_total_ugx" DOUBLE PRECISION,
    "pdf_url" TEXT,
    "pdf_generated_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "vehicle_tax_rates" (
    "id" SERIAL NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "model_code" TEXT,
    "body_type" TEXT,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "engine_size_cc" INTEGER,
    "fuel_type" TEXT,
    "fob_value" DOUBLE PRECISION,
    "customs_value" DOUBLE PRECISION,
    "import_duty" DOUBLE PRECISION,
    "excise_duty" DOUBLE PRECISION,
    "vat" DOUBLE PRECISION,
    "infrastructure_levy" DOUBLE PRECISION,
    "environmental_levy" DOUBLE PRECISION,
    "withholding_tax" DOUBLE PRECISION,
    "registration_fee" DOUBLE PRECISION,
    "total_tax_ugx" DOUBLE PRECISION,
    "database_month" TEXT NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "vehicle_tax_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "invoices_invoice_number_key" ON "invoices"("invoice_number");

CREATE INDEX IF NOT EXISTS "vehicle_tax_rates_make_model_idx" ON "vehicle_tax_rates"("make", "model");

CREATE INDEX IF NOT EXISTS "vehicle_tax_rates_database_month_idx" ON "vehicle_tax_rates"("database_month");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'invoices_vehicle_id_fkey'
    AND table_name = 'invoices'
  ) THEN
    ALTER TABLE "invoices" ADD CONSTRAINT "invoices_vehicle_id_fkey"
      FOREIGN KEY ("vehicle_id") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
