import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateInvoiceNumber } from '@/lib/invoice-number';
import { resolveInvoiceOwnerUserId } from '@/lib/invoice-access';
import { queueGenerateInvoice } from '@/lib/invoice-generate-queue';
import { invoicePdfIsReady } from '@/lib/invoice-pdf-s3';
import { requireSession } from '@/lib/require-session';

export async function GET(request: NextRequest) {
  const { user, admin, response } = await requireSession(request);
  if (response) return response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    const invoices = await prisma.invoice.findMany({
      where: {
        ...(admin ? {} : { userId: user!.id }),
        ...(status ? { status } : {}),
      },
      include: { vehicle: { include: { brand: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(invoices);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { user, admin, response } = await requireSession(request);
  if (response) return response;

  try {
    const body = await request.json();

    if (!body.consigneeName?.trim()) {
      return NextResponse.json({ error: 'consigneeName is required' }, { status: 400 });
    }

    const ownerUserId = await resolveInvoiceOwnerUserId({
      isAdmin: !!admin,
      salesUserId: body.salesUserId ? Number(body.salesUserId) : null,
      sessionUserId: user?.id ?? null,
    });
    if (!ownerUserId) {
      return NextResponse.json(
        { error: 'No active sales account to assign this invoice to' },
        { status: 400 },
      );
    }

    const inv = await prisma.invoice.create({
      data: {
        userId: ownerUserId,
        invoiceNumber: 'PENDING',
        status: body.status || 'draft',
        vehicleId: body.vehicleId ? Number(body.vehicleId) : null,
        consigneeName: body.consigneeName.trim(),
        consigneeAddress: body.consigneeAddress || null,
        consigneeCity: body.consigneeCity || null,
        consigneeCountry: body.consigneeCountry || null,
        consigneePhone: body.consigneePhone || null,
        consigneeEmail: body.consigneeEmail || null,
        notifyParty: body.notifyParty || 'SAME AS CONSIGNEE',
        portFrom: body.portFrom || null,
        portTo: body.portTo || null,
        finalDestination: body.finalDestination || null,
        blIssueAt: body.blIssueAt || null,
        prepaidAt: body.prepaidAt || null,
        shippingMark: body.shippingMark || null,
        chassisNo: body.chassisNo || null,
        refNo: body.refNo || null,
        vehicleMake: body.vehicleMake || null,
        vehicleModel: body.vehicleModel || null,
        vehicleYear: body.vehicleYear ? Number(body.vehicleYear) : null,
        vehicleColor: body.vehicleColor || null,
        vehicleMileage: body.vehicleMileage ? Number(body.vehicleMileage) : null,
        vehicleTransmission: body.vehicleTransmission || null,
        vehicleDriveType: body.vehicleDriveType || null,
        vehicleDoors: body.vehicleDoors ? Number(body.vehicleDoors) : null,
        vehiclePassengers: body.vehiclePassengers ? Number(body.vehiclePassengers) : null,
        vehicleFuelType: body.vehicleFuelType || null,
        vehicleSteering: body.vehicleSteering || null,
        vehicleEngineCC: body.vehicleEngineCC ? Number(body.vehicleEngineCC) : null,
        vehicleWeightKG: body.vehicleWeightKG ? Number(body.vehicleWeightKG) : null,
        vehicleDimension: body.vehicleDimension || null,
        vehicleInspection: body.vehicleInspection || 'With Pre-ship Inspection',
        cifUsd: body.cifUsd ? Number(body.cifUsd) : null,
        tickCfMombasa: body.tickCfMombasa ?? true,
        cfMombasaUsd: body.cfMombasaUsd ? Number(body.cfMombasaUsd) : null,
        tickClearance: body.tickClearance ?? false,
        clearanceFeeUsd: body.clearanceFeeUsd ? Number(body.clearanceFeeUsd) : null,
        cfKampalaUsd: body.cfKampalaUsd ? Number(body.cfKampalaUsd) : null,
        ttChargesUsd: body.ttChargesUsd ? Number(body.ttChargesUsd) : null,
        tickCfKampala: body.tickCfKampala ?? false,
        exchangeRate: body.exchangeRate ? Number(body.exchangeRate) : null,
        exchangeRatePhase2: body.exchangeRatePhase2 ? Number(body.exchangeRatePhase2) : null,
        firstInstallmentUgx: body.firstInstallmentUgx ? Number(body.firstInstallmentUgx) : null,
        cfPriceUsd: body.cfPriceUsd ? Number(body.cfPriceUsd) : null,
        quantityUnits: body.quantityUnits ? Number(body.quantityUnits) : 1,
        paymentTerms: body.paymentTerms || null,
        paymentDueDate: body.paymentDueDate ? new Date(body.paymentDueDate) : null,
        includePhaseTwo: body.includePhaseTwo ?? false,
        includeTaxToUra: body.dutyFree ? false : (body.includeTaxToUra ?? true),
        dutyFree: body.dutyFree ?? false,
        taxesURA: body.taxesURA ? Number(body.taxesURA) : null,
        numberPlatesFee: body.numberPlatesFee ? Number(body.numberPlatesFee) : 714300,
        thirdPartyInsurance: body.thirdPartyInsurance ? Number(body.thirdPartyInsurance) : null,
        agencyFees: body.agencyFees ? Number(body.agencyFees) : null,
        importDutyUgx: body.importDutyUgx ? Number(body.importDutyUgx) : null,
        exciseDutyUgx: body.exciseDutyUgx ? Number(body.exciseDutyUgx) : null,
        vatUgx: body.vatUgx ? Number(body.vatUgx) : null,
        infrastructureLevy: body.infrastructureLevy ? Number(body.infrastructureLevy) : null,
        environmentalLevy: body.environmentalLevy ? Number(body.environmentalLevy) : null,
        withholdingTax: body.withholdingTax ? Number(body.withholdingTax) : null,
        registrationFee: body.registrationFee ? Number(body.registrationFee) : null,
        idfUgx: body.idfUgx ? Number(body.idfUgx) : null,
        stampDutyUgx: body.stampDutyUgx ? Number(body.stampDutyUgx) : null,
        regFormUgx: body.regFormUgx ? Number(body.regFormUgx) : null,
        totalTaxUgx: body.totalTaxUgx ? Number(body.totalTaxUgx) : null,
        secondInstallmentUgx: body.secondInstallmentUgx ? Number(body.secondInstallmentUgx) : null,
        grandTotalUgx: body.grandTotalUgx ? Number(body.grandTotalUgx) : null,
        notes: body.notes || null,
      },
    });

    const invoiceNumber = generateInvoiceNumber(inv.id);
    const triggerGenerate = body.triggerGenerate === true;
    const updated = await prisma.invoice.update({
      where: { id: inv.id },
      data: {
        invoiceNumber,
        ...(triggerGenerate
          ? { status: body.status === 'draft' ? 'sent' : (body.status || 'sent'), machineFinalized: true }
          : {}),
      },
      include: { vehicle: { include: { brand: true } } },
    });

    await prisma.clientActivity.create({
      data: {
        userId: ownerUserId,
        action: 'create_invoice',
        metadata: {
          invoice_number: invoiceNumber,
          source: admin ? 'control_panel' : 'web',
          triggerGenerate,
        },
      },
    });

    if (triggerGenerate || !invoicePdfIsReady(updated)) {
      await queueGenerateInvoice(ownerUserId, invoiceNumber, { finalize: true }).catch((err) => {
        console.error('queueGenerateInvoice failed:', err);
      });
    }

    return NextResponse.json(updated, { status: 201 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'Failed to create invoice' }, { status: 500 });
  }
}
