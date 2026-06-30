import { getSessionUser } from '@/lib/auth';
import { redirect } from 'next/navigation';

/** Web portal — machine sales accounts (same credentials as desktop). */
export async function getCurrentSalesUser() {
  const user = await getSessionUser();
  if (!user?.isActive) return null;
  return user;
}

export async function requirePageUser() {
  const user = await getCurrentSalesUser();
  if (!user) redirect('/admin/login');
  return user;
}
