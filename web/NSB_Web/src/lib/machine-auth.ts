import { prisma } from '@/lib/db';

export type MachineCheckResult =
  | { ok: true; freshMachineBind?: boolean }
  | { ok: false; code: 'machine_required' | 'wrong_machine' | 'machine_not_bound' | 'machine_taken'; message: string };

export async function machineIdTakenByOther(machineId: string, exceptUserId?: number): Promise<boolean> {
  const existing = await prisma.salesUser.findFirst({
    where: {
      assignedMachineId: machineId,
      ...(exceptUserId != null ? { NOT: { id: exceptUserId } } : {}),
    },
    select: { id: true },
  });
  return existing != null;
}

export function checkDesktopMachineAccess(
  assignedMachineId: string | null | undefined,
  machineId: string | null | undefined,
): MachineCheckResult {
  const id = machineId?.trim();
  if (!id) {
    return {
      ok: false,
      code: 'machine_required',
      message: 'Machine identity is required for desktop login',
    };
  }
  if (!assignedMachineId) {
    return {
      ok: false,
      code: 'machine_not_bound',
      message: 'This account is not linked to a device yet. Activate this machine or use web access.',
    };
  }
  if (assignedMachineId !== id) {
    return {
      ok: false,
      code: 'wrong_machine',
      message: 'Invalid user for this machine',
    };
  }
  return { ok: true };
}

export function isMachineRevoked(
  assignedMachineId: string | null | undefined,
  machineId: string | null | undefined,
): boolean {
  const id = machineId?.trim();
  if (!id) return false;
  if (!assignedMachineId) return true;
  return assignedMachineId !== id;
}

export async function bindUserMachine(
  userId: number,
  machineId: string,
  machineName?: string | null,
): Promise<MachineCheckResult> {
  const id = machineId.trim();
  if (!id) {
    return { ok: false, code: 'machine_required', message: 'Machine identity is required' };
  }

  const user = await prisma.salesUser.findUnique({ where: { id: userId } });
  if (!user) {
    return { ok: false, code: 'wrong_machine', message: 'Invalid user for this machine' };
  }

  if (user.blockedMachineId && user.blockedMachineId === id) {
    return {
      ok: false,
      code: 'wrong_machine',
      message: 'This device was replaced. Contact administrator.',
    };
  }

  if (user.assignedMachineId && user.assignedMachineId !== id) {
    return {
      ok: false,
      code: 'wrong_machine',
      message: 'This account is already linked to another machine',
    };
  }

  if (await machineIdTakenByOther(id, userId)) {
    return {
      ok: false,
      code: 'machine_taken',
      message: 'This machine is already registered to another account',
    };
  }

  const freshMachineBind = user.blockedMachineId != null && user.blockedMachineId !== id;

  await prisma.salesUser.update({
    where: { id: userId },
    data: {
      assignedMachineId: id,
      assignedMachineName: machineName?.trim() || user.assignedMachineName || null,
      blockedMachineId: null,
      blockedMachineName: null,
    },
  });

  return { ok: true, freshMachineBind };
}

/** Drop logout/wipe commands queued for another session (e.g. after machine transfer). */
export async function clearStaleDesktopLogoutCommands(userId: number): Promise<void> {
  await prisma.adminCommand.updateMany({
    where: {
      userId,
      status: 'pending',
      command: { in: ['logout_user', 'clear_local_data'] },
    },
    data: {
      status: 'cancelled',
      result: 'Superseded by a new desktop sign-in',
      processedAt: new Date(),
    },
  });
}
