import Link from 'next/link';
import { prisma } from '@/lib/db';
import { requirePageUser } from '@/lib/get-current-user';
import { InvoiceStatusBadge } from '@/components/admin/invoices/InvoiceStatusBadge';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';

// Reading this as: Admin portal home using Leonxlnx's Soft Structuralism design language, with double-bezel cards and concentric border-radius architecture.
// DESIGN_VARIANCE: 7
// MOTION_INTENSITY: 5
// VISUAL_DENSITY: 4

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Home | Admin' };

export default async function AdminDashboardPage() {
  const user = await requirePageUser();
  const invoiceScope = { userId: user.id };
  // Fetch counts defensively
  let counts = {
    invoices: 0,
    draftInvoices: 0,
    paidInvoices: 0,
    pendingInvoices: 0,
    overdueInvoices: 0,
    vehicles: 0,
    availableVehicles: 0,
    soldVehicles: 0,
    inquiries: 0,
    mvTaxRates: 0,
  };

  let recentInvoices: any[] = [];
  let recentInquiries: any[] = [];
  let databaseMonth = '';
  let databaseImportedAt = '';
  let databaseLocked = false;

  let recentActivities: Array<{ id: number; action: string; metadata: unknown; createdAt: Date }> = [];

  try {
    const [
      allInvoices,
      allVehicles,
      inquiriesCount,
      taxRatesCount,
      invoicesList,
      inquiriesList,
      dbSettings,
      activitiesList,
    ] = await Promise.all([
      prisma.invoice.findMany({ where: invoiceScope, select: { status: true } }).catch(() => []),
      (prisma.vehicle as any).findMany({ select: { status: true } }).catch(() => []),
      (prisma.inquiry as any).count().catch(() => 0),
      (prisma.vehicleTaxRate as any).count().catch(() => 0),
      prisma.invoice.findMany({
        where: invoiceScope,
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { vehicle: { include: { brand: true } } },
      }).catch(() => []),
      (prisma.inquiry as any).findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { vehicle: { include: { brand: true } } },
      }).catch(() => []),
      prisma.setting.findMany({
        where: { key: { in: ['mv_database_locked', 'mv_database_month', 'mv_database_imported_at'] } }
      }).catch(() => []),
      prisma.clientActivity.findMany({
        where: { userId: user.id },
        take: 8,
        orderBy: { createdAt: 'desc' },
      }).catch(() => []),
    ]);

    counts.invoices = allInvoices.length;
    counts.draftInvoices = allInvoices.filter((i: any) => i.status === 'draft').length;
    counts.paidInvoices = allInvoices.filter((i: any) => i.status === 'paid').length;
    counts.pendingInvoices = allInvoices.filter((i: any) => i.status === 'pending' || i.status === 'sent').length;
    counts.overdueInvoices = allInvoices.filter((i: any) => i.status === 'overdue').length;

    counts.vehicles = allVehicles.length;
    counts.availableVehicles = allVehicles.filter((v: any) => v.status !== 'sold').length;
    counts.soldVehicles = allVehicles.filter((v: any) => v.status === 'sold').length;

    counts.inquiries = inquiriesCount;
    counts.mvTaxRates = taxRatesCount;

    recentInvoices = invoicesList;
    recentInquiries = inquiriesList;
    recentActivities = activitiesList;

    const settingMap: Record<string, string> = {};
    for (const s of dbSettings) settingMap[s.key] = s.value;
    databaseLocked = settingMap.mv_database_locked === 'true';
    databaseMonth = settingMap.mv_database_month || 'N/A';
    databaseImportedAt = settingMap.mv_database_imported_at
      ? new Date(settingMap.mv_database_imported_at).toLocaleDateString()
      : 'N/A';

  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }

  // Format currency helpers
  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '-';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  };

  // Percentage helper for distribution telemetry bar
  const getPercentage = (val: number) => {
    if (counts.invoices === 0) return 0;
    return Math.round((val / counts.invoices) * 100);
  };

  const draftPct = getPercentage(counts.draftInvoices);
  const paidPct = getPercentage(counts.paidInvoices);
  const pendingPct = getPercentage(counts.pendingInvoices);
  const overduePct = getPercentage(counts.overdueInvoices);

  return (
    <>
      {/* Editorial Dashboard Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-5 pb-3 border-bottom border-secondary-subtle">
        <div>
          <h1 className="h3 fw-bold mb-1 tracking-tighter text-dark d-flex align-items-center gap-2 leon-heading">
            <LeonIcon name="home" size={22} className="leon-icon-accent" />
            Home Overview
          </h1>
          <p className="text-muted small mb-0">
            Welcome back{user.displayName ? `, ${user.displayName}` : ''}. Monitor your sales activity and tax compliance database below.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          {/* Leonxlnx Button-in-Button Pill style */}
          <Link href="/admin/invoices/new" className="btn btn-dark rounded-pill px-4 py-2 d-inline-flex align-items-center gap-3 leon-section-label mb-0 shadow-sm">
            <span>Create Invoice</span>
            <span className="leon-btn-pill__icon">
              <LeonIcon name="plus" size={10} className="text-white" />
            </span>
          </Link>
        </div>
      </div>

      {/* Asymmetric Bento Grid (Leonxlnx Double-Bezel Cards) */}
      <div className="row g-4 mb-5">
        {/* Bento Cell 1: Invoices Status Distribution Telemetry (2/3 width) */}
        <div className="col-12 col-lg-8">
          <div className="leon-bezel-outer h-100">
            <div className="leon-bezel-inner h-100 d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="leon-section-label mb-0">Invoice Telemetry</span>
                  <Link href="/admin/invoices" className="small text-decoration-none fw-semibold d-flex align-items-center gap-1" style={{ color: 'var(--admin-accent)' }}>
                    Manage Invoices <LeonIcon name="arrow-right" size={14} />
                  </Link>
                </div>
                <div className="d-flex align-items-baseline gap-2 mb-4">
                  <span className="display-5 fw-bold text-dark leon-num" data-leon-num="true">{counts.invoices}</span>
                  <span className="text-muted small">issued invoices</span>
                </div>
              </div>

              {/* Telemetry Distribution Bar */}
              <div className="mb-4">
                <div className="progress rounded-pill bg-light border" style={{ height: '14px', overflow: 'hidden' }}>
                  {counts.invoices > 0 ? (
                    <>
                      {counts.paidInvoices > 0 && (
                        <div className="progress-bar bg-success opacity-75" role="progressbar" style={{ width: `${paidPct}%` }} title={`Paid: ${paidPct}%`} />
                      )}
                      {counts.pendingInvoices > 0 && (
                        <div className="progress-bar bg-warning opacity-75" role="progressbar" style={{ width: `${pendingPct}%` }} title={`Pending: ${pendingPct}%`} />
                      )}
                      {counts.draftInvoices > 0 && (
                        <div className="progress-bar bg-secondary opacity-75" role="progressbar" style={{ width: `${draftPct}%` }} title={`Draft: ${draftPct}%`} />
                      )}
                      {counts.overdueInvoices > 0 && (
                        <div className="progress-bar bg-danger opacity-75" role="progressbar" style={{ width: `${overduePct}%` }} title={`Overdue: ${overduePct}%`} />
                      )}
                    </>
                  ) : (
                    <div className="progress-bar bg-secondary opacity-25" style={{ width: '100%' }} />
                  )}
                </div>
              </div>

              {/* Distribution Legend */}
              <div className="row g-2 text-center text-md-start">
                <div className="col-6 col-md-3">
                  <div className="d-flex align-items-center gap-2 justify-content-center justify-content-md-start">
                    <span className="d-inline-block rounded-circle bg-success" style={{ width: 8, height: 8 }} />
                    <span className="small text-dark fw-semibold leon-num" data-leon-num="true">{counts.paidInvoices}</span>
                    <span className="small text-muted font-mono">Paid</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="d-flex align-items-center gap-2 justify-content-center justify-content-md-start">
                    <span className="d-inline-block rounded-circle bg-warning" style={{ width: 8, height: 8 }} />
                    <span className="small text-dark fw-semibold leon-num" data-leon-num="true">{counts.pendingInvoices}</span>
                    <span className="small text-muted font-mono">Pending</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="d-flex align-items-center gap-2 justify-content-center justify-content-md-start">
                    <span className="d-inline-block rounded-circle bg-secondary" style={{ width: 8, height: 8 }} />
                    <span className="small text-dark fw-semibold leon-num" data-leon-num="true">{counts.draftInvoices}</span>
                    <span className="small text-muted font-mono">Draft</span>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="d-flex align-items-center gap-2 justify-content-center justify-content-md-start">
                    <span className="d-inline-block rounded-circle bg-danger" style={{ width: 8, height: 8 }} />
                    <span className="small text-dark fw-semibold leon-num" data-leon-num="true">{counts.overdueInvoices}</span>
                    <span className="small text-muted font-mono">Overdue</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Cell 2: Vehicles Status (1/3 width) */}
        <div className="col-12 col-md-6 col-lg-4">
          <div className="leon-bezel-outer h-100">
            <div className="leon-bezel-inner h-100 d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="leon-section-label mb-0">Dealership Fleet</span>
                  <LeonIcon name="car" size={17} className="text-secondary" />
                </div>
                <div className="d-flex align-items-baseline gap-2 mb-4">
                  <span className="display-5 fw-bold text-dark leon-num" data-leon-num="true">{counts.vehicles}</span>
                  <span className="text-muted small">total units</span>
                </div>
              </div>

              <div className="pt-3 border-top border-secondary-subtle">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="small text-muted">Available Listings</span>
                  <span className="small fw-semibold text-success bg-success-subtle px-2 py-0.5 rounded-pill leon-num" data-leon-num="true">{counts.availableVehicles}</span>
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <span className="small text-muted">Sold Listings</span>
                  <span className="small fw-semibold text-secondary bg-light px-2 py-0.5 rounded-pill leon-num" data-leon-num="true">{counts.soldVehicles}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bento Cell 3: Customer inquiries (1/3 width) */}
        <div className="col-12 col-md-6 col-lg-4">
          <div className="leon-bezel-outer h-100">
            <div className="leon-bezel-inner h-100 d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="leon-section-label mb-0">Leads & Inquiries</span>
                  <LeonIcon name="message-square" size={17} className="text-secondary" />
                </div>
                <div className="d-flex align-items-baseline gap-2 mb-4">
                  <span className="display-5 fw-bold text-dark leon-num" data-leon-num="true">{counts.inquiries}</span>
                  <span className="text-muted small">customer leads</span>
                </div>
              </div>

              <div className="pt-3 border-top border-secondary-subtle text-muted small leading-relaxed">
                <LeonIcon name="trending-up" size={14} className="me-1 text-success" />
                Real-time customer submissions generated from the public vehicle showroom.
              </div>
            </div>
          </div>
        </div>

        {/* Bento Cell 4: URA MV Tax Database Info (2/3 width) */}
        <div className="col-12 col-lg-8">
          <div className="leon-bezel-outer h-100">
            <div className="leon-bezel-inner h-100 d-flex flex-column justify-content-between">
              <div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <span className="leon-section-label mb-0">Tax Lookup Database</span>
                  <Link href="/admin/mv-database" className="small text-decoration-none fw-semibold d-flex align-items-center gap-1" style={{ color: 'var(--admin-accent)' }}>
                    Database Settings <LeonIcon name="arrow-right" size={14} />
                  </Link>
                </div>
                <div className="d-flex align-items-baseline gap-2 mb-4">
                  <span className="display-5 fw-bold text-dark leon-num" data-leon-num="true">{counts.mvTaxRates.toLocaleString()}</span>
                  <span className="text-muted small">active tax rates</span>
                </div>
              </div>

              <div className="row g-3 pt-3 border-top border-secondary-subtle font-mono text-[11px] text-muted">
                <div className="col-12 col-md-4">
                  <div>DATABASE MONTH: <strong className="text-dark">{databaseMonth}</strong></div>
                </div>
                <div className="col-12 col-md-4">
                  <div>IMPORTED AT: <strong className="text-dark">{databaseImportedAt}</strong></div>
                </div>
                <div className="col-12 col-md-4">
                  <div className="d-flex align-items-center gap-1">
                    STATUS: 
                    {databaseLocked ? (
                      <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill font-mono py-0.5 px-2">
                        <LeonIcon name="lock" size={10} className="me-0.5" /> LOCKED
                      </span>
                    ) : (
                      <span className="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill font-mono py-0.5 px-2">
                        <LeonIcon name="unlock" size={10} className="me-0.5" /> UNLOCKED
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {recentActivities.length > 0 && (
        <div className="row g-4 mb-4">
          <div className="col-12">
            <div className="leon-bezel-outer">
              <div className="leon-bezel-inner">
                <h2 className="h6 fw-bold mb-3 text-dark d-flex align-items-center gap-2 leon-heading">
                  <LeonIcon name="clock" size={17} className="leon-icon-accent" />
                  Recent Activity
                </h2>
                <ul className="list-unstyled mb-0 small">
                  {recentActivities.map((act) => (
                    <li key={act.id} className="d-flex justify-content-between gap-3 py-2 border-bottom border-secondary-subtle">
                      <span className="text-dark text-capitalize">{String(act.action).replace(/_/g, ' ')}</span>
                      <span className="text-muted font-mono text-nowrap">
                        {new Date(act.createdAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Activities Section */}
      <div className="row g-4">
        {/* Column: Recent Invoices */}
        <div className="col-12 col-xl-6">
          <div className="leon-bezel-outer h-100">
            <div className="leon-bezel-inner h-100">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2 leon-section-header__title">
                  <LeonIcon name="file-text" size={17} className="leon-icon-accent" />
                  Recent Invoices
                </h2>
                <Link href="/admin/invoices" className="btn btn-light border btn-sm px-3 py-1 font-mono text-[10px] uppercase tracking-wider rounded-pill">
                  View All
                </Link>
              </div>
              {recentInvoices.length === 0 ? (
                <div className="text-center py-5 text-muted font-mono text-[12px]">
                  <LeonIcon name="receipt" size={40} className="text-secondary opacity-50 mb-2 d-block" />
                  No invoices found.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th className="font-mono text-[10.5px] uppercase tracking-wider">Invoice No.</th>
                        <th className="font-mono text-[10.5px] uppercase tracking-wider">Consignee</th>
                        <th className="font-mono text-[10.5px] uppercase tracking-wider">CIF (USD)</th>
                        <th className="font-mono text-[10.5px] uppercase tracking-wider">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInvoices.map((inv) => (
                        <tr key={inv.id}>
                          <td className="leon-num" data-leon-num="true">
                            <Link href={`/admin/invoices/${inv.id}`} className="fw-semibold text-decoration-none">
                              {inv.invoiceNumber}
                            </Link>
                          </td>
                          <td>
                            <div className="text-truncate" style={{ maxWidth: '140px' }} title={inv.consigneeName}>
                              {inv.consigneeName}
                            </div>
                          </td>
                          <td className="leon-num font-mono small" data-leon-num="true">{formatCurrency(inv.cifUsd)}</td>
                          <td>
                            <InvoiceStatusBadge status={inv.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column: Recent Inquiries */}
        <div className="col-12 col-xl-6">
          <div className="leon-bezel-outer h-100">
            <div className="leon-bezel-inner h-100">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h2 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2 leon-section-header__title">
                  <LeonIcon name="mail-open" size={17} className="leon-icon-accent" />
                  Recent Customer Inquiries
                </h2>
                <span className="badge bg-light text-dark border font-mono text-[10.5px] uppercase tracking-wider rounded-pill py-1.5 px-3">
                  Submissions
                </span>
              </div>
              {recentInquiries.length === 0 ? (
                <div className="text-center py-5 text-muted font-mono text-[12px]">
                  <LeonIcon name="inbox" size={40} className="text-secondary opacity-50 mb-2 d-block" />
                  No inquiries found.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th className="font-mono text-[10.5px] uppercase tracking-wider">Customer</th>
                        <th className="font-mono text-[10.5px] uppercase tracking-wider">Contact</th>
                        <th className="font-mono text-[10.5px] uppercase tracking-wider">Vehicle Interest</th>
                        <th className="font-mono text-[10.5px] uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInquiries.map((inq) => {
                        const vehicleLabel = inq.vehicle
                          ? `${inq.vehicle.brand.name} ${inq.vehicle.model}`
                          : inq.type || 'General';
                        return (
                          <tr key={inq.id}>
                            <td>
                              <div className="fw-semibold text-dark text-truncate" style={{ maxWidth: '120px' }}>
                                {inq.customerName}
                              </div>
                            </td>
                            <td>
                              <div className="small text-muted text-truncate" style={{ maxWidth: '130px' }}>
                                {inq.phoneNumber || inq.email}
                              </div>
                            </td>
                            <td>
                              <div className="text-truncate small" style={{ maxWidth: '140px' }} title={vehicleLabel}>
                                {vehicleLabel}
                              </div>
                            </td>
                            <td className="small text-muted font-mono leon-num" data-leon-num="true">
                              {new Date(inq.createdAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
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
        </div>
      </div>
    </>
  );
}
