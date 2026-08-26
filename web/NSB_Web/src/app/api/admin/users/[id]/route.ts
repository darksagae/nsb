import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { requireAdminApi, isUserOnline } from '@/lib/admin-auth';
import { decryptPasswordPlain, encryptPasswordPlain } from '@/lib/password-vault';
import { hashSecurityAnswer } from '@/lib/security-question';
import { prisma } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    const user = await prisma.salesUser.findUnique({
      where: { id: userId },
      include: {
        _count: { select: { invoices: true, activities: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      password: decryptPasswordPlain(user.passwordEnc),
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isActive: user.isActive,
      securityQuestion: user.securityQuestion,
      lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
      online: isUserOnline(user.lastSeenAt),
      invoiceCount: user._count.invoices,
      activityCount: user._count.activities,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      activities: user.activities.map((a) => ({
        id: a.id,
        action: a.action,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error('Admin user get error:', e);
    return NextResponse.json({ error: 'Failed to fetch user' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;
  const userId = Number(id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    const existing = await prisma.salesUser.findUnique({ where: { id: userId } });
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};

    if (body.username != null) {
      const username = String(body.username).trim();
      if (username.length < 3) {
        return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
      }
      if (username !== existing.username) {
        const clash = await prisma.salesUser.findUnique({ where: { username } });
        if (clash) {
          return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
        }
      }
      data.username = username;
    }

    if (body.password != null) {
      const password = String(body.password);
      if (password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      data.passwordHash = hashPassword(password);
      data.passwordEnc = encryptPasswordPlain(password);
    }

    if (body.displayName != null) {
      data.displayName = String(body.displayName).trim() || null;
    }
    if (body.email != null) {
      data.email = String(body.email).trim() || null;
    }
    if (body.phone != null) {
      data.phone = String(body.phone).trim() || null;
    }
    if (body.role != null) {
      data.role = String(body.role).trim() || 'user';
    }
    if (body.isActive != null) {
      data.isActive = Boolean(body.isActive);
    }
    if (body.clearMachine === true) {
      data.assignedMachineId = null;
      data.assignedMachineName = null;
    }

    if (body.securityQuestion != null || body.securityAnswer != null) {
      const securityQuestion = String(body.securityQuestion ?? '').trim();
      const securityAnswer = String(body.securityAnswer ?? '').trim();
      if (!securityQuestion || !securityAnswer) {
        return NextResponse.json(
          { error: 'Both a security question and an answer are required' },
          { status: 400 },
        );
      }
      data.securityQuestion = securityQuestion;
      data.securityAnswerHash = hashSecurityAnswer(securityAnswer);
      data.securityFailedAttempts = 0;
      data.securityLockedUntil = null;
    }
    if (body.clearSecurityQuestion === true) {
      data.securityQuestion = null;
      data.securityAnswerHash = null;
      data.securityFailedAttempts = 0;
      data.securityLockedUntil = null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updated = await prisma.salesUser.update({
      where: { id: userId },
      data,
      include: { _count: { select: { invoices: true, activities: true } } },
    });

    if (body.password != null || body.username != null) {
      await prisma.adminCommand.create({
        data: {
          userId: updated.id,
          command: 'sync_users',
          payload: {
            users: [
              {
                username: updated.username,
                password_hash: updated.passwordHash,
                role: updated.role,
              },
            ],
          },
        },
      });
    }

    await prisma.clientActivity.create({
      data: {
        userId: updated.id,
        action: body.password != null ? 'admin_password_reset' : 'admin_user_update',
        metadata: {
          by: admin.username,
          fields: Object.keys(data),
        },
      },
    });

    return NextResponse.json({
      id: updated.id,
      username: updated.username,
      password: decryptPasswordPlain(updated.passwordEnc),
      displayName: updated.displayName,
      email: updated.email,
      phone: updated.phone,
      role: updated.role,
      isActive: updated.isActive,
      securityQuestion: updated.securityQuestion,
      lastSeenAt: updated.lastSeenAt?.toISOString() ?? null,
      online: isUserOnline(updated.lastSeenAt),
      invoiceCount: updated._count.invoices,
      activityCount: updated._count.activities,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    console.error('Admin user patch error:', e);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
