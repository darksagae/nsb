import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { invoiceNumber: string } },
) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const invoiceNumber = decodeURIComponent(params.invoiceNumber);

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { userId: user.id, invoiceNumber },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.invoice.delete({ where: { id: invoice.id } });

    await prisma.clientActivity.create({
      data: {
        userId: user.id,
        action: 'delete_invoice',
        metadata: { invoice_number: invoiceNumber, source: 'sales_system' },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('Invoice delete sync error:', e);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
}
