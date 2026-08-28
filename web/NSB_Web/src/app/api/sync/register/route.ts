import { NextRequest, NextResponse } from 'next/server';
import { hashPassword } from '@/lib/auth';
import { encryptPasswordPlain } from '@/lib/password-vault';
import { machineIdTakenByOther } from '@/lib/machine-auth';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const displayName = String(body.displayName ?? body.username ?? '').trim() || username;
    const role = String(body.role ?? 'user');
    const machineId = String(body.machineId ?? '').trim();
    const machineName = body.machineName ? String(body.machineName).trim() : null;

    if (!username || username.length < 3) {
      return NextResponse.json({ error: 'Username must be at least 3 characters' }, { status: 400 });
    }
    if (!password || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }
    if (!machineId) {
      return NextResponse.json({ error: 'Machine identity is required for device registration' }, { status: 400 });
    }

    const existing = await prisma.salesUser.findUnique({ where: { username } });
    if (existing) {
      // Coded so the desktop can tell this apart from machine_taken: it means
      // the cloud already holds this account under a different password, which
      // the user has to reset rather than register again.
      return NextResponse.json(
        { error: 'Username already exists', code: 'username_taken' },
        { status: 409 },
      );
    }

    if (await machineIdTakenByOther(machineId)) {
      return NextResponse.json(
        { error: 'This machine is already registered to another account', code: 'machine_taken' },
        { status: 409 },
      );
    }

    const user = await prisma.salesUser.create({
      data: {
        username,
        passwordHash: hashPassword(password),
        passwordEnc: encryptPasswordPlain(password),
        role,
        displayName,
        assignedMachineId: machineId,
        assignedMachineName: machineName,
      },
    });

    await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'user_register',
        metadata: { source: 'sales_system', machineId, machineName },
      },
    });

    return NextResponse.json(
      {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        assignedMachineId: user.assignedMachineId,
      },
      { status: 201 },
    );
  } catch (e) {
    console.error('Register error:', e);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
