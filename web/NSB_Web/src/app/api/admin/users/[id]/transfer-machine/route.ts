import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const userId = Number((await params).id);
  if (!Number.isFinite(userId)) {
    return NextResponse.json({ error: 'Invalid user id' }, { status: 400 });
  }

  try {
    const user = await prisma.salesUser.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.assignedMachineId) {
      return NextResponse.json(
        { error: 'Account is not linked to a machine' },
        { status: 400 },
      );
    }

    const oldMachineId = user.assignedMachineId;
    const oldMachineName = user.assignedMachineName;

    await prisma.salesUser.update({
      where: { id: userId },
      data: {
        blockedMachineId: oldMachineId,
        blockedMachineName: oldMachineName,
        assignedMachineId: null,
        assignedMachineName: null,
      },
    });

    await prisma.adminCommand.createMany({
      data: [
        { userId, command: 'logout_user', payload: {} },
        { userId, command: 'clear_local_data', payload: {} },
      ],
    });

    await prisma.clientActivity.create({
      data: {
        userId,
        action: 'admin_machine_transfer',
        metadata: {
          by: admin.username,
          oldMachineId,
          oldMachineName,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      blockedMachineId: oldMachineId,
      blockedMachineName: oldMachineName,
      message:
        'Machine unlinked. User must sign in on the replacement PC and tap "Link this device".',
    });
  } catch (e) {
    console.error('Admin transfer machine error:', e);
    return NextResponse.json({ error: 'Failed to transfer machine' }, { status: 500 });
  }
}
