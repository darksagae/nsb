import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { bindUserMachine } from '@/lib/machine-auth';
import { prisma } from '@/lib/db';

/** Link an admin-created cloud account to this desktop machine (one-time). */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const machineId = String(body.machineId ?? '').trim();
    const machineName = body.machineName ? String(body.machineName).trim() : null;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }
    if (!machineId) {
      return NextResponse.json({ error: 'Machine identity is required' }, { status: 400 });
    }

    const user = await prisma.salesUser.findUnique({ where: { username } });
    if (!user || user.passwordHash !== hashPassword(password)) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }

    const bindResult = await bindUserMachine(user.id, machineId, machineName);
    if (!bindResult.ok) {
      return NextResponse.json(
        {
          error:
            bindResult.code === 'wrong_machine'
              ? 'Invalid user for this machine'
              : bindResult.message,
          code: bindResult.code,
        },
        { status: bindResult.code === 'machine_taken' ? 409 : 403 },
      );
    }

    await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'machine_bound',
        metadata: {
          machineId,
          machineName,
          source: 'sales_system',
          freshMachineBind: bindResult.freshMachineBind === true,
        },
      },
    });

    return NextResponse.json({
      ok: true,
      assignedMachineId: machineId,
      assignedMachineName: machineName,
      freshMachineBind: bindResult.freshMachineBind === true,
    });
  } catch (e) {
    console.error('Bind machine error:', e);
    return NextResponse.json({ error: 'Failed to link device' }, { status: 500 });
  }
}
