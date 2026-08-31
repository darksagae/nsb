import { NextRequest, NextResponse } from 'next/server';
import {
  createSessionToken,
  getSessionAdmin,
  getSessionUser,
  hashPassword,
  sessionCookieOptions,
} from '@/lib/auth';
import { ensureControlAdminFromEnv } from '@/lib/bootstrap-control-admin';
import { encryptPasswordPlain } from '@/lib/password-vault';
import {
  bindUserMachine,
  checkDesktopMachineAccess,
  clearStaleDesktopLogoutCommands,
} from '@/lib/machine-auth';
import { updateUserSession } from '@/lib/session-tracker';
import { getUserBanState } from '@/lib/user-ban';
import { prisma } from '@/lib/db';

function controlAdminPayload(admin: {
  id: number;
  username: string;
  displayName: string | null;
  email: string;
}) {
  return {
    id: admin.id,
    username: admin.username,
    displayName: admin.displayName,
    email: admin.email,
    phone: null,
    role: 'admin',
    isAdmin: true,
  };
}

function salesUserPayload(user: {
  id: number;
  username: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  role: string;
}) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isAdmin: false,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim();
    const password = String(body.password ?? '');
    const source =
      body.source === 'sales_system'
        ? 'sales_system'
        : body.source === 'control_panel'
          ? 'control_panel'
          : 'web';

    const machineId = body.machineId ? String(body.machineId).trim() : null;
    const machineName = body.machineName ? String(body.machineName).trim() : null;
    const activateDevice = body.activateDevice === true;

    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
    }

    // Mobile control centre — ControlAdmin only (e.g. developer1). Email reset applies here only.
    if (source === 'control_panel') {
      const bootstrapped = await ensureControlAdminFromEnv();
      if (!bootstrapped) {
        return NextResponse.json(
          { error: 'Control panel is not configured on the server' },
          { status: 503 },
        );
      }

      const admin = await prisma.controlAdmin.findUnique({ where: { username } });
      if (!admin || admin.passwordHash !== hashPassword(password)) {
        return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
      }
      if (!admin.isActive) {
        return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
      }

      await prisma.controlAdmin.update({
        where: { id: admin.id },
        data: { lastSeenAt: new Date() },
      });

      const token = createSessionToken({
        userId: admin.id,
        username: admin.username,
        kind: 'admin',
      });

      return NextResponse.json({
        token,
        user: controlAdminPayload(admin),
      });
    }

    // Web portal — same SalesUser credentials as the sales machine (no machine binding).
    if (source === 'web') {
      const user = await prisma.salesUser.findUnique({ where: { username } });
      if (!user || user.passwordHash !== hashPassword(password)) {
        return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
      }
      if (!user.isActive) {
        return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
      }

      const ban = await getUserBanState(user.id);
      if (ban.banned) {
        return NextResponse.json({ error: ban.message, code: 'banned' }, { status: 403 });
      }

      await prisma.salesUser.update({
        where: { id: user.id },
        data: {
          passwordEnc: user.passwordEnc ?? encryptPasswordPlain(password),
        },
      });

      await updateUserSession(user.id, {
        source: 'web',
        machineName: 'Web',
      });

      const token = createSessionToken({
        userId: user.id,
        username: user.username,
        kind: 'sales',
      });

      await prisma.clientActivity.create({
        data: {
          userId: user.id,
          action: 'user_login',
          metadata: { source: 'web' },
        },
      });

      const response = NextResponse.json({
        token,
        user: salesUserPayload(user),
      });
      response.cookies.set(sessionCookieOptions(token));
      return response;
    }

    // Desktop sales system — sales users only, never control admins.
    const user = await prisma.salesUser.findUnique({ where: { username } });
    if (!user || user.passwordHash !== hashPassword(password)) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }

    const ban = await getUserBanState(user.id);
    if (ban.banned) {
      return NextResponse.json({ error: ban.message, code: 'banned' }, { status: 403 });
    }

    let machineCheck = checkDesktopMachineAccess(user.assignedMachineId, machineId);

    if (!machineCheck.ok && body.guestMode === true) {
      // Correct credentials, different device, explicit guest request — issue a
      // session without touching machine binding at all. This user's own
      // assignedMachineId is left alone, and the borrowed machine's owner (if any)
      // is never affected. The desktop client is responsible for never persisting
      // this session or writing its data to the local database.
      const token = createSessionToken({
        userId: user.id,
        username: user.username,
        kind: 'sales',
      });

      await prisma.clientActivity.create({
        data: {
          userId: user.id,
          action: 'guest_login',
          metadata: {
            source: 'sales_system',
            machineId,
            machineName,
            ownMachineId: user.assignedMachineId,
          },
        },
      });

      return NextResponse.json({
        token,
        user: salesUserPayload(user),
        guestSession: true,
      });
    }

    if (!machineCheck.ok && machineCheck.code === 'machine_not_bound' && activateDevice) {
      const bindResult = await bindUserMachine(user.id, machineId!, machineName);
      if (!bindResult.ok) {
        return NextResponse.json(
          { error: bindResult.message, code: bindResult.code },
          { status: bindResult.code === 'machine_taken' ? 409 : 403 },
        );
      }
      machineCheck = checkDesktopMachineAccess(machineId, machineId);
      const token = createSessionToken({
        userId: user.id,
        username: user.username,
        kind: 'sales',
      });

      await prisma.salesUser.update({
        where: { id: user.id },
        data: {
          passwordEnc: user.passwordEnc ?? encryptPasswordPlain(password),
        },
      });

      await updateUserSession(user.id, {
        source: 'sales_system',
        machineName: machineName ?? 'Desktop',
      });

      await clearStaleDesktopLogoutCommands(user.id);

      await prisma.clientActivity.create({
        data: {
          userId: user.id,
          action: 'user_login',
          metadata: {
            source: 'sales_system',
            machineId,
            freshMachineBind: bindResult.freshMachineBind === true,
          },
        },
      });

      return NextResponse.json({
        token,
        user: salesUserPayload(user),
        freshMachineBind: bindResult.freshMachineBind === true,
      });
    }

    if (!machineCheck.ok) {
      if (machineCheck.code === 'wrong_machine') {
        // Correct credentials, wrong device — worth a visible trail for admins,
        // since it's the signature of someone trying this account on a machine
        // that isn't theirs (e.g. a friend's PC).
        await prisma.clientActivity.create({
          data: {
            userId: user.id,
            action: 'foreign_machine_login_attempt',
            metadata: {
              source: 'sales_system',
              attemptedMachineId: machineId,
              attemptedMachineName: machineName,
              ownMachineId: user.assignedMachineId,
              ownMachineName: user.assignedMachineName,
            },
          },
        });
      }
      return NextResponse.json(
        {
          error:
            machineCheck.code === 'wrong_machine'
              ? 'Invalid user for this machine'
              : machineCheck.message,
          code: machineCheck.code,
        },
        { status: 403 },
      );
    }

    await prisma.salesUser.update({
      where: { id: user.id },
      data: {
        passwordEnc: user.passwordEnc ?? encryptPasswordPlain(password),
      },
    });

    await updateUserSession(user.id, {
      source: 'sales_system',
      machineName: machineName ?? 'Desktop',
    });

    await clearStaleDesktopLogoutCommands(user.id);

    const token = createSessionToken({
      userId: user.id,
      username: user.username,
      kind: 'sales',
    });

    await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'user_login',
        metadata: {
          source: 'sales_system',
          machineId,
        },
      },
    });

    return NextResponse.json({
      token,
      user: salesUserPayload(user),
    });
  } catch (e) {
    console.error('Login error:', e);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (admin) {
    return NextResponse.json({ user: controlAdminPayload(admin) });
  }

  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ user: salesUserPayload(user) });
}
