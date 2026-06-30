import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const commandId = Number((await params).id);
  if (!Number.isFinite(commandId)) {
    return NextResponse.json({ error: 'Invalid command id' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const status = body.status === 'failed' ? 'failed' : 'completed';
  const result = body.result ? String(body.result) : null;

  const cmd = await prisma.adminCommand.findFirst({
    where: { id: commandId, userId: user.id },
  });
  if (!cmd) {
    return NextResponse.json({ error: 'Command not found' }, { status: 404 });
  }

  await prisma.adminCommand.update({
    where: { id: commandId },
    data: {
      status,
      result,
      processedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
