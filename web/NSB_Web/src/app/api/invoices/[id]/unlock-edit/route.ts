import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { queueUnlockInvoiceEdit } from '@/lib/invoice-generate-queue';
import { requireSession } from '@/lib/require-session';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, admin, response } = await requireSession(request);
  if (response) return response;

  try {
    const id = Number(params.id);
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        ...(admin ? {} : { userId: user!.id }),
      },
      select: { id: true, invoiceNumber: true, userId: true },
    });
    if (!invoice?.userId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const openEditor = body.openEditor !== false;

    await queueUnlockInvoiceEdit(invoice.userId, invoice.invoiceNumber, openEditor);

    await prisma.clientActivity.create({
      data: {
        userId: invoice.userId,
        action: 'unlock_invoice_edit',
        metadata: {
          invoice_number: invoice.invoiceNumber,
          source: admin ? 'control_panel' : 'web',
          openEditor,
        },
      },
    });

    return NextResponse.json({ ok: true, invoiceNumber: invoice.invoiceNumber });
  } catch (e) {
    console.error('unlock-edit error:', e);
    return NextResponse.json({ error: 'Failed to unlock invoice' }, { status: 500 });
  }
}
