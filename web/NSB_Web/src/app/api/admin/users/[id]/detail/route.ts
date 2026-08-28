import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { invoiceToSalesPayload } from '@/lib/invoice-sync';
import { prisma } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const userId = Number((await params).id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    const user = await prisma.salesUser.findUnique({
      where: { id: userId },
      include: {
        _count: { select: { invoices: true, activities: true } },
        activities: { orderBy: { createdAt: 'desc' }, take: 30 },
        invoices: { orderBy: { updatedAt: 'desc' }, take: 100 },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const customerMap = new Map<string, { name: string; phone: string | null; email: string | null; invoiceCount: number }>();
    for (const inv of user.invoices) {
      const key = `${inv.consigneeName}|${inv.consigneePhone ?? ''}`;
      const existing = customerMap.get(key);
      if (existing) {
        existing.invoiceCount += 1;
      } else {
        customerMap.set(key, {
          name: inv.consigneeName,
          phone: inv.consigneePhone,
          email: inv.consigneeEmail,
          invoiceCount: 1,
        });
      }
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        isActive: user.isActive,
        machineLocked: user.machineLocked,
        lockMessage: user.lockMessage,
        bannedUntil: user.bannedUntil?.toISOString() ?? null,
        assignedMachineId: user.assignedMachineId,
        assignedMachineName: user.assignedMachineName,
        blockedMachineId: user.blockedMachineId,
        blockedMachineName: user.blockedMachineName,
        transferPending: user.assignedMachineId == null && user.blockedMachineId != null,
        // The question itself is safe to show an admin; the answer is only
        // ever stored hashed, so it is never returned.
        securityQuestion: user.securityQuestion,
        securityLockedUntil: user.securityLockedUntil?.toISOString() ?? null,
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        invoiceCount: user._count.invoices,
        activityCount: user._count.activities,
      },
      invoices: user.invoices.map((inv) => invoiceToSalesPayload(inv as Record<string, unknown>)),
      customers: Array.from(customerMap.values()).sort((a, b) => b.invoiceCount - a.invoiceCount),
      activities: user.activities.map((a) => ({
        id: a.id,
        action: a.action,
        metadata: a.metadata,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error('Admin user detail error:', e);
    return NextResponse.json({ error: 'Failed to load user detail' }, { status: 500 });
  }
}
