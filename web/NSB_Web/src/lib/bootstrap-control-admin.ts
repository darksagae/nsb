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
 * Bootstrap the single control-panel account from env on first deploy.
 * Username and email stay aligned with env; password lives in the database only
 * (initial seed from env, then email reset / manual updates — never overwritten).
 */
export async function ensureControlAdminFromEnv() {
  const { username, password, email } = controlAdminEnv();

  const byUsername = await prisma.controlAdmin.findUnique({ where: { username } });
  if (byUsername) {
    return prisma.controlAdmin.update({
      where: { id: byUsername.id },
      data: { email },
    });
  }

  const existing = await prisma.controlAdmin.findFirst();
  if (existing) {
    return prisma.controlAdmin.update({
      where: { id: existing.id },
      data: { username, email },
    });
  }

  if (!password) {
    console.warn(
      'CONTROL_ADMIN_PASSWORD is not set and no control_admins row exists. Control panel login and email reset will not work until the account is created.',
    );
    return null;
  }

  return prisma.controlAdmin.create({
    data: {
      username,
      passwordHash: hashPassword(password),
      email,
      displayName: 'Control Panel Admin',
    },
  });
}

/** @deprecated Use ensureControlAdminFromEnv */
export async function ensureControlAdminExists(): Promise<void> {
  await ensureControlAdminFromEnv();
}
