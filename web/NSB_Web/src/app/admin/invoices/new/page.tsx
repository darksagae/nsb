import { prisma } from '@/lib/db';
import { InvoiceForm } from '@/components/admin/invoices/InvoiceForm';
import Link from 'next/link';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New Invoice | Admin' };

export default async function NewInvoicePage() {
  const vehicles = await prisma.vehicle.findMany({
    where: { status: { not: 'sold' } },
    include: { brand: true },
    orderBy: { id: 'desc' },
  });

  return (
    <div>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-5 pb-3 border-bottom border-secondary-subtle">
        <div>
          <Link
            href="/admin/invoices"
            className="text-muted small text-decoration-none d-inline-flex align-items-center gap-1 leon-section-label mb-2"
          >
            <LeonIcon name="arrow-left" size={14} />
            Back to Invoices
          </Link>
          <h1 className="h3 fw-bold mb-1 tracking-tighter text-dark d-flex align-items-center gap-2 leon-heading">
            <LeonIcon name="file-plus" size={22} className="leon-icon-accent" />
            New Invoice
          </h1>
          <p className="text-muted small mb-0">
            Create a new invoice — search URA MV database, enter customer and vehicle details, and calculate taxes.
          </p>
        </div>
      </div>

      <InvoiceForm vehicles={vehicles} mode="create" />
    </div>
  );
}
