import { prisma } from '@/lib/db';
import { invoicePdfIsReady } from '@/lib/invoice-pdf-s3';

export type PdfSource = 'sales_system' | 'control_panel';

/** Queue desktop/control to generate and upload PDF when missing. */
export async function queueEnsureInvoicePdf(userId: number, invoiceNumber: string) {
  const trimmed = invoiceNumber.trim();
  if (!trimmed) return null;

  const invoice = await prisma.invoice.findFirst({
    where: { userId, invoiceNumber: trimmed },
    select: { pdfUrl: true },
  });
  if (invoicePdfIsReady(invoice ?? {})) return null;

  const existing = await prisma.adminCommand.findFirst({
    where: {
      userId,
      status: 'pending',
      command: 'ensure_invoice_pdf',
      payload: { path: ['invoiceNumber'], equals: trimmed },
    },
    select: { id: true },
  });
  if (existing) return existing;

  // Re-queue if a prior run completed but PDF is still missing (silent failure on desktop).
  const lastDone = await prisma.adminCommand.findFirst({
    where: {
      userId,
      command: 'ensure_invoice_pdf',
      status: { in: ['completed', 'failed'] },
      payload: { path: ['invoiceNumber'], equals: trimmed },
    },
    orderBy: { processedAt: 'desc' },
    select: { id: true, processedAt: true, status: true },
  });
  if (
    lastDone?.processedAt &&
    lastDone.status === 'completed' &&
    Date.now() - lastDone.processedAt.getTime() < 5 * 60 * 1000
  ) {
    return null;
  }

  return prisma.adminCommand.create({
    data: {
      userId,
      command: 'ensure_invoice_pdf',
      payload: { invoiceNumber: trimmed },
    },
  });
}
