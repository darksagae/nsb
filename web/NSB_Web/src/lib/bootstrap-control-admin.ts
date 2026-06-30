import { hashPassword } from '@/lib/auth';
import { prisma } from '@/lib/db';

function controlAdminEnv() {
  return {
    username: (process.env.CONTROL_ADMIN_USERNAME ?? 'NSBMotors').trim(),
    password: process.env.CONTROL_ADMIN_PASSWORD?.trim() ?? '',
    email: (process.env.CONTROL_ADMIN_EMAIL ?? 'info@nsbmotors.com').trim(),
  };
}

/**
 * Keep the single control-panel account aligned with env (username, email, password).
 * Mobile control uses this account only — separate from sales machine users.
 */
export async function ensureControlAdminFromEnv() {
  const { username, password, email } = controlAdminEnv();

  if (!password) {
    console.warn(
      'CONTROL_ADMIN_PASSWORD is not set. Control panel login and email reset will not work.',
    );
    return prisma.controlAdmin.findFirst();
  }

  const passwordHash = hashPassword(password);
  const byUsername = await prisma.controlAdmin.findUnique({ where: { username } });
  if (byUsername) {
    return prisma.controlAdmin.update({
      where: { id: byUsername.id },
      data: { email, passwordHash },
    });
  }

  const existing = await prisma.controlAdmin.findFirst();
  if (existing) {
    return prisma.controlAdmin.update({
      where: { id: existing.id },
      data: { username, email, passwordHash },
    });
  }

  return prisma.controlAdmin.create({
    data: {
      username,
      passwordHash,
      email,
      displayName: 'Control Panel Admin',
    },
  });
}

/** @deprecated Use ensureControlAdminFromEnv */
export async function ensureControlAdminExists(): Promise<void> {
  await ensureControlAdminFromEnv();
}
