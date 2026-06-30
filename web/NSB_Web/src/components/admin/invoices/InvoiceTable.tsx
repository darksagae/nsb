'use client';

import { useState } from 'react';
import Link from 'next/link';
import { InvoiceStatusBadge } from './InvoiceStatusBadge';
import { InvoiceDeleteButton } from './InvoiceDeleteButton';
import { useRouter } from 'next/navigation';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';
import { invoicePdfViewPath } from '@/lib/invoice-pdf-url';

type Invoice = {
  id: number;
  invoiceNumber: string;
  status: string;
  consigneeName: string;
  consigneeEmail?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  cfPriceUsd?: number | null;
  grandTotalUgx?: number | null;
  pdfUrl?: string | null;
  pdfSource?: string | null;
  createdAt: string;
};

const STATUSES = ['All', 'draft', 'sent', 'pending', 'paid', 'overdue', 'cancelled'];

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

export function InvoiceTable({ invoices }: { invoices: Invoice[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState('All');
  const [emailing, setEmailing] = useState<number | null>(null);

  async function sendEmail(id: number, consigneeEmail: string | null | undefined) {
    if (!consigneeEmail?.trim()) {
      alert('Cannot send invoice: Customer email is missing. Please edit the invoice to add an email address in the Consignee section.');
      return;
    }

    setEmailing(id);
    try {
      const res = await fetch(`/api/invoices/${id}/pdf`, { method: 'POST' });
      if (res.ok) {
        alert(`Invoice successfully sent to ${consigneeEmail}!`);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to send email');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to send email');
    } finally {
      setEmailing(null);
    }
  }

  const visible = filter === 'All' ? invoices : invoices.filter((i) => i.status === filter);

  async function viewPdf(id: number, hasPdf: boolean) {
    if (!hasPdf) {
      alert('PDF not yet uploaded from the sales machine. Finalize the invoice on the desktop to sync the original PDF.');
      return;
    }
    window.open(invoicePdfViewPath(id), '_blank');
  }

  return (
    <div>
      <div className="inv-filter-tabs">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`inv-filter-tab font-mono${filter === s ? ' active' : ''}`}
            onClick={() => setFilter(s)}
          >
            {s === 'All' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            {s !== 'All' && (
              <span className="leon-num" style={{ marginLeft: 4, opacity: 0.65 }} data-leon-num="true">
                ({invoices.filter((i) => i.status === s).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-5 text-muted font-mono text-[12px]">
          <LeonIcon name="receipt" size={40} className="text-secondary opacity-50 mb-2 d-block" />
          No invoices found.{' '}
          <Link href="/admin/invoices/new" className="fw-semibold" style={{ color: 'var(--admin-accent)' }}>
            Create one →
          </Link>
        </div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table mb-0">
            <thead>
              <tr>
                <th className="font-mono text-[10.5px] uppercase tracking-wider">Invoice No.</th>
                <th className="font-mono text-[10.5px] uppercase tracking-wider">Consignee</th>
                <th className="font-mono text-[10.5px] uppercase tracking-wider">Vehicle</th>
                <th className="font-mono text-[10.5px] uppercase tracking-wider">USD Price</th>
                <th className="font-mono text-[10.5px] uppercase tracking-wider">UGX Total</th>
                <th className="font-mono text-[10.5px] uppercase tracking-wider">Status</th>
                <th className="font-mono text-[10.5px] uppercase tracking-wider">PDF</th>
                <th className="font-mono text-[10.5px] uppercase tracking-wider">Date</th>
                <th className="font-mono text-[10.5px] uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((inv) => (
                <tr key={inv.id}>
                  <td className="leon-num" data-leon-num="true">
                    <Link href={`/admin/invoices/${inv.id}`} className="fw-semibold text-decoration-none" style={{ color: 'var(--admin-accent)' }}>
                      {inv.invoiceNumber}
                    </Link>
                  </td>
                  <td>
                    <div className="text-truncate" style={{ maxWidth: '140px' }} title={inv.consigneeName}>
                      {inv.consigneeName}
                    </div>
                  </td>
                  <td>
                    <div className="text-truncate small" style={{ maxWidth: '140px' }}>
                      {[inv.vehicleMake, inv.vehicleModel].filter(Boolean).join(' ') || '—'}
                    </div>
                  </td>
                  <td className="font-mono small leon-num" data-leon-num="true">{inv.cfPriceUsd ? `$${fmt(inv.cfPriceUsd)}` : '—'}</td>
                  <td className="font-mono small leon-num" data-leon-num="true">{inv.grandTotalUgx ? `UGX ${fmt(inv.grandTotalUgx)}` : '—'}</td>
                  <td><InvoiceStatusBadge status={inv.status} /></td>
                  <td>
                    {inv.pdfUrl ? (
                      <button
                        type="button"
                        onClick={() => viewPdf(inv.id, true)}
                        className="btn btn-outline-dark btn-sm rounded-pill"
                        style={{ padding: '0.2rem 0.6rem', fontSize: '0.72rem' }}
                      >
                        <LeonIcon name="file-text" size={13} className="me-1" /> View
                      </button>
                    ) : (
                      <span className="small text-muted font-mono" title="PDF generates when the sales desktop app is signed in online">
                        Pending PDF
                      </span>
                    )}
                  </td>
                  <td className="text-muted small font-mono leon-num" data-leon-num="true">
                    {new Date(inv.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td>
                    <div className="d-flex gap-1 align-items-center">
                      <Link
                        href={`/admin/invoices/${inv.id}`}
                        className="btn btn-outline-dark btn-sm rounded-pill"
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                        title="Edit Invoice"
                      >
                        <LeonIcon name="pencil" size={13} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => sendEmail(inv.id, inv.consigneeEmail)}
                        disabled={emailing === inv.id}
                        className="btn btn-dark btn-sm rounded-pill"
                        style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                        title={inv.consigneeEmail ? `Send Invoice to ${inv.consigneeEmail}` : 'Customer email missing - Edit invoice to add'}
                      >
                        {emailing === inv.id ? '…' : <><LeonIcon name="mail" size={13} className="me-1" /> Send</>}
                      </button>
                      <InvoiceDeleteButton id={inv.id} invoiceNumber={inv.invoiceNumber} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
