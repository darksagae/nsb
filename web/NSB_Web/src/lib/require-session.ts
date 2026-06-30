import { NextRequest, NextResponse } from 'next/server';
import { getSessionAdmin, getSessionUser } from '@/lib/auth';

export async function requireSession(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (admin?.isActive) {
    return { user: null, admin, response: null };
  }

  const user = await getSessionUser(request);
  if (!user) {
    return {
      user: null,
      admin: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { user, admin: null, response: null };
}
