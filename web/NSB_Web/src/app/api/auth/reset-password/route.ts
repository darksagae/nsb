import { NextRequest, NextResponse } from 'next/server';
import { resetControlAdminPassword } from '@/lib/password-reset';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = String(body.token ?? '').trim();
    const password = String(body.password ?? '');

    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 });
    }

    const result = await resetControlAdminPassword(token, password);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: 'Password updated. You can sign in with your new password.',
    });
  } catch (e) {
    console.error('Reset password error:', e);
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
