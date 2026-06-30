import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/get-current-user';
import { InvoiceStats } from '@/components/admin/invoices/InvoiceStats';
import { InvoiceTable } from '@/components/admin/invoices/InvoiceTable';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoices | Admin' };

export default async function AdminInvoicesPage() {
  const user = await requirePageUser();
  let invoices: Awaited<ReturnType<typeof prisma.invoice.findMany>> = [];
  let counts = { total: 0, draft: 0, sent: 0, pending: 0, paid: 0, overdue: 0 };

  try {
    invoices = await prisma.invoice.findMany({
      where: { userId: user.id },
      include: { vehicle: { include: { brand: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const all = invoices as Array<{ status: string }>;
    counts = {
      total: all.length,
      draft: all.filter((i) => i.status === 'draft').length,
      sent: all.filter((i) => i.status === 'sent').length,
      pending: all.filter((i) => i.status === 'pending').length,
      paid: all.filter((i) => i.status === 'paid').length,
      overdue: all.filter((i) => i.status === 'overdue').length,
    };
  } catch (e) {
    console.error('Invoices page DB error:', e);
  }

  const stats = [
    { label: 'Total', value: counts.total, icon: 'receipt' as const },
    { label: 'Draft', value: counts.draft, icon: 'file-text' as const },
    { label: 'Pending', value: counts.pending, icon: 'hourglass' as const },
    { label: 'Paid', value: counts.paid, icon: 'circle-check' as const },
    { label: 'Overdue', value: counts.overdue, icon: 'alert-triangle' as const },
  ];

  const serialized = invoices.map((inv) => ({
    ...inv,
    createdAt: (inv.createdAt as Date).toISOString(),
    updatedAt: (inv.updatedAt as Date).toISOString(),
    paymentDueDate: inv.paymentDueDate ? (inv.paymentDueDate as Date).toISOString() : null,
    pdfGeneratedAt: inv.pdfGeneratedAt ? (inv.pdfGeneratedAt as Date).toISOString() : null,
  }));

  return (
    <>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-5 pb-3 border-bottom border-secondary-subtle">
        <div>
          <h1 className="h3 fw-bold mb-1 tracking-tighter text-dark d-flex align-items-center gap-2 leon-heading">
            <LeonIcon name="receipt" size={22} className="leon-icon-accent" />
            Invoices
          </h1>
          <p className="text-muted small mb-0">
            Manage issued invoices, generate PDFs, and track payment status.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Link
            href="/admin/mv-database"
            className="btn btn-light border rounded-pill px-3 py-2 d-inline-flex align-items-center gap-2 leon-section-label mb-0"
          >
            <LeonIcon name="database" size={14} />
            MV Database
          </Link>
          <Link
            href="/admin/invoices/new"
            className="btn btn-dark rounded-pill px-4 py-2 d-inline-flex align-items-center gap-3 leon-section-label mb-0 shadow-sm"
          >
            <span>Create Invoice</span>
            <span className="leon-btn-pill__icon">
              <LeonIcon name="plus" size={10} className="text-white" />
            </span>
          </Link>
        </div>
      </div>

      <InvoiceStats stats={stats} />

      <div className="leon-bezel-outer">
        <div className="leon-bezel-inner">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2 leon-heading">
              <LeonIcon name="list" size={17} className="text-secondary" />
              Invoice Registry
            </h2>
            <span className="badge bg-light text-dark border leon-section-label rounded-pill py-1.5 px-3 mb-0">
              <span className="leon-num" data-leon-num="true">{counts.total}</span> records
            </span>
          </div>
          <InvoiceTable invoices={serialized as Parameters<typeof InvoiceTable>[0]['invoices']} />
        </div>
      </div>
    </>
  );
}
