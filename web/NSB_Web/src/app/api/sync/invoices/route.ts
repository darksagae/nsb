import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { invoiceToSalesPayload, salesPayloadToInvoiceData, salesPayloadToInvoiceUpdateData } from '@/lib/invoice-sync';

export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const invoices = await prisma.invoice.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
    });
    return NextResponse.json(invoices.map((inv) => invoiceToSalesPayload(inv as Record<string, unknown>)));
  } catch (e) {
    console.error('Invoice list sync error:', e);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const salesSystemId = body.salesSystemId ?? body.id;
    const invoiceNumber = String(body.invoiceNumber ?? '').trim();

    if (!invoiceNumber) {
      return NextResponse.json({ error: 'invoiceNumber is required' }, { status: 400 });
    }

    const data = salesPayloadToInvoiceData(body, user.id);

    let invoice = await prisma.invoice.findFirst({
      where: {
        userId: user.id,
        OR: [
          ...(salesSystemId != null ? [{ salesSystemId: Number(salesSystemId) }] : []),
          { invoiceNumber },
        ],
      },
    });

    if (invoice) {
      const updateData = salesPayloadToInvoiceUpdateData(body);
      invoice = await prisma.invoice.update({
        where: { id: invoice.id },
        data: updateData,
      });
    } else {
      invoice = await prisma.invoice.create({ data });
    }

    const action =
      body._deleted === true
        ? 'delete_invoice'
        : invoice.createdAt.getTime() === invoice.updatedAt.getTime()
          ? 'create_invoice'
          : 'update_invoice';
    if (!body._deleted) {
      await prisma.clientActivity.create({
        data: {
          userId: user.id,
          action,
          metadata: {
            invoice_number: invoice.invoiceNumber,
            source: body.source ?? 'sales_system',
          },
        },
      });
    }

    return NextResponse.json(invoiceToSalesPayload(invoice as Record<string, unknown>));
  } catch (e) {
    console.error('Invoice sync error:', e);
    return NextResponse.json({ error: 'Invoice sync failed' }, { status: 500 });
  }
}
