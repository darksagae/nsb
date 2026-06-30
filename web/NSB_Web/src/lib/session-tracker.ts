import { prisma } from '@/lib/db';

export type SessionSource = 'web' | 'sales_system' | 'control_panel';

export type SessionMeta = {
  source: SessionSource;
  machineName?: string | null;
  ip?: string | null;
  appVersion?: string | null;
};

export async function updateUserSession(userId: number, meta: SessionMeta) {
  const now = new Date();
  const data: Record<string, unknown> = {
    lastSeenAt: now,
  };

  if (meta.machineName) data.lastMachineName = meta.machineName;
  if (meta.ip) data.lastIp = meta.ip;
  if (meta.appVersion) data.lastAppVersion = meta.appVersion;

  if (meta.source === 'web') {
    data.webLastSeenAt = now;
  } else {
    data.desktopLastSeenAt = now;
  }

  await prisma.salesUser.update({
    where: { id: userId },
    data,
  });
}

/** Clears web presence so control panels show the user as offline immediately. */
export async function clearUserWebSession(userId: number) {
  await prisma.salesUser.update({
    where: { id: userId },
    data: { webLastSeenAt: null },
  });
}

/** Clears desktop presence when the sales app locks out or signs out. */
export async function clearUserDesktopSession(userId: number) {
  await prisma.salesUser.update({
    where: { id: userId },
    data: { desktopLastSeenAt: null },
  });
}
