import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isMachineRevoked } from '@/lib/machine-auth';
import { getUserBanState } from '@/lib/user-ban';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ban = await getUserBanState(user.id);
  if (ban.banned) {
    return NextResponse.json({ banned: true, message: ban.message });
  }

  const machineId = request.nextUrl.searchParams.get('machineId')?.trim() || null;
  const salesUser = await prisma.salesUser.findUnique({
    where: { id: user.id },
    select: { assignedMachineId: true },
  });

  const machineRevoked =
    machineId != null && isMachineRevoked(salesUser?.assignedMachineId, machineId);

  const commands = await prisma.adminCommand.findMany({
    where: { userId: user.id, status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 10,
  });

  return NextResponse.json({
    banned: false,
    machineRevoked,
    commands: commands.map((c) => ({
      id: c.id,
      command: c.command,
      payload: c.payload,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
