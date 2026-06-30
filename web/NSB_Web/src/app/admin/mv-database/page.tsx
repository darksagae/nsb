import { prisma } from '@/lib/db';
import { MvDatabasePanel } from '@/components/admin/mv-database/MvDatabasePanel';
import Link from 'next/link';
import { LeonIcon } from '@/components/admin/leon/LeonIcon';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'MV Database | Admin' };

export default async function MvDatabasePage() {
  const [settings, rowsResult] = await Promise.all([
    prisma.setting.findMany({
      where: { key: { in: ['mv_database_locked', 'mv_database_month', 'mv_database_row_count', 'mv_database_imported_at'] } },
    }),
    (prisma.vehicleTaxRate as any).findMany({ take: 50, orderBy: { id: 'desc' } }),
  ]);

  const settingMap: Record<string, string> = {};
  for (const s of settings) settingMap[s.key] = s.value;

  const initialSettings = {
    locked: settingMap.mv_database_locked === 'true',
    month: settingMap.mv_database_month || '',
    rowCount: settingMap.mv_database_row_count || '0',
    importedAt: settingMap.mv_database_imported_at || '',
  };

  const total = await (prisma.vehicleTaxRate as any).count();

  return (
    <>
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-5 pb-3 border-bottom border-secondary-subtle">
        <div>
          <h1 className="h3 fw-bold mb-1 tracking-tighter text-dark d-flex align-items-center gap-2 leon-heading">
            <LeonIcon name="database" size={22} className="leon-icon-accent" />
            URA MV Database
          </h1>
          <p className="text-muted small mb-0">
            Import monthly URA motor vehicle tax rates and manage lookup data for invoice creation.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <Link
            href="/admin"
            className="btn btn-light border rounded-pill px-3 py-2 d-inline-flex align-items-center gap-2 leon-section-label mb-0"
          >
            <LeonIcon name="home" size={14} />
            Home
          </Link>
          <Link
            href="/admin/invoices"
            className="btn btn-dark rounded-pill px-4 py-2 d-inline-flex align-items-center gap-3 leon-section-label mb-0 shadow-sm"
          >
            <span>Invoices</span>
            <span className="leon-btn-pill__icon">
              <LeonIcon name="receipt" size={10} className="text-white" />
            </span>
          </Link>
        </div>
      </div>

      <MvDatabasePanel
        initialSettings={initialSettings}
        initialRows={rowsResult}
        initialTotal={total}
      />
    </>
  );
}
