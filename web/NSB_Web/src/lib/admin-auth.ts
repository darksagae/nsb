import type { NextRequest } from 'next/server';
import { getSessionAdmin } from '@/lib/auth';
import { redirect } from 'next/navigation';

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isUserOnline(lastSeenAt: Date | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}

/** @deprecated Sales-user admin check — control panel uses ControlAdmin only. */
export function isAdminRole(role: string, username: string): boolean {
  if (role === 'admin') return true;
  const env = process.env.ADMIN_USERNAMES ?? '';
  const allowed = env
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(username.toLowerCase());
}

/** Mobile control centre — ControlAdmin accounts only (e.g. developer1). */
export async function requireAdminApi(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (!admin?.isActive) return null;
  return admin;
}

export async function requireAdminPageUser() {
  const admin = await getSessionAdmin();
  if (!admin?.isActive) redirect('/admin/login');
  return admin;
}
