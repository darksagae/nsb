import { NextRequest, NextResponse } from 'next/server';
import { getSecurityQuestion } from '@/lib/security-question';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim();
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const result = await getSecurityQuestion(username);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, question: result.question });
  } catch (e) {
    console.error('Security question lookup error:', e);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
