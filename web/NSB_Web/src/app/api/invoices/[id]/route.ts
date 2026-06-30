import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { queueGenerateInvoice, queueUnlockInvoiceEdit } from '@/lib/invoice-generate-queue';
import { invoicePdfIsReady } from '@/lib/invoice-pdf-s3';
import { requireSession } from '@/lib/require-session';

async function getInvoiceForSession(
  id: number,
  opts: { admin: boolean; userId: number | null },
) {
  return prisma.invoice.findFirst({
    where: {
      id,
      ...(opts.admin ? {} : { userId: opts.userId! }),
    },
    include: { vehicle: { include: { brand: true } } },
  });
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, admin, response } = await requireSession(request);
  if (response) return response;

  try {
    const invoice = await getInvoiceForSession(Number(params.id), {
      admin: !!admin,
      userId: user?.id ?? null,
    });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch invoice' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, admin, response } = await requireSession(request);
  if (response) return response;

  try {
    const id = Number(params.id);
    const existing = await getInvoiceForSession(id, {
      admin: !!admin,
      userId: user?.id ?? null,
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (existing.machineFinalized) {
      return NextResponse.json(
        { error: 'Invoice is finalized. Use Unlock Edit before making changes.', code: 'machine_finalized' },
        { status: 409 },
      );
    }

    const body = await request.json();

    const data: Record<string, unknown> = {};
    const allowed = [
      'status','consigneeName','consigneeAddress','consigneeCity','consigneeCountry',
      'consigneePhone','consigneeEmail','notifyParty','portFrom','portTo','finalDestination',
      'blIssueAt','prepaidAt','shippingMark','chassisNo','refNo','vehicleMake','vehicleModel',
      'vehicleYear','vehicleColor','vehicleMileage','vehicleTransmission','vehicleDriveType',
      'vehicleDoors','vehiclePassengers','vehicleFuelType','vehicleSteering','vehicleEngineCC',
      'vehicleWeightKG','vehicleDimension','vehicleInspection','cifUsd','cfMombasaUsd','clearanceFeeUsd','cfKampalaUsd',
      'ttChargesUsd','exchangeRate','exchangeRatePhase2','firstInstallmentUgx','cfPriceUsd','quantityUnits',
      'paymentTerms','paymentDueDate','taxesURA','numberPlatesFee','thirdPartyInsurance',
      'agencyFees','importDutyUgx','exciseDutyUgx','vatUgx','infrastructureLevy',
      'environmentalLevy','withholdingTax','registrationFee',
      'idfUgx','stampDutyUgx','regFormUgx',
      'totalTaxUgx','secondInstallmentUgx','grandTotalUgx','notes','vehicleId',
      'tickCfMombasa','tickClearance','tickCfKampala','includePhaseTwo','includeTaxToUra','dutyFree'
    ] as const;

    for (const key of allowed) {
      if (key in body) {
        if (key === 'paymentDueDate' && body[key]) {
          data[key] = new Date(body[key]);
        } else if (key === 'vehicleId') {
          data[key] = body[key] ? Number(body[key]) : null;
        } else {
          data[key] = body[key] ?? null;
        }
      }
    }

    const triggerGenerate = body.triggerGenerate === true;
    if (triggerGenerate) {
      data.status = body.status === 'draft' ? 'sent' : (body.status ?? 'sent');
      data.machineFinalized = true;
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data,
      include: { vehicle: { include: { brand: true } } },
    });

    await prisma.clientActivity.create({
      data: {
        userId: existing.userId!,
        action: 'update_invoice',
        metadata: { invoice_number: updated.invoiceNumber, source: admin ? 'control_panel' : 'web' },
      },
    });

    if (triggerGenerate || !invoicePdfIsReady(updated)) {
      await queueGenerateInvoice(existing.userId!, updated.invoiceNumber, { finalize: true }).catch(
        (err) => console.error('queueGenerateInvoice failed:', err),
      );
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to update invoice' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const { user, admin, response } = await requireSession(request);
  if (response) return response;

  try {
    const id = Number(params.id);
    const existing = await getInvoiceForSession(id, {
      admin: !!admin,
      userId: user?.id ?? null,
    });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.invoice.delete({ where: { id } });

    await prisma.clientActivity.create({
      data: {
        userId: existing.userId!,
        action: 'delete_invoice',
        metadata: { invoice_number: existing.invoiceNumber, source: admin ? 'control_panel' : 'web' },
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to delete invoice' }, { status: 500 });
  }
}
