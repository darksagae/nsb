import { prisma } from '@/lib/db';
import { isUserOnline } from '@/lib/admin-auth';
import { invoicePdfIsReady } from '@/lib/invoice-pdf-s3';
import {
  completePendingGenerateCommands,
  generateAndAttachInvoicePdfServer,
} from '@/lib/invoice-pdf-server';

const STALE_COMMAND_MS = 45_000;

/** Queue sales machine (or control fallback) to generate PDF, upload, and finalize. */
export async function queueGenerateInvoice(
  userId: number,
  invoiceNumber: string,
  opts?: { finalize?: boolean },
) {
  const trimmed = invoiceNumber.trim();
  if (!trimmed) return null;

  const invoice = await prisma.invoice.findFirst({
    where: { userId, invoiceNumber: trimmed },
    select: { pdfUrl: true, machineFinalized: true },
  });
  if (!invoice) return null;

  const finalize = opts?.finalize !== false;
  if (invoicePdfIsReady(invoice) && invoice.machineFinalized && finalize) {
    return null;
  }

  const pending = await prisma.adminCommand.findFirst({
    where: {
      userId,
      status: 'pending',
      command: { in: ['generate_invoice', 'ensure_invoice_pdf'] },
      payload: { path: ['invoiceNumber'], equals: trimmed },
    },
    select: { id: true },
  });
  if (pending) {
    await maybeServerFallbackForUser(userId, trimmed, finalize).catch((err) => {
      console.error('maybeServerFallbackForUser failed:', err);
    });
    return pending;
  }

  const salesUser = await prisma.salesUser.findUnique({
    where: { id: userId },
    select: { desktopLastSeenAt: true },
  });
  const desktopOnline = isUserOnline(salesUser?.desktopLastSeenAt);

  const cmd = await prisma.adminCommand.create({
    data: {
      userId,
      command: 'generate_invoice',
      payload: {
        invoiceNumber: trimmed,
        finalize,
        fallbackControl: !desktopOnline,
      },
    },
  });

  if (!desktopOnline) {
    void maybeServerFallbackForUser(userId, trimmed, finalize).catch((err) => {
      console.error('Server PDF fallback failed:', err);
    });
  }

  return cmd;
}

async function maybeServerFallbackForUser(
  userId: number,
  invoiceNumber: string,
  finalize: boolean,
): Promise<boolean> {
  const salesUser = await prisma.salesUser.findUnique({
    where: { id: userId },
    select: { desktopLastSeenAt: true },
  });
  if (isUserOnline(salesUser?.desktopLastSeenAt)) return false;

  const invoice = await prisma.invoice.findFirst({
    where: { userId, invoiceNumber },
    select: { pdfUrl: true },
  });
  if (invoicePdfIsReady(invoice ?? {})) {
    await completePendingGenerateCommands(userId, invoiceNumber);
    return true;
  }

  const result = await generateAndAttachInvoicePdfServer(userId, invoiceNumber, 'control_panel');
  if (!result.ok) {
    console.error(`Server PDF for ${invoiceNumber}: ${result.error}`);
    return false;
  }

  if (finalize) {
    await prisma.invoice.updateMany({
      where: { userId, invoiceNumber },
      data: { machineFinalized: true },
    });
  }

  await completePendingGenerateCommands(userId, invoiceNumber);
  return true;
}

/**
 * Process invoices missing PDFs when the sales machine is offline.
 * Called from the control app heartbeat and admin tools.
 */
export async function processInvoicePdfFallbacks(opts?: {
  userId?: number;
  max?: number;
}): Promise<{ processed: number; attempted: number }> {
  const max = opts?.max ?? 8;
  const userFilter = opts?.userId != null ? { userId: opts.userId } : {};

  const missing = await prisma.invoice.findMany({
    where: {
      ...userFilter,
      pdfUrl: null,
      OR: [{ machineFinalized: true }, { status: 'sent' }],
    },
    select: {
      userId: true,
      invoiceNumber: true,
      user: { select: { desktopLastSeenAt: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: max,
  });

  let processed = 0;
  let attempted = 0;

  for (const inv of missing) {
    if (inv.userId == null || inv.user == null) continue;
    if (isUserOnline(inv.user.desktopLastSeenAt)) {
      await queueGenerateInvoice(inv.userId, inv.invoiceNumber, { finalize: true }).catch(() => {});
      continue;
    }

    attempted++;
    const ok = await maybeServerFallbackForUser(inv.userId, inv.invoiceNumber, true);
    if (ok) processed++;
  }

  const staleCutoff = new Date(Date.now() - STALE_COMMAND_MS);
  const staleCommands = await prisma.adminCommand.findMany({
    where: {
      ...userFilter,
      status: 'pending',
      command: { in: ['generate_invoice', 'ensure_invoice_pdf'] },
      createdAt: { lt: staleCutoff },
    },
    select: {
      userId: true,
      payload: true,
      user: { select: { desktopLastSeenAt: true } },
    },
    take: max,
  });

  for (const cmd of staleCommands) {
    if (isUserOnline(cmd.user.desktopLastSeenAt)) continue;
    const payload = cmd.payload as { invoiceNumber?: string; finalize?: boolean } | null;
    const number = payload?.invoiceNumber?.trim();
    if (!number) continue;

    attempted++;
    const finalize = payload?.finalize !== false;
    const ok = await maybeServerFallbackForUser(cmd.userId, number, finalize);
    if (ok) processed++;
  }

  return { processed, attempted };
}

/** Unlock editing on the sales machine and optionally open the invoice editor. */
export async function queueUnlockInvoiceEdit(userId: number, invoiceNumber: string, openEditor = true) {
  const trimmed = invoiceNumber.trim();
  if (!trimmed) return null;

  await prisma.invoice.updateMany({
    where: { userId, invoiceNumber: trimmed },
    data: { machineFinalized: false },
  });

  return prisma.adminCommand.create({
    data: {
      userId,
      command: 'unlock_invoice_edit',
      payload: { invoiceNumber: trimmed, openEditor },
    },
  });
}
