import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/get-current-user';
import { InvoiceForm } from '@/components/admin/invoices/InvoiceForm';
import { InvoiceStatusBadge } from '@/components/admin/invoices/InvoiceStatusBadge';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';
import { invoicePdfViewPath } from '@/lib/invoice-pdf-url';

export const dynamic = 'force-dynamic';

export default async function EditInvoicePage({ params }: { params: { id: string } }) {
  await requirePageUser();
  const id = Number(params.id);
  if (isNaN(id)) notFound();

  const [invoice, vehicles] = await Promise.all([
    prisma.invoice.findFirst({
      where: { id },
      include: { vehicle: { include: { brand: true } } },
    }),
    prisma.vehicle.findMany({ include: { brand: true }, orderBy: { id: 'desc' } }),
  ]);

  if (!invoice) notFound();

  const defaultValues: Record<string, unknown> = {
    ...invoice,
    paymentDueDate: invoice.paymentDueDate ? (invoice.paymentDueDate as Date).toISOString().slice(0, 10) : '',
  };

  return (
    <div>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-5 pb-3 border-bottom border-secondary-subtle flex-wrap">
        <div>
          <Link
            href="/admin/invoices"
            className="text-muted small text-decoration-none d-inline-flex align-items-center gap-1 leon-section-label mb-2"
          >
            <LeonIcon name="arrow-left" size={14} />
            Back to Invoices
          </Link>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <h1 className="h3 fw-bold mb-0 tracking-tighter text-dark d-flex align-items-center gap-2 leon-heading">
              <LeonIcon name="file-text" size={22} className="leon-icon-accent" />
              {invoice.invoiceNumber}
            </h1>
            <InvoiceStatusBadge status={invoice.status} />
          </div>
        </div>
        {invoice.pdfUrl && (
          <a
            href={invoicePdfViewPath(invoice.id)}
            target="_blank"
            rel="noreferrer"
            className="btn btn-outline-dark btn-sm rounded-pill leon-section-label mb-0"
          >
            <LeonIcon name="file-text" size={14} className="me-1" />
            View PDF
          </a>
        )}
      </div>

      <InvoiceForm vehicles={vehicles} defaultValues={defaultValues} invoiceId={id} mode="edit" />
    </div>
  );
}
