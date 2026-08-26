import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { requireAdminApi, isUserOnline } from '@/lib/admin-auth';
import { decryptPasswordPlain, encryptPasswordPlain } from '@/lib/password-vault';
import { hashSecurityAnswer } from '@/lib/security-question';
import { prisma } from '@/lib/db';

function serializeUser(
  user: {
    id: number;
    username: string;
    passwordEnc: string | null;
    role: string;
    displayName: string | null;
    email: string | null;
    phone: string | null;
    isActive: boolean;
    securityQuestion?: string | null;
    lastSeenAt: Date | null;
    assignedMachineId?: string | null;
    assignedMachineName?: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count?: { invoices: number; activities: number };
  },
  includePassword = true,
) {
  return {
    id: user.id,
    username: user.username,
    password: includePassword ? decryptPasswordPlain(user.passwordEnc) : null,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    securityQuestion: user.securityQuestion ?? null,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    online: isUserOnline(user.lastSeenAt),
    assignedMachineId: user.assignedMachineId,
    assignedMachineName: user.assignedMachineName,
    invoiceCount: user._count?.invoices ?? 0,
    activityCount: user._count?.activities ?? 0,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const users = await prisma.salesUser.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { invoices: true, activities: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    return NextResponse.json({
      users: users.map((u) => ({
        ...serializeUser(u),
        lastActivity: u.activities[0]
          ? {
              action: u.activities[0].action,
              createdAt: u.activities[0].createdAt.toISOString(),
            }
          : null,
      })),
    });
  } catch (e) {
    console.error('Admin users list error:', e);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const displayName = String(body.displayName ?? username).trim() || username;
    const role = String(body.role ?? 'user');

    if (!username || username.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const existing = await prisma.salesUser.findUnique({ where: { username } });
    if (existing) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 });
    }

    const securityQuestion = body.securityQuestion ? String(body.securityQuestion).trim() : null;
    const securityAnswer = body.securityAnswer ? String(body.securityAnswer).trim() : null;

    const user = await prisma.salesUser.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        passwordEnc: encryptPasswordPlain(password),
        role,
        displayName,
        email: body.email ? String(body.email).trim() || null : null,
        phone: body.phone ? String(body.phone).trim() || null : null,
        securityQuestion: securityAnswer ? securityQuestion : null,
        securityAnswerHash:
          securityQuestion && securityAnswer ? hashSecurityAnswer(securityAnswer) : null,
      },
      include: { _count: { select: { invoices: true, activities: true } } },
    });

    await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'user_created',
        metadata: { source: 'admin', by: admin.username },
      },
    });

    return NextResponse.json(serializeUser(user), { status: 201 });
  } catch (e) {
    console.error('Admin create user error:', e);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
