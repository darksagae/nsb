import { timingSafeEqual } from 'crypto';
import { hashPassword } from '@/lib/auth';
import { encryptPasswordPlain } from '@/lib/password-vault';
import { prisma } from '@/lib/db';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

/** Normalize an answer so "Kampala", "kampala ", and "KAMPALA" all match. */
function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function hashSecurityAnswer(answer: string): string {
  return hashPassword(normalizeAnswer(answer));
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function getSecurityQuestion(
  username: string,
): Promise<{ ok: true; question: string } | { ok: false; error: string }> {
  const user = await prisma.salesUser.findUnique({ where: { username } });
  if (!user?.isActive || !user.securityQuestion || !user.securityAnswerHash) {
    return {
      ok: false,
      error:
        'Security question recovery isn’t set up for this account. Contact your administrator.',
    };
  }
  if (user.securityLockedUntil && user.securityLockedUntil > new Date()) {
    return {
      ok: false,
      error: 'Too many incorrect answers. Try again later or contact your administrator.',
    };
  }
  return { ok: true, question: user.securityQuestion };
}

export async function answerSecurityQuestion(
  username: string,
  answer: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string; attemptsRemaining?: number }> {
  if (newPassword.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters' };
  }

  const user = await prisma.salesUser.findUnique({ where: { username } });
  if (!user?.isActive || !user.securityQuestion || !user.securityAnswerHash) {
    return {
      ok: false,
      error:
        'Security question recovery isn’t set up for this account. Contact your administrator.',
    };
  }

  if (user.securityLockedUntil && user.securityLockedUntil > new Date()) {
    return { ok: false, error: 'Too many incorrect answers. Try again later or contact your administrator.' };
  }

  const givenHash = hashSecurityAnswer(answer);
  const correct = safeEqual(givenHash, user.securityAnswerHash);

  if (!correct) {
    const attempts = user.securityFailedAttempts + 1;
    const lockedUntil = attempts >= MAX_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MS) : null;
    await prisma.salesUser.update({
      where: { id: user.id },
      data: {
        securityFailedAttempts: lockedUntil ? 0 : attempts,
        securityLockedUntil: lockedUntil,
      },
    });
    if (lockedUntil) {
      return { ok: false, error: 'Too many incorrect answers. Account locked for 15 minutes.' };
    }
    return {
      ok: false,
      error: 'That answer doesn’t match our records.',
      attemptsRemaining: MAX_ATTEMPTS - attempts,
    };
  }

  const passwordHash = hashPassword(newPassword);
  const passwordEnc = encryptPasswordPlain(newPassword);

  await prisma.$transaction([
    prisma.salesUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordEnc,
        securityFailedAttempts: 0,
        securityLockedUntil: null,
      },
    }),
    prisma.adminCommand.create({
      data: {
        userId: user.id,
        command: 'sync_users',
        payload: {
          users: [
            {
              username: user.username,
              password_hash: passwordHash,
              role: user.role,
            },
          ],
        },
      },
    }),
    prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'security_question_reset',
        metadata: { source: 'sales_system' },
      },
    }),
  ]);

  return { ok: true };
}
