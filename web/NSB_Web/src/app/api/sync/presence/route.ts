import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { updateUserSession } from '@/lib/session-tracker';
import { getUserBanState } from '@/lib/user-ban';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!user.isActive) {
    return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
  }

  const ban = await getUserBanState(user.id);

  try {
    const body = await request.json().catch(() => ({}));
    const source = body.source === 'web' ? 'web' : 'sales_system';

    await updateUserSession(user.id, {
      source,
      machineName: body.machineName ? String(body.machineName).trim() : null,
      ip: body.ip ? String(body.ip).trim() : null,
      appVersion: body.appVersion ? String(body.appVersion).trim() : null,
    });

    const logHeartbeat = body.heartbeat === true;
    if (logHeartbeat) {
      await prisma.clientActivity.create({
        data: {
          userId: user.id,
          action: 'presence',
          metadata: {
            source,
            machineName: body.machineName ?? null,
            ip: body.ip ?? null,
          },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      banned: ban.banned,
      message: ban.banned ? ban.message : null,
      lastSeenAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Presence error:', e);
    return NextResponse.json({ error: 'Presence update failed' }, { status: 500 });
  }
}
