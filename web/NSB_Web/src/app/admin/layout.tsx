import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';

// Admin must always read fresh DB data (otherwise Vercel prerenders stale lists at build time).
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Admin',
  description: 'NSB Motors Ug admin — invoices, vehicles, and MV database.',
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
