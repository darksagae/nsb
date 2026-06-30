'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';

export function InvoiceDeleteButton({ id, invoiceNumber }: { id: number; invoiceNumber: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Delete invoice ${invoiceNumber}? This cannot be undone.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
      else alert('Failed to delete invoice');
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="btn btn-outline-danger btn-sm rounded-pill"
      style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
    >
      {loading ? '…' : <LeonIcon name="trash" size={14} />}
    </button>
  );
}
