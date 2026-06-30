import type { Prisma } from '@prisma/client';

const STATUS_MAP: Record<number, string> = {
  0: 'draft',
  1: 'sent',
  2: 'pending',
  3: 'paid',
  4: 'overdue',
  5: 'cancelled',
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

/** Map sales_system sync payload → Prisma invoice fields */
export function salesPayloadToInvoiceData(
  body: Record<string, unknown>,
  userId: number,
): Prisma.InvoiceCreateInput {
  const statusRaw = body.status;
  const status =
    typeof statusRaw === 'number'
      ? STATUS_MAP[statusRaw] ?? 'draft'
      : str(statusRaw) ?? 'draft';

  const customer = (body.customer as Record<string, unknown> | undefined) ?? {};
  const modelSuffix = str(body.vehicleModelSuffix);
  const baseModel = str(body.vehicleModel) ?? '';
  const vehicleModel = modelSuffix ? `${baseModel} / ${modelSuffix}` : baseModel || null;

  const engineRaw = str(body.engineSize) ?? str(body.vehicleEngineCC);
  let vehicleEngineCC: number | null = null;
  if (engineRaw) {
    const parsed = parseInt(engineRaw.replace(/[^\d]/g, ''), 10);
    vehicleEngineCC = Number.isFinite(parsed) ? parsed : null;
  }

  return {
    user: { connect: { id: userId } },
    salesSystemId: num(body.salesSystemId) ?? num(body.id) ?? undefined,
    invoiceNumber: str(body.invoiceNumber) ?? `SYNC-${Date.now()}`,
    status,
    consigneeName: str(customer.name) ?? str(body.consigneeName) ?? 'N/A',
    consigneeAddress: str(customer.address) ?? str(body.consigneeAddress),
    consigneeCity: str(customer.city) ?? str(body.consigneeCity),
    consigneeCountry: str(body.countryOfOrigin) ?? str(body.consigneeCountry),
    consigneePhone: str(customer.phone) ?? str(body.consigneePhone) ?? 'N/A',
    consigneeEmail: str(customer.email) ?? str(body.consigneeEmail) ?? 'N/A',
    chassisNo: str(body.chassisNo),
    refNo: str(body.stockNo) ?? str(body.refNo),
    vehicleMake: str(body.vehicleMake),
    vehicleModel: vehicleModel || null,
    vehicleYear: num(body.vehicleYear),
    vehicleColor: str(body.color) ?? str(body.vehicleColor),
    vehicleFuelType: str(body.fuelType) ?? str(body.vehicleFuelType),
    vehicleTransmission: str(body.transmission) ?? str(body.vehicleTransmission),
    vehicleEngineCC,
    cifUsd: num(body.carPriceUSD) ?? num(body.cifUsd),
    dutyFree: body.dutyFree === true,
    includeTaxToUra: body.dutyFree === true ? false : (body.includeTaxToUra !== false),
    machineFinalized: body.machineFinalized === true || body.isFinalized === true,
    tickCfMombasa: body.tickCfMombasa !== false,
    cfMombasaUsd: num(body.carPriceUSD) ?? num(body.cfMombasaUsd),
    tickClearance: (num(body.clearanceFeeUSD) ?? 0) > 0,
    clearanceFeeUsd: num(body.clearanceFeeUSD) ?? num(body.clearanceFeeUsd),
    exchangeRate: num(body.exchangeRate),
    firstInstallmentUgx: num(body.firstInstallmentUGX) ?? num(body.firstInstallmentUgx),
    taxesURA: num(body.taxesURA),
    numberPlatesFee: num(body.numberPlatesFee) ?? 714300,
    thirdPartyInsurance: num(body.thirdPartyInsurance),
    agencyFees: num(body.agencyFees),
    secondInstallmentUgx: num(body.secondInstallmentUGX) ?? num(body.secondInstallmentUgx),
    grandTotalUgx: num(body.totalAmount) ?? num(body.grandTotalUgx),
    paymentDueDate: body.dueDate ? new Date(String(body.dueDate)) : body.paymentDueDate ? new Date(String(body.paymentDueDate)) : null,
    notes: str(body.notes),
    quantityUnits: 1,
    includePhaseTwo: (num(body.secondInstallmentUGX) ?? num(body.secondInstallmentUgx) ?? 0) > 0,
  };
}

/** Prisma update fields (no user relation) */
export function salesPayloadToInvoiceUpdateData(body: Record<string, unknown>) {
  const { user: _user, ...createData } = salesPayloadToInvoiceData(body, 0);
  return createData;
}
export function invoiceToSalesPayload(invoice: Record<string, unknown>) {
  return {
    id: invoice.salesSystemId ?? invoice.id,
    salesSystemId: invoice.salesSystemId,
    webId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    consigneeName: invoice.consigneeName,
    consigneeAddress: invoice.consigneeAddress,
    consigneeCity: invoice.consigneeCity,
    consigneeCountry: invoice.consigneeCountry,
    consigneePhone: invoice.consigneePhone,
    consigneeEmail: invoice.consigneeEmail,
    chassisNo: invoice.chassisNo,
    stockNo: invoice.refNo,
    refNo: invoice.refNo,
    vehicleMake: invoice.vehicleMake,
    vehicleModel: invoice.vehicleModel,
    vehicleYear: invoice.vehicleYear,
    color: invoice.vehicleColor,
    fuelType: invoice.vehicleFuelType,
    transmission: invoice.vehicleTransmission,
    vehicleEngineCC: invoice.vehicleEngineCC,
    carPriceUSD: invoice.cifUsd ?? invoice.cfMombasaUsd,
    clearanceFeeUSD: invoice.clearanceFeeUsd,
    exchangeRate: invoice.exchangeRate,
    firstInstallmentUGX: invoice.firstInstallmentUgx,
    taxesURA: invoice.taxesURA,
    numberPlatesFee: invoice.numberPlatesFee,
    thirdPartyInsurance: invoice.thirdPartyInsurance,
    agencyFees: invoice.agencyFees,
    secondInstallmentUGX: invoice.secondInstallmentUgx,
    totalAmount: invoice.grandTotalUgx,
    dueDate: invoice.paymentDueDate,
    notes: invoice.notes,
    pdfUrl: invoice.pdfUrl,
    pdfGeneratedAt: invoice.pdfGeneratedAt,
    pdfSource: invoice.pdfSource,
    pdfReady: invoice.pdfUrl != null,
    machinePdfReady: invoice.pdfUrl != null,
    includeTaxToUra: invoice.includeTaxToUra,
    dutyFree: invoice.dutyFree,
    machineFinalized: invoice.machineFinalized,
    isFinalized: invoice.machineFinalized === true,
    customer: {
      name: invoice.consigneeName,
      email: invoice.consigneeEmail,
      phone: invoice.consigneePhone,
      address: invoice.consigneeAddress,
      city: invoice.consigneeCity,
    },
    updatedAt: invoice.updatedAt,
    createdAt: invoice.createdAt,
  };
}
