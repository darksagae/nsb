import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/admin-auth';
import { invoiceToSalesPayload } from '@/lib/invoice-sync';
import { prisma } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string; invoiceNumber: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id, invoiceNumber } = await params;
  const userId = Number(id);
  const number = decodeURIComponent(invoiceNumber).trim();

  if (!Number.isFinite(userId) || !number) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { userId, invoiceNumber: number },
      include: { vehicle: { include: { brand: true } } },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const payload = invoiceToSalesPayload(invoice as Record<string, unknown>);
    return NextResponse.json({
      invoice: {
        ...payload,
        webId: invoice.id,
        pdfUrl: invoice.pdfUrl,
        pdfGeneratedAt: invoice.pdfGeneratedAt?.toISOString() ?? null,
        pdfSource: invoice.pdfSource,
        pdfReady: invoice.pdfUrl != null,
        machinePdfReady: invoice.pdfUrl != null,
        cfPriceUsd: invoice.cfPriceUsd,
        cfMombasaUsd: invoice.cfMombasaUsd,
        cfKampalaUsd: invoice.cfKampalaUsd,
        cifUsd: invoice.cifUsd,
        clearanceFeeUsd: invoice.clearanceFeeUsd,
        ttChargesUsd: invoice.ttChargesUsd,
        importDutyUgx: invoice.importDutyUgx,
        exciseDutyUgx: invoice.exciseDutyUgx,
        vatUgx: invoice.vatUgx,
        totalTaxUgx: invoice.totalTaxUgx,
        grandTotalUgx: invoice.grandTotalUgx,
        firstInstallmentUgx: invoice.firstInstallmentUgx,
        secondInstallmentUgx: invoice.secondInstallmentUgx,
        portFrom: invoice.portFrom,
        portTo: invoice.portTo,
        finalDestination: invoice.finalDestination,
        notes: invoice.notes,
      },
    });
  } catch (e) {
    console.error('Admin get invoice error:', e);
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdminApi(request);
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id, invoiceNumber } = await params;
  const userId = Number(id);
  const number = decodeURIComponent(invoiceNumber).trim();

  if (!Number.isFinite(userId) || !number) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  try {
    const invoice = await prisma.invoice.findFirst({
      where: { userId, invoiceNumber: number },
    });
    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    await prisma.invoice.delete({ where: { id: invoice.id } });

    await prisma.clientActivity.create({
      data: {
        userId,
        action: 'admin_delete_invoice',
        metadata: { invoiceNumber: number, by: admin.username },
      },
    });

    await prisma.adminCommand.create({
      data: {
        userId,
        command: 'delete_local_invoice',
        payload: { invoiceNumber: number },
      },
    });

    return NextResponse.json({ ok: true, invoiceNumber: number });
  } catch (e) {
    console.error('Admin delete invoice error:', e);
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 });
  }
}
