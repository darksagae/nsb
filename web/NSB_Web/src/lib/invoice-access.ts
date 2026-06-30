import { prisma } from '@/lib/db';

/** Sales user to attach new invoices to when created by control admin or web session. */
export async function resolveInvoiceOwnerUserId(opts: {
  isAdmin: boolean;
  salesUserId?: number | null;
  sessionUserId?: number | null;
}): Promise<number | null> {
  if (!opts.isAdmin) {
    return opts.sessionUserId ?? opts.salesUserId ?? null;
  }

  if (opts.salesUserId) {
    const target = await prisma.salesUser.findFirst({
      where: { id: opts.salesUserId, isActive: true },
      select: { id: true },
    });
    if (target) return target.id;
  }

  const first = await prisma.salesUser.findFirst({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return first?.id ?? null;
}
