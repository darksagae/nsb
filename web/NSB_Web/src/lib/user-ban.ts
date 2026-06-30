import { prisma } from '@/lib/db';

export function isUserBanned(user: {
  isActive: boolean;
  machineLocked: boolean;
  bannedUntil: Date | null;
}): { banned: boolean; message: string } {
  if (!user.isActive) {
    return { banned: true, message: 'Your account has been disabled. Contact the administrator.' };
  }
  if (user.bannedUntil && user.bannedUntil.getTime() > Date.now()) {
    return {
      banned: true,
      message: 'You are temporarily banned. Contact the administrator.',
    };
  }
  if (user.machineLocked) {
    return {
      banned: true,
      message: 'This system is temporarily locked by the administrator.',
    };
  }
  return { banned: false, message: '' };
}

export async function getUserBanState(userId: number) {
  const user = await prisma.salesUser.findUnique({
    where: { id: userId },
    select: {
      isActive: true,
      machineLocked: true,
      lockMessage: true,
      bannedUntil: true,
    },
  });
  if (!user) return { banned: true, message: 'Account not found.' };
  const base = isUserBanned(user);
  if (base.banned && user.lockMessage?.trim()) {
    return { banned: true, message: user.lockMessage.trim() };
  }
  return base;
}
