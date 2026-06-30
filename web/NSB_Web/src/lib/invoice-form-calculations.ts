/** Mirrors sales_system invoice_form_screen.dart phase 1 / phase 2 / grand total math. */

export function isEnvironmentalLevyApplicable(
  vehicleYear: number,
  referenceYear = new Date().getFullYear(),
): boolean {
  if (!vehicleYear || vehicleYear <= 0) return false;
  return vehicleYear <= referenceYear - 10;
}

export type UraTaxComponentFields = {
  importDuty: number;
  vat: number;
  withholdingTax: number;
  environmentalLevy: number;
  idf: number;
  infrastructureLevy: number;
  registrationFee: number;
  stampDuty: number;
  regForm: number;
};

/** sales_system _phaseTwoUraTaxesTotal — excise duty excluded */
export function sumUraTaxComponents(fields: UraTaxComponentFields): number {
  return (
    fields.importDuty +
    fields.vat +
    fields.withholdingTax +
    fields.environmentalLevy +
    fields.idf +
    fields.infrastructureLevy +
    fields.registrationFee +
    fields.stampDuty +
    fields.regForm
  );
}

export type InvoiceFormTotalsInput = {
  tickCfMombasa: boolean;
  tickClearance: boolean;
  tickCfKampala: boolean;
  cfMombasaUsd: number;
  clearanceFeeUsd: number;
  cfKampalaUsd: number;
  ttChargesUsd: number;
  exchangeRatePhase1: number;
  cifUsd: number;
  exchangeRateTax: number;
  vehicleYear: number;
  referenceYear: number;
  includeTaxToUra: boolean;
  dutyFree: boolean;
  includePhaseTwo: boolean;
  numberPlatesFee: number;
  thirdPartyInsurance: number;
  agencyFees: number;
  registrationFee: number;
  stampDuty: number;
  regForm: number;
};

export type UraTaxBreakdown = {
  customsValueUgx: number;
  importDuty: number;
  vat: number;
  withholdingTax: number;
  environmentalLevy: number;
  idf: number;
  infrastructureLevy: number;
  registrationFee: number;
  stampDuty: number;
  regForm: number;
  total: number;
};

/** Same components as sales_system _phaseTwoUraTaxesTotal (excise excluded). */
export function computeUraTaxBreakdown(input: InvoiceFormTotalsInput): UraTaxBreakdown {
  const cv = input.cifUsd * input.exchangeRateTax;
  if (cv <= 0) {
    return {
      customsValueUgx: 0,
      importDuty: 0,
      vat: 0,
      withholdingTax: 0,
      environmentalLevy: 0,
      idf: 0,
      infrastructureLevy: 0,
      registrationFee: 0,
      stampDuty: 0,
      regForm: 0,
      total: 0,
    };
  }

  const idf = cv * 0.01;
  const importDuty = cv * 0.25;
  const vat = (cv + importDuty) * 0.18;
  const withholdingTax = cv * 0.06;
  const infrastructureLevy = cv * 0.015;
  const environmentalLevy = isEnvironmentalLevyApplicable(input.vehicleYear, input.referenceYear)
    ? cv * 0.5
    : 0;
  const registrationFee = 1_500_000;
  const stampDuty = 18_000;
  const regForm = 35_000;
  const total =
    importDuty +
    vat +
    withholdingTax +
    environmentalLevy +
    idf +
    infrastructureLevy +
    registrationFee +
    stampDuty +
    regForm;

  return {
    customsValueUgx: cv,
    importDuty,
    vat,
    withholdingTax,
    environmentalLevy,
    idf,
    infrastructureLevy,
    registrationFee,
    stampDuty,
    regForm,
    total,
  };
}

/** Registration fee + stamp + reg form only (duty-free vehicles). */
export function sumDutyFreeFees(fields: Pick<UraTaxComponentFields, 'registrationFee' | 'stampDuty' | 'regForm'>): number {
  return fields.registrationFee + fields.stampDuty + fields.regForm;
}

/** sales_system _phaseTwoUraTaxesTotal */
export function computePhaseTwoUraTaxes(
  input: InvoiceFormTotalsInput,
): number {
  if (input.dutyFree) {
    return sumDutyFreeFees({
      registrationFee: input.registrationFee,
      stampDuty: input.stampDuty,
      regForm: input.regForm,
    });
  }
  if (!input.includeTaxToUra) return 0;
  return computeUraTaxBreakdown(input).total;
}

/** sales_system _phaseOneTotal — sum all selected options (max 2) + TT */
export function computePhaseOneTotalUsd(input: InvoiceFormTotalsInput): number {
  let total = 0;
  if (input.tickCfMombasa) total += input.cfMombasaUsd;
  if (input.tickClearance) total += input.clearanceFeeUsd;
  if (input.tickCfKampala) total += input.cfKampalaUsd;
  const ttUsd = input.ttChargesUsd > 0 ? input.ttChargesUsd : 40;
  return total + ttUsd;
}

export function computePhaseOneTotal(input: InvoiceFormTotalsInput): number {
  return computePhaseOneTotalUsd(input) * input.exchangeRatePhase1;
}

/** sales_system secondInstallment = ura + plates + insurance + agent */
export function computeSecondInstallment(input: InvoiceFormTotalsInput): number {
  const ura = computePhaseTwoUraTaxes(input);
  const plates = input.includePhaseTwo ? input.numberPlatesFee : 0;
  const insurance = input.includePhaseTwo ? input.thirdPartyInsurance : 0;
  const agent = input.includePhaseTwo ? input.agencyFees : 0;
  return ura + plates + insurance + agent;
}

/** sales_system grand total = phase1 + secondInstallment */
export function computeGrandTotal(input: InvoiceFormTotalsInput): number {
  return computePhaseOneTotal(input) + computeSecondInstallment(input);
}

export function buildInvoiceFormTotalsInput(params: {
  tickCfMombasa: boolean;
  tickClearance: boolean;
  tickCfKampala: boolean;
  cfMombasa: string;
  clearanceFee: string;
  cfKampala: string;
  ttCharges: string;
  exchangeRatePhase1: string;
  exchangeRateTax: string;
  cifUsd: string;
  vehicleYear: string;
  referenceYear?: number;
  includeTaxToUra: boolean;
  dutyFree: boolean;
  includePhaseTwo: boolean;
  plates: string;
  insurance: string;
  agencyFees: string;
  regFee: string;
  stampDuty: string;
  regForm: string;
}): InvoiceFormTotalsInput {
  const num = (v: string) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  const phase1Rate = num(params.exchangeRatePhase1) || 3835;
  const taxRate = num(params.exchangeRateTax) || phase1Rate;

  return {
    tickCfMombasa: params.tickCfMombasa,
    tickClearance: params.tickClearance,
    tickCfKampala: params.tickCfKampala,
    cfMombasaUsd: num(params.cfMombasa),
    clearanceFeeUsd: num(params.clearanceFee),
    cfKampalaUsd: num(params.cfKampala),
    ttChargesUsd: num(params.ttCharges),
    exchangeRatePhase1: phase1Rate,
    cifUsd: num(params.cifUsd),
    exchangeRateTax: taxRate,
    vehicleYear: num(params.vehicleYear),
    referenceYear: params.referenceYear ?? new Date().getFullYear(),
    includeTaxToUra: params.includeTaxToUra,
    dutyFree: params.dutyFree,
    includePhaseTwo: params.includePhaseTwo,
    numberPlatesFee: num(params.plates) || 714_300,
    thirdPartyInsurance: num(params.insurance),
    agencyFees: num(params.agencyFees) || 400_000,
    registrationFee: num(params.regFee) || 1_500_000,
    stampDuty: num(params.stampDuty) || 18_000,
    regForm: num(params.regForm) || 35_000,
  };
}

/** Fill missing fixed URA fee fields when applying an official database row */
export function deriveMissingUraFeeFields(
  cifUsd: number,
  exchangeRateTax: number,
  existing: Partial<UraTaxComponentFields>,
): Pick<UraTaxComponentFields, 'idf' | 'stampDuty' | 'regForm'> {
  const cv = cifUsd * exchangeRateTax;
  return {
    idf: existing.idf && existing.idf > 0 ? existing.idf : cv > 0 ? cv * 0.01 : 0,
    stampDuty: existing.stampDuty && existing.stampDuty > 0 ? existing.stampDuty : 18_000,
    regForm: existing.regForm && existing.regForm > 0 ? existing.regForm : 35_000,
  };
}

export function fmtUsd(amount: number): string {
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtUgx(amount: number): string {
  return Math.round(amount).toLocaleString('en-US');
}
