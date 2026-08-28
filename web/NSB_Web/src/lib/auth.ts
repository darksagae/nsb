import { createHmac, createHash, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';

export const SESSION_COOKIE = 'nsb_session';

export type SessionKind = 'admin' | 'sales';

export type SessionPayload = {
  userId: number;
  username: string;
  kind: SessionKind;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET is required in production');
    }
    return 'nsb-dev-session-secret-change-me';
  }
  return secret;
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

export function createSessionToken(payload: {
  userId: number;
  username: string;
  kind: SessionKind;
}): string {
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = createHmac('sha256', getSecret()).update(body).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expected);
    if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SessionPayload & {
      kind?: SessionKind;
    };
    if (!payload.userId || !payload.username || payload.exp < Date.now()) return null;
    return {
      userId: payload.userId,
      username: payload.username,
      kind: payload.kind === 'admin' ? 'admin' : 'sales',
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(request: NextRequest): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    return header.slice(7).trim();
  }
  return request.cookies.get(SESSION_COOKIE)?.value ?? null;
}

export async function getSessionPayload(request?: NextRequest): Promise<SessionPayload | null> {
  let token: string | null = null;
  if (request) {
    token = getTokenFromRequest(request);
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get(SESSION_COOKIE)?.value ?? null;
  }
  if (!token) return null;
  return verifySessionToken(token);
}

/** Sales machine / sync API session (not control panel). */
export async function getSessionUser(request?: NextRequest) {
  const payload = await getSessionPayload(request);
  if (!payload || payload.kind !== 'sales') return null;
  return prisma.salesUser.findUnique({ where: { id: payload.userId } });
}

/** Control panel admin session (web + mobile control). */
export async function getSessionAdmin(request?: NextRequest) {
  const payload = await getSessionPayload(request);
  if (!payload || payload.kind !== 'admin') return null;
  return prisma.controlAdmin.findUnique({ where: { id: payload.userId } });
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  };
}
