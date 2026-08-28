import { renderToBuffer } from '@react-pdf/renderer';

import { prisma } from '@/lib/db';
import { buildInvoicePDF } from '@/lib/invoice-pdf';
import { attachInvoicePdfFromBuffer, invoicePdfIsReady } from '@/lib/invoice-pdf-s3';
import type { PdfSource } from '@/lib/invoice-pdf-queue';

/**
 * Renders an invoice PDF on the server and stores it, so an invoice created on
 * the web is viewable straight away instead of sitting at "pending" until a
 * sales machine comes online and fulfils the queued generate command.
 *
 * The sales machine's own PDF still wins. `attachInvoicePdfFromBuffer` returns
 * the existing file untouched when one is already stored, and the machine
 * uploads through its own path, so a server-rendered copy only ever fills the
 * gap before a machine has produced one.
 */
export async function generateAndAttachInvoicePdfServer(
  userId: number,
  invoiceNumber: string,
  pdfSource: PdfSource = 'control_panel',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { userId, invoiceNumber: invoiceNumber.trim() },
    });
    if (!invoice) return { ok: false, error: 'Invoice not found' };
    if (invoicePdfIsReady(invoice)) return { ok: true };

    const settingRows = await prisma.setting.findMany();
    const settings: Record<string, string> = {};
    for (const row of settingRows) settings[row.key] = row.value;

    // buildInvoicePDF reads the same fields the machine's renderer does; the
    // Prisma row carries all of them.
    const buffer = await renderToBuffer(
      buildInvoicePDF(invoice as never, settings) as never,
    );

    const stored = await attachInvoicePdfFromBuffer(
      userId,
      invoice.invoiceNumber,
      Buffer.from(buffer),
      pdfSource,
    );
    if (!stored.ok) return { ok: false, error: stored.error };

    return { ok: true };
  } catch (e) {
    console.error(`Server PDF render failed for ${invoiceNumber}:`, e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'Server PDF render failed',
    };
  }
}

/**
 * Closes out generate commands queued for an invoice whose PDF now exists, so
 * a machine coming online later does not redo work that is already done.
 */
export async function completePendingGenerateCommands(
  userId: number,
  invoiceNumber: string,
): Promise<void> {
  await prisma.adminCommand.updateMany({
    where: {
      userId,
      status: 'pending',
      command: { in: ['generate_invoice', 'ensure_invoice_pdf'] },
      payload: { path: ['invoiceNumber'], equals: invoiceNumber.trim() },
    },
    data: { status: 'completed' },
  });
}
