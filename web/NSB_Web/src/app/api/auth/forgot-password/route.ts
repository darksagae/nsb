import { NextRequest, NextResponse } from 'next/server';
import { ensureControlAdminFromEnv } from '@/lib/bootstrap-control-admin';
import { sendControlAdminPasswordReset } from '@/lib/password-reset';
import { prisma } from '@/lib/db';

const SALES_RESET_MESSAGE =
  'If this account exists, the administrator will reset your password using the mobile control app.';

const CONTROL_EMAIL_MESSAGE =
  'A password reset link has been sent to the registered control panel email.';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim();
    const source =
      body.source === 'sales_system'
        ? 'sales_system'
        : body.source === 'control_panel'
          ? 'control_panel'
          : 'web';
    const machineName = body.machineName ? String(body.machineName).trim() : null;

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    // Email reset — mobile control panel account (ControlAdmin) only.
    if (source === 'control_panel') {
      const bootstrapped = await ensureControlAdminFromEnv();
      if (!bootstrapped) {
        return NextResponse.json(
          { error: 'Control panel is not configured on the server' },
          { status: 503 },
        );
      }

      const result = await sendControlAdminPasswordReset(username);
      if (!result.ok) {
        const status =
          result.error.includes('not configured') || result.error.includes('Could not send')
            ? 503
            : 400;
        return NextResponse.json({ error: result.error }, { status });
      }

      return NextResponse.json({
        ok: true,
        message: CONTROL_EMAIL_MESSAGE,
      });
    }

    // Machine + web sales accounts — reset by admin in mobile control, not email.
    const user = await prisma.salesUser.findUnique({ where: { username } });
    if (user?.isActive) {
      await prisma.clientActivity.create({
        data: {
          userId: user.id,
          action: 'password_reset_request',
          metadata: { source, machineName },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: SALES_RESET_MESSAGE,
    });
  } catch (e) {
    console.error('Forgot password error:', e);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
