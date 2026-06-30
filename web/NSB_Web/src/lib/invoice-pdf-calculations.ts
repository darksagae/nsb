/** Mirrors sales_system PDFService._buildDesignLabTaxSummarySection calculations. */

import { parseInvoiceNotes, type ParsedInvoiceNotes } from '@/lib/parse-invoice-notes';

export type InvoicePdfInput = {
  invoiceNumber: string;
  createdAt: Date | string;
  paymentDueDate?: Date | string | null;
  consigneeName: string;
  consigneeAddress?: string | null;
  consigneePhone?: string | null;
  consigneeEmail?: string | null;
  consigneeCountry?: string | null;
  chassisNo?: string | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleYear?: number | null;
  vehicleColor?: string | null;
  vehicleTransmission?: string | null;
  vehicleFuelType?: string | null;
  vehicleEngineCC?: number | null;
  cifUsd?: number | null;
  cfMombasaUsd?: number | null;
  clearanceFeeUsd?: number | null;
  cfKampalaUsd?: number | null;
  ttChargesUsd?: number | null;
  exchangeRate?: number | null;
  /** Tax/CV rate — mirrors sales_system invoice.exchangeRate (tax controller). */
  exchangeRatePhase2?: number | null;
  firstInstallmentUgx?: number | null;
  secondInstallmentUgx?: number | null;
  taxesURA?: number | null;
  numberPlatesFee?: number | null;
  thirdPartyInsurance?: number | null;
  agencyFees?: number | null;
  importDutyUgx?: number | null;
  vatUgx?: number | null;
  withholdingTax?: number | null;
  infrastructureLevy?: number | null;
  environmentalLevy?: number | null;
  idfUgx?: number | null;
  registrationFee?: number | null;
  stampDutyUgx?: number | null;
  regFormUgx?: number | null;
  tickCfMombasa?: boolean;
  tickClearance?: boolean;
  tickCfKampala?: boolean;
  includePhaseTwo?: boolean;
  includeTaxToUra?: boolean;
  notes?: string | null;
};

export function fmtMoney(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(amount)) return '0.00';
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDateMdY(d: Date | string | null | undefined): string {
  if (!d) return 'N/A';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return 'N/A';
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  const y = dt.getFullYear();
  return `${m}/${day}/${y}`;
}

export function sanitizeEmail(email?: string | null): string {
  if (!email?.trim()) return 'N/A';
  const e = email.trim();
  if (e.toLowerCase() === 'n/a') return 'N/A';
  if (!e.includes('@')) return e;
  return e.replace(/\+\d{10,}(?=@)/, '');
}

export function isPlaceholderEmail(email?: string | null): boolean {
  if (!email?.trim()) return true;
  const lower = email.trim().toLowerCase();
  return lower === 'n/a' || lower.includes('noemail@') || (lower.includes('noemail') && lower.includes('customer.local'));
}

/** sales_system _modelForPdf — web stores "base / suffix" from sync; normalize to space. */
export function modelForPdf(vehicleModel?: string | null): string {
  if (!vehicleModel?.trim()) return 'N/A';
  const raw = vehicleModel.trim();
  if (raw.includes(' / ')) {
    const [base, ...rest] = raw.split(' / ');
    return `${base} ${rest.join(' ')}`.trim();
  }
  return raw;
}

function numberToWords(amount: number): string {
  const ones = [
    '', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen',
  ];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  const word = (v: number): string => {
    if (v === 0) return '';
    if (v < 20) return ones[v];
    if (v < 100) return `${tens[Math.floor(v / 10)]}${v % 10 !== 0 ? ` ${ones[v % 10]}` : ''}`.trim();
    if (v < 1000) {
      const h = Math.floor(v / 100);
      const r = v % 100;
      return `${ones[h]} hundred${r !== 0 ? ` ${word(r)}` : ''}`.trim();
    }
    if (v < 1_000_000) {
      const th = Math.floor(v / 1000);
      const r = v % 1000;
      return `${word(th)} thousand${r !== 0 ? ` ${word(r)}` : ''}`.trim();
    }
    if (v < 1_000_000_000) {
      const m = Math.floor(v / 1_000_000);
      const r = v % 1_000_000;
      return `${word(m)} million${r !== 0 ? ` ${word(r)}` : ''}`.trim();
    }
    const b = Math.floor(v / 1_000_000_000);
    const r = v % 1_000_000_000;
    return `${word(b)} billion${r !== 0 ? ` ${word(r)}` : ''}`.trim();
  };

  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'zero';
  const s = word(n);
  return s ? `${s[0].toUpperCase()}${s.slice(1)}` : 'zero';
}

export function amountInWordsUgx(amount: number): string {
  return `${numberToWords(amount)} only`;
}

function isPhaseTwoIncluded(invoice: InvoicePdfInput, parsed: ParsedInvoiceNotes): boolean {
  if (parsed.includePhase2 != null) return parsed.includePhase2;
  if (invoice.includePhaseTwo != null) return invoice.includePhaseTwo;

  return (
    (invoice.secondInstallmentUgx ?? 0) > 0 ||
    (invoice.taxesURA ?? 0) > 0 ||
    (invoice.numberPlatesFee ?? 0) > 0 ||
    (invoice.thirdPartyInsurance ?? 0) > 0 ||
    (invoice.agencyFees ?? 0) > 0 ||
    (parsed.secondInstallment ?? 0) > 0 ||
    (parsed.taxesUra ?? 0) > 0 ||
    (parsed.plates ?? 0) > 0 ||
    (parsed.insurance ?? 0) > 0 ||
    (parsed.agent ?? 0) > 0
  );
}

function calculateFirstInstallmentTotal(parsed: ParsedInvoiceNotes, invoice: InvoicePdfInput): number {
  if ((invoice.firstInstallmentUgx ?? 0) > 0) return invoice.firstInstallmentUgx!;
  if (parsed.phase1TotalUgx != null && parsed.phase1TotalUgx > 0) return parsed.phase1TotalUgx;
  const rate = parsed.phase1Rate ?? invoice.exchangeRate ?? 0;
  return 40 * rate;
}

function resolveTaxRate(invoice: InvoicePdfInput, parsed: ParsedInvoiceNotes, phase1Rate: number): number {
  if (invoice.exchangeRatePhase2 != null && invoice.exchangeRatePhase2 > 0) {
    return invoice.exchangeRatePhase2;
  }
  // Sales sync stores tax rate on exchangeRate; phase 1 rate lives in notes.
  if (
    parsed.phase1Rate != null &&
    invoice.exchangeRate != null &&
    Math.abs(invoice.exchangeRate - parsed.phase1Rate) > 0.001
  ) {
    return invoice.exchangeRate;
  }
  return phase1Rate;
}

function resolvePhase1Usd(invoice: InvoicePdfInput, parsed: ParsedInvoiceNotes) {
  let cfMombasaUsd = parsed.cfMombasaUsd ?? 0;
  let clearanceUsd = parsed.clearanceUsd ?? invoice.clearanceFeeUsd ?? 0;
  let cfKampalaUsd = parsed.cfKampalaUsd ?? 0;

  const hasParsedPhase1 =
    parsed.cfMombasaUsd != null || parsed.clearanceUsd != null || parsed.cfKampalaUsd != null;

  if (!hasParsedPhase1) {
    if (invoice.tickCfMombasa) cfMombasaUsd = invoice.cfMombasaUsd ?? 0;
    if (invoice.tickClearance) clearanceUsd = invoice.clearanceFeeUsd ?? 0;
    if (invoice.tickCfKampala) cfKampalaUsd = invoice.cfKampalaUsd ?? 0;
  }

  return { cfMombasaUsd, clearanceUsd, cfKampalaUsd };
}

export type InvoicePdfTotals = {
  phase1Rate: number;
  cfMombasaUsd: number;
  clearanceUsd: number;
  cfKampalaUsd: number;
  ttUsd: number;
  cfMombasaUgx: number;
  clearanceUgx: number;
  cfKampalaUgx: number;
  ttUgx: number;
  phase1TotalUsd: number;
  phase1: number;
  taxesUra: number;
  envLevy: number;
  taxSheet: string;
  includePhase2: boolean;
  numberPlates: number;
  insurance: number;
  agentFees: number;
  registrationProcess: number;
  grandTotal: number;
};

/** Exact mirror of sales_system _buildDesignLabTaxSummarySection math. */
export function computeInvoicePdfTotals(invoice: InvoicePdfInput): InvoicePdfTotals {
  const parsed = parseInvoiceNotes(invoice.notes);
  const includePhase2 = isPhaseTwoIncluded(invoice, parsed);

  const phase1Rate = parsed.phase1Rate ?? invoice.exchangeRate ?? 0;
  const taxRate = resolveTaxRate(invoice, parsed, phase1Rate);
  const { cfMombasaUsd, clearanceUsd, cfKampalaUsd } = resolvePhase1Usd(invoice, parsed);

  const cfMombasaUgx = cfMombasaUsd * phase1Rate;
  const clearanceUgx = clearanceUsd * phase1Rate;
  const cfKampalaUgx = cfKampalaUsd * phase1Rate;
  const ttUsd = parsed.ttUsd ?? 40;
  const ttUgx = ttUsd * phase1Rate;

  const phase1TotalUsd =
    (cfMombasaUsd > 0 ? cfMombasaUsd : 0) +
    (clearanceUsd > 0 ? clearanceUsd : 0) +
    (cfKampalaUsd > 0 ? cfKampalaUsd : 0) +
    ttUsd;

  const phase1 =
    (invoice.firstInstallmentUgx ?? 0) > 0
      ? invoice.firstInstallmentUgx!
      : calculateFirstInstallmentTotal(parsed, invoice);

  const invoiceDate =
    typeof invoice.createdAt === 'string' ? new Date(invoice.createdAt) : invoice.createdAt;

  let cv =
    parsed.cv != null && parsed.cv > 0
      ? parsed.cv
      : (invoice.cifUsd ?? 0) > 0 && taxRate > 0
        ? (invoice.cifUsd ?? 0) * taxRate
        : 0;

  let importDuty = parsed.importDuty ?? 0;
  let vat = parsed.vat ?? 0;
  let wht = parsed.wht ?? 0;
  let infra = parsed.infra ?? 0;
  let idf = parsed.idf ?? 0;
  let regFee = parsed.regFee ?? 0;
  let stamp = parsed.stamp ?? 0;
  let regForm = parsed.regForm ?? 0;
  let envLevy = parsed.envLevy ?? 0;

  if (cv > 0) {
    if (importDuty <= 0) importDuty = cv * 0.25;
    if (vat <= 0) vat = (cv + importDuty) * 0.18;
    if (wht <= 0) wht = cv * 0.06;
    if (infra <= 0) infra = cv * 0.015;
    if (idf <= 0) idf = cv * 0.01;
    if (regFee <= 0) regFee = 1_500_000;
    if (stamp <= 0) stamp = 18_000;
    if (regForm <= 0) regForm = 35_000;
    if (envLevy <= 0) {
      const cutoffYear = invoiceDate.getFullYear() - 10;
      const applicable = (invoice.vehicleYear ?? 0) > 0 && (invoice.vehicleYear ?? 0) <= cutoffYear;
      envLevy = applicable ? cv * 0.5 : 0;
    }
  }

  const storedTaxesUra = invoice.taxesURA ?? 0;
  let taxesUra = storedTaxesUra !== 0 ? storedTaxesUra : (parsed.taxesUra ?? 0);
  if (storedTaxesUra === 0 || invoice.includeTaxToUra === false) {
    taxesUra = 0;
  } else if (taxesUra <= 0 && cv > 0) {
    taxesUra = importDuty + vat + wht + envLevy + infra + idf + regFee + stamp + regForm;
  }

  const taxSheet = envLevy > 0 ? 'with surcharge' : 'without surcharge';

  const numberPlates =
    (invoice.numberPlatesFee ?? 0) !== 0 ? (invoice.numberPlatesFee ?? 0) : (parsed.plates ?? 0);
  const insurance =
    (invoice.thirdPartyInsurance ?? 0) !== 0
      ? (invoice.thirdPartyInsurance ?? 0)
      : (parsed.insurance ?? 0);
  const agentFees =
    (invoice.agencyFees ?? 0) !== 0 ? (invoice.agencyFees ?? 0) : (parsed.agent ?? 0);

  const registrationProcess = includePhase2
    ? (parsed.registrationProcess ?? taxesUra + numberPlates + insurance + agentFees)
    : taxesUra;

  const phase2Extras = includePhase2 ? numberPlates + insurance + agentFees : 0;
  const grandTotal = phase1 + taxesUra + phase2Extras;

  return {
    phase1Rate,
    cfMombasaUsd,
    clearanceUsd,
    cfKampalaUsd,
    ttUsd,
    cfMombasaUgx,
    clearanceUgx,
    cfKampalaUgx,
    ttUgx,
    phase1TotalUsd,
    phase1,
    taxesUra,
    envLevy,
    taxSheet,
    includePhase2,
    numberPlates,
    insurance,
    agentFees,
    registrationProcess,
    grandTotal,
  };
}
