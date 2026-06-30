import { createHash, randomBytes } from 'crypto';
import { hashPassword } from '@/lib/auth';
import { sendResendEmail } from '@/lib/email';
import { prisma } from '@/lib/db';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function resetBaseUrl(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
  if (appUrl) {
    const base = appUrl.startsWith('http') ? appUrl : `https://${appUrl}`;
    return base.replace(/\/+$/, '');
  }
  return 'http://localhost:3000';
}

export async function sendControlAdminPasswordReset(
  username: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await prisma.controlAdmin.findUnique({ where: { username } });
  if (!admin?.isActive) {
    return { ok: false, error: 'Control panel account not found' };
  }

  const to = admin.email?.trim();
  if (!to) {
    return { ok: false, error: 'No email is configured for this control panel account' };
  }

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await prisma.adminPasswordResetToken.updateMany({
    where: { adminId: admin.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const tokenRecord = await prisma.adminPasswordResetToken.create({
    data: {
      adminId: admin.id,
      tokenHash,
      expiresAt,
    },
  });

  const resetUrl = `${resetBaseUrl()}/admin/reset-password?token=${encodeURIComponent(rawToken)}`;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 25px;">
      <h1 style="color: #0f172a;">NSB Motors Ug</h1>
      <p>Hello${admin.displayName ? ` ${admin.displayName}` : ''},</p>
      <p>We received a request to reset your control panel password for username <strong>${admin.username}</strong>.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;text-decoration:none;border-radius:8px;">Reset password</a></p>
      <p style="color:#64748b;font-size:14px;">This link expires in 1 hour. If you did not request this, you can ignore this email.</p>
      <p style="color:#64748b;font-size:12px;word-break:break-all;">${resetUrl}</p>
    </div>`;

  const text = `Reset your NSB Motors control panel password for ${admin.username}:\n\n${resetUrl}\n\nThis link expires in 1 hour.`;

  const result = await sendResendEmail({
    to,
    subject: 'Reset your NSB Motors control panel password',
    html,
    text,
  });

  if (!result.ok) {
    await prisma.adminPasswordResetToken.delete({ where: { id: tokenRecord.id } }).catch(() => {});
    console.error('Control admin password reset email failed:', result.error);
    return {
      ok: false,
      error:
        result.error === 'Email service not configured'
          ? 'Email service is not configured on the server'
          : 'Could not send reset email. Contact support.',
    };
  }

  return { ok: true };
}

export async function resetControlAdminPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!token || newPassword.length < 6) {
    return { ok: false, error: 'Invalid token or password too short' };
  }

  const tokenHash = hashToken(token);
  const record = await prisma.adminPasswordResetToken.findFirst({
    where: {
      tokenHash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { admin: true },
  });

  if (!record?.admin?.isActive) {
    return { ok: false, error: 'Invalid or expired reset link' };
  }

  await prisma.$transaction([
    prisma.controlAdmin.update({
      where: { id: record.adminId },
      data: { passwordHash: hashPassword(newPassword) },
    }),
    prisma.adminPasswordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true };
}
