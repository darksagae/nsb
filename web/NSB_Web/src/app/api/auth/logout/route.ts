import { NextRequest, NextResponse } from 'next/server';
import { getSessionAdmin, getSessionUser, SESSION_COOKIE } from '@/lib/auth';
import { clearUserDesktopSession, clearUserWebSession } from '@/lib/session-tracker';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  const user = admin ? null : await getSessionUser(request);
  const body = await request.json().catch(() => ({}));
  const source = body.source === 'sales_system' ? 'sales_system' : 'web';

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  if (user) {
    if (source === 'sales_system') {
      await clearUserDesktopSession(user.id);
    } else {
      await clearUserWebSession(user.id);
    }
    await prisma.clientActivity
      .create({
        data: {
          userId: user.id,
          action: 'user_logout',
          metadata: { source },
        },
      })
      .catch(() => {});
  }

  return response;
}
