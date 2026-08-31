import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { hashSecurityAnswer } from '@/lib/security-question';
import { prisma } from '@/lib/db';

/**
 * Self-service security question for the signed-in sales user.
 *
 * GET  -> whether a question is on file (and the question text, never the answer)
 * POST -> set/replace the caller's own question + answer
 *
 * Authenticated with the user's own sync bearer token, so the answer is only
 * ever seen by the person setting it — the admin flow in
 * /api/admin/users/[id] stays as a fallback.
 */

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    hasSecurityQuestion: !!user.securityQuestion && !!user.securityAnswerHash,
    question: user.securityQuestion ?? null,
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const question = String(body.question ?? '').trim();
    const answer = String(body.answer ?? '').trim();

    if (!question || !answer) {
      return NextResponse.json(
        { error: 'Both a question and an answer are required' },
        { status: 400 },
      );
    }
    if (answer.length < 2) {
      return NextResponse.json({ error: 'Answer is too short' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.salesUser.update({
        where: { id: user.id },
        data: {
          securityQuestion: question,
          securityAnswerHash: hashSecurityAnswer(answer),
          securityFailedAttempts: 0,
          securityLockedUntil: null,
        },
      }),
      prisma.clientActivity.create({
        data: {
          userId: user.id,
          action: 'security_question_set',
          metadata: { source: body.source ?? 'sales_system', selfService: true },
        },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Self-service security question error:', e);
    return NextResponse.json({ error: 'Request failed' }, { status: 500 });
  }
}
