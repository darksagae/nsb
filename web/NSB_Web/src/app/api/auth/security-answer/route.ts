import { NextRequest, NextResponse } from 'next/server';
import { answerSecurityQuestion } from '@/lib/security-question';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim();
    const answer = String(body.answer ?? '');
    const newPassword = String(body.newPassword ?? '');

    if (!username || !answer || !newPassword) {
      return NextResponse.json(
        { error: 'Username, answer, and new password are required' },
        { status: 400 },
      );
    }

    const result = await answerSecurityQuestion(username, answer, newPassword);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, attemptsRemaining: result.attemptsRemaining },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Password updated. You can sign in with your new password.',
    });
  } catch (e) {
    console.error('Security answer error:', e);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
