import { prisma } from '@/lib/db';
import { isUserOnline } from '@/lib/admin-auth';
import { invoicePdfIsReady } from '@/lib/invoice-pdf-s3';

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
  if (pending) return pending;

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

  return cmd;
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
