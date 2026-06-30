'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';

type DetailUser = {
  id: number;
  username: string;
  displayName: string | null;
  role: string;
  isActive: boolean;
  machineLocked: boolean;
  lockMessage: string | null;
  bannedUntil: string | null;
  assignedMachineId: string | null;
  assignedMachineName: string | null;
  blockedMachineId: string | null;
  blockedMachineName: string | null;
  transferPending: boolean;
  lastSeenAt: string | null;
  invoiceCount: number;
  activityCount: number;
};

type DetailInvoice = {
  invoiceNumber: string;
  consigneeName?: string;
  customer?: { name?: string };
  status?: string;
  createdAt?: string;
  updatedAt?: string;
};

type DetailCustomer = {
  name: string;
  phone: string | null;
  email: string | null;
  invoiceCount: number;
};

type DetailActivity = {
  id: number;
  action: string;
  createdAt: string;
};

function formatWhen(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AccountDetailPanel({ userId, displayName }: { userId: number; displayName: string }) {
  const [tab, setTab] = useState<'invoices' | 'customers' | 'activity' | 'remote'>('invoices');
  const [user, setUser] = useState<DetailUser | null>(null);
  const [invoices, setInvoices] = useState<DetailInvoice[]>([]);
  const [customers, setCustomers] = useState<DetailCustomer[]>([]);
  const [activities, setActivities] = useState<DetailActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Record<string, unknown> | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<Record<string, unknown> | null>(null);
  const [invoiceDetailLoading, setInvoiceDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/detail`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to load account detail');
      }
      const data = await res.json();
      setUser(data.user ?? null);
      setInvoices(data.invoices ?? []);
      setCustomers(data.customers ?? []);
      setActivities(data.activities ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load account detail');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const sendCommand = async (command: string, payload?: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, payload: payload ?? {} }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Command failed');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Command failed');
    } finally {
      setBusy(false);
    }
  };

  const deleteInvoice = async (invoiceNumber: string) => {
    if (!window.confirm(`Delete invoice ${invoiceNumber} from cloud and queue removal on the user's machine?`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const encoded = encodeURIComponent(invoiceNumber);
      const res = await fetch(`/api/admin/users/${userId}/invoices/${encoded}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Delete failed');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  };

  const lockMachine = async () => {
    const message =
      window.prompt(
        'Message shown on the machine:',
        'You are temporarily banned. Contact NSB Motors administrator.',
      ) ?? '';
    if (!message.trim()) return;
    const hoursRaw = window.prompt('Ban duration in hours (0 = until manually unlocked):', '24') ?? '24';
    const hours = Number(hoursRaw);
    await sendCommand('lock_machine', { message: message.trim(), hours: Number.isFinite(hours) ? hours : 24 });
  };

  const clearLocalData = async () => {
    if (
      !window.confirm(
        "Wipe all invoices, customers, and payments on this user's machine?\n\nCloud data is not affected.",
      )
    ) {
      return;
    }
    await sendCommand('clear_local_data');
  };

  const transferMachine = async () => {
    const deviceName = user?.assignedMachineName ?? 'current device';
    if (
      !window.confirm(
        `Unlink ${deviceName} and allow this user to sign in on a replacement PC?\n\n` +
          '• The old PC will be logged out and local data cleared\n' +
          '• The user must sign in on the new PC and tap "Link this device"\n' +
          '• Invoices will download from the cloud\n' +
          '• The old PC cannot be used again for this account',
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/transfer-machine`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to transfer machine');
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to transfer machine');
    } finally {
      setBusy(false);
    }
  };

  const openInvoiceDetail = async (invoiceNumber: string) => {
    setSelectedInvoice({ invoiceNumber });
    setInvoiceDetail(null);
    setInvoiceDetailLoading(true);
    setError(null);
    try {
      const encoded = encodeURIComponent(invoiceNumber);
      const res = await fetch(`/api/admin/users/${userId}/invoices/${encoded}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to load invoice');
      }
      const data = await res.json();
      setInvoiceDetail((data.invoice as Record<string, unknown>) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoice');
      setSelectedInvoice(null);
    } finally {
      setInvoiceDetailLoading(false);
    }
  };

  const closeInvoiceDetail = () => {
    setSelectedInvoice(null);
    setInvoiceDetail(null);
  };

  const fmt = (v: unknown, suffix = '') => {
    if (v == null || v === '') return '—';
    const n = Number(v);
    if (Number.isFinite(n)) return `${n.toLocaleString('en-US')}${suffix}`;
    return String(v);
  };

  const tabs = [
    { id: 'invoices' as const, label: 'Invoices', count: invoices.length },
    { id: 'customers' as const, label: 'Customers', count: customers.length },
    { id: 'activity' as const, label: 'Activity', count: activities.length },
    { id: 'remote' as const, label: 'Remote control' },
  ];

  if (loading && !user) {
    return (
      <div className="text-center py-5 text-muted font-mono small">
        <LeonIcon name="refresh" size={20} className="spin mb-2" />
        Loading account detail…
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="alert alert-danger py-2 small mb-4" role="alert">
          {error}
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`btn btn-sm rounded-pill px-3 ${tab === t.id ? 'btn-dark' : 'btn-outline-dark'}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {'count' in t && t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
        <button type="button" className="btn btn-outline-secondary btn-sm rounded-pill ms-auto" onClick={load} disabled={busy}>
          <LeonIcon name="refresh" size={14} className="me-1" />
          Refresh
        </button>
      </div>

      {tab === 'invoices' && (
        <div className="leon-bezel-outer">
          <div className="leon-bezel-inner">
            {invoices.length === 0 ? (
              <p className="text-muted small mb-0 font-mono">No invoices for {displayName}.</p>
            ) : (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr className="font-mono small text-muted">
                      <th>Invoice</th>
                      <th>Customer</th>
                      <th>Updated</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const number = inv.invoiceNumber;
                      const customer = inv.consigneeName ?? inv.customer?.name ?? '—';
                      return (
                        <tr key={number} style={{ cursor: 'pointer' }} onClick={() => openInvoiceDetail(number)}>
                          <td className="font-mono fw-semibold">{number}</td>
                          <td>{customer}</td>
                          <td className="small text-muted font-mono">{formatWhen(inv.updatedAt ?? inv.createdAt)}</td>
                          <td className="text-end" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm rounded-pill me-1"
                              disabled={busy}
                              title="View invoice details and PDF"
                              onClick={() => openInvoiceDetail(number)}
                            >
                              <LeonIcon name="file-text" size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-dark btn-sm rounded-pill me-1"
                              disabled={busy}
                              title="Generate PDF on machine (or control when offline)"
                              onClick={() => sendCommand('generate_invoice', { invoiceNumber: number, finalize: true })}
                            >
                              <LeonIcon name="file-text" size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-dark btn-sm rounded-pill me-1"
                              disabled={busy}
                              title="Push to machine for edit"
                              onClick={() => sendCommand('push_invoice', { invoiceNumber: number })}
                            >
                              <LeonIcon name="pencil" size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm rounded-pill"
                              disabled={busy}
                              title="Delete from cloud and machine"
                              onClick={() => deleteInvoice(number)}
                            >
                              <LeonIcon name="trash" size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'customers' && (
        <div className="row g-3">
          {customers.length === 0 ? (
            <div className="col-12 text-muted small font-mono">No customers yet.</div>
          ) : (
            customers.map((c) => (
              <div key={`${c.name}-${c.phone}`} className="col-12 col-md-6 col-xl-4">
                <div className="leon-bezel-outer h-100">
                  <div className="leon-bezel-inner h-100">
                    <div className="fw-bold text-dark">{c.name}</div>
                    {c.phone && <div className="small font-mono text-muted">{c.phone}</div>}
                    {c.email && <div className="small font-mono text-muted">{c.email}</div>}
                    <div className="small font-mono text-dark mt-2">{c.invoiceCount} invoice(s)</div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="leon-bezel-outer">
          <div className="leon-bezel-inner">
            {activities.length === 0 ? (
              <p className="text-muted small mb-0 font-mono">No activity recorded.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {activities.map((a) => (
                  <li key={a.id} className="d-flex justify-content-between gap-3 py-2 border-bottom border-light-subtle small">
                    <span className="font-mono">{a.action.replace(/_/g, ' ')}</span>
                    <span className="text-muted font-mono text-nowrap">{formatWhen(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'remote' && (
        <div className="row g-4">
          <div className="col-12 col-lg-5">
            <div className="leon-bezel-outer h-100">
              <div className="leon-bezel-inner h-100">
                <span className="leon-section-label d-block mb-2">Machine assignment</span>
                {user?.transferPending ? (
                  <>
                    <div className="font-mono fw-bold mb-2 text-warning">Waiting for user to link a new PC</div>
                    {user.blockedMachineName && (
                      <div className="small text-muted font-mono mb-2">
                        Previous device: {user.blockedMachineName}
                      </div>
                    )}
                  </>
                ) : user?.assignedMachineName ? (
                  <div className="small text-muted font-mono mb-2">Device: {user.assignedMachineName}</div>
                ) : (
                  <div className="small text-muted font-mono mb-2">No machine linked</div>
                )}
                {user?.assignedMachineId && !user.transferPending && (
                  <button
                    type="button"
                    className="btn btn-outline-warning btn-sm rounded-pill text-start mt-2"
                    disabled={busy}
                    onClick={transferMachine}
                  >
                    <LeonIcon name="refresh" size={14} className="me-2" />
                    Transfer to new machine
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-5">
            <div className="leon-bezel-outer h-100">
              <div className="leon-bezel-inner h-100">
                <span className="leon-section-label d-block mb-2">Machine status</span>
                <div
                  className={`font-mono fw-bold mb-2 ${user?.machineLocked ? 'text-danger' : 'text-success'}`}
                >
                  {user?.machineLocked ? 'LOCKED' : 'Active'}
                </div>
                {user?.machineLocked && user.lockMessage && (
                  <div className="small text-muted">{user.lockMessage}</div>
                )}
                {user?.bannedUntil && (
                  <div className="small text-muted font-mono mt-2">
                    Banned until: {formatWhen(user.bannedUntil)}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-7">
            <div className="leon-bezel-outer h-100">
              <div className="leon-bezel-inner h-100">
                <span className="leon-section-label d-block mb-3">Remote control</span>
                <div className="d-flex flex-column gap-2">
                  {user?.machineLocked ? (
                    <button
                      type="button"
                      className="btn btn-outline-success btn-sm rounded-pill text-start"
                      disabled={busy}
                      onClick={() => sendCommand('unlock_machine')}
                    >
                      <LeonIcon name="unlock" size={14} className="me-2" />
                      Unlock machine
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm rounded-pill text-start"
                      disabled={busy}
                      onClick={lockMachine}
                    >
                      <LeonIcon name="lock" size={14} className="me-2" />
                      Lock machine (temporary ban)
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm rounded-pill text-start"
                    disabled={busy}
                    onClick={clearLocalData}
                  >
                    <LeonIcon name="trash" size={14} className="me-2" />
                    Clear all local data on machine
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-dark btn-sm rounded-pill text-start"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Force logout on the sales desktop?')) {
                        sendCommand('logout_user');
                      }
                    }}
                  >
                    <LeonIcon name="shield" size={14} className="me-2" />
                    Force logout on machine
                  </button>
                </div>
                <p className="small text-muted font-mono mt-3 mb-0">
                  Commands reach the machine on the next heartbeat (~30s). Use the pencil icon on an invoice to
                  sync and open it for editing on their desktop.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedInvoice && (
        <div
          className="modal d-block"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.45)' }}
          role="dialog"
          aria-modal="true"
        >
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title font-mono">{String(selectedInvoice.invoiceNumber)}</h5>
                <button type="button" className="btn-close" aria-label="Close" onClick={closeInvoiceDetail} />
              </div>
              <div className="modal-body">
                {invoiceDetailLoading ? (
                  <div className="text-center py-4 text-muted font-mono small">Loading invoice…</div>
                ) : invoiceDetail ? (
                  <div className="row g-4">
                    <div className="col-12 col-md-6">
                      <span className="leon-section-label d-block mb-2">Customer</span>
                      <div className="small font-mono">
                        <div>Name: {fmt((invoiceDetail.customer as { name?: string })?.name ?? invoiceDetail.consigneeName)}</div>
                        <div>Phone: {fmt((invoiceDetail.customer as { phone?: string })?.phone ?? invoiceDetail.consigneePhone)}</div>
                        <div>Email: {fmt((invoiceDetail.customer as { email?: string })?.email ?? invoiceDetail.consigneeEmail)}</div>
                        <div>Address: {fmt((invoiceDetail.customer as { address?: string })?.address ?? invoiceDetail.consigneeAddress)}</div>
                      </div>
                    </div>
                    <div className="col-12 col-md-6">
                      <span className="leon-section-label d-block mb-2">Vehicle</span>
                      <div className="small font-mono">
                        <div>Make: {fmt(invoiceDetail.vehicleMake)}</div>
                        <div>Model: {fmt(invoiceDetail.vehicleModel)}</div>
                        <div>Year: {fmt(invoiceDetail.vehicleYear)}</div>
                        <div>Chassis: {fmt(invoiceDetail.chassisNo)}</div>
                        <div>Stock: {fmt(invoiceDetail.stockNo ?? invoiceDetail.refNo)}</div>
                      </div>
                    </div>
                    <div className="col-12">
                      <span className="leon-section-label d-block mb-2">Amounts</span>
                      <div className="small font-mono">
                        <div>Status: {fmt(invoiceDetail.status)}</div>
                        <div>C&amp;F USD: {fmt(invoiceDetail.carPriceUSD ?? invoiceDetail.cfMombasaUsd, ' USD')}</div>
                        <div>Exchange rate: {fmt(invoiceDetail.exchangeRate)}</div>
                        <div>1st installment: {fmt(invoiceDetail.firstInstallmentUGX, ' UGX')}</div>
                        <div>Taxes URA: {fmt(invoiceDetail.taxesURA, ' UGX')}</div>
                        <div>2nd installment: {fmt(invoiceDetail.secondInstallmentUGX, ' UGX')}</div>
                        <div className="fw-bold">Grand total: {fmt(invoiceDetail.totalAmount ?? invoiceDetail.grandTotalUgx, ' UGX')}</div>
                        <div>Due date: {formatWhen(String(invoiceDetail.dueDate ?? ''))}</div>
                      </div>
                    </div>
                    {invoiceDetail.notes ? (
                      <div className="col-12">
                        <span className="leon-section-label d-block mb-2">Notes</span>
                        <div className="small">{String(invoiceDetail.notes)}</div>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-muted small">Invoice not found.</div>
                )}
              </div>
              <div className="modal-footer">
                {selectedInvoice.invoiceNumber && invoiceDetail?.machinePdfReady ? (
                  <a
                    href={`/api/admin/users/${userId}/invoices/${encodeURIComponent(String(selectedInvoice.invoiceNumber))}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-dark btn-sm rounded-pill"
                  >
                    <LeonIcon name="file-text" size={14} className="me-1" />
                    View PDF
                  </a>
                ) : selectedInvoice.invoiceNumber ? (
                  <span className="small text-muted font-mono me-2">PDF pending from sales machine</span>
                ) : null}
                <button type="button" className="btn btn-outline-secondary btn-sm rounded-pill" onClick={closeInvoiceDetail}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
