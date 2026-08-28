import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { createSessionToken } from '@/lib/auth';

/**
 * Anonymous guest session — no credentials.
 *
 * Every anonymous guest invoice belongs to one shared, non-login "guest" sales
 * account; a random `gsid` baked into the token keeps each guest session's
 * invoices private from every other guest. The desktop client keeps this token
 * in memory only and never writes guest data to the local database.
 */

const GUEST_USERNAME = '__guest__';

async function getGuestUser() {
  return prisma.salesUser.upsert({
    where: { username: GUEST_USERNAME },
    update: { isActive: true },
    create: {
      username: GUEST_USERNAME,
      passwordHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      role: 'guest',
      displayName: 'Guest',
      isActive: true,
    },
  });
}

export async function POST(_request: NextRequest) {
  try {
    const guest = await getGuestUser();
    const gsid = randomBytes(12).toString('hex');

    const token = createSessionToken({
      userId: guest.id,
      username: guest.username,
      kind: 'sales',
      gsid,
    });

    await prisma.clientActivity
      .create({
        data: {
          userId: guest.id,
          action: 'guest_session_start',
          metadata: { gsid, source: 'sales_system' },
        },
      })
      .catch(() => {});

    return NextResponse.json({
      token,
      gsid,
      guestSession: true,
      user: {
        id: guest.id,
        username: guest.username,
        displayName: 'Guest',
        email: null,
        phone: null,
        role: 'guest',
        isAdmin: false,
      },
    });
  } catch (e) {
    console.error('Guest session error:', e);
    return NextResponse.json({ error: 'Could not start guest session' }, { status: 500 });
  }
}
