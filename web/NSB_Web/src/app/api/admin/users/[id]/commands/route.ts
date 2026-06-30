import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { prisma } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

const ALLOWED = new Set([
  'lock_machine',
  'unlock_machine',
  'clear_local_data',
  'push_invoice',
  'ensure_invoice_pdf',
  'generate_invoice',
  'unlock_invoice_edit',
  'logout_user',
]);

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
    const body = await request.json();
    const command = String(body.command ?? '').trim();
    const payload = body.payload ?? {};

    if (!ALLOWED.has(command)) {
      return NextResponse.json({ error: 'Unknown command' }, { status: 400 });
    }

    const user = await prisma.salesUser.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (command === 'lock_machine') {
      const message =
        String(payload.message ?? '').trim() ||
        'You are temporarily banned. Contact NSB Motors administrator.';
      const hours = Number(payload.hours ?? 24);
      const bannedUntil = Number.isFinite(hours) && hours > 0
        ? new Date(Date.now() + hours * 60 * 60 * 1000)
        : null;

      await prisma.salesUser.update({
        where: { id: userId },
        data: {
          machineLocked: true,
          lockMessage: message,
          bannedUntil,
        },
      });

      await prisma.adminCommand.create({
        data: {
          userId,
          command: 'lock_screen',
          payload: { message },
        },
      });

      await prisma.clientActivity.create({
        data: {
          userId,
          action: 'admin_lock_machine',
          metadata: { by: admin.username, message, hours },
        },
      });

      return NextResponse.json({ ok: true, command, message });
    }

    if (command === 'unlock_machine') {
      await prisma.salesUser.update({
        where: { id: userId },
        data: {
          machineLocked: false,
          lockMessage: null,
          bannedUntil: null,
        },
      });

      await prisma.adminCommand.create({
        data: { userId, command: 'unlock_screen', payload: {} },
      });

      await prisma.clientActivity.create({
        data: {
          userId,
          action: 'admin_unlock_machine',
          metadata: { by: admin.username },
        },
      });

      return NextResponse.json({ ok: true, command });
    }

    const cmd = await prisma.adminCommand.create({
      data: {
        userId,
        command,
        payload,
      },
    });

    await prisma.clientActivity.create({
      data: {
        userId,
        action: 'admin_remote_command',
        metadata: { by: admin.username, command, commandId: cmd.id },
      },
    });

    return NextResponse.json({ ok: true, commandId: cmd.id, command });
  } catch (e) {
    console.error('Admin command error:', e);
    return NextResponse.json({ error: 'Failed to send command' }, { status: 500 });
  }
}
