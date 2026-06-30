import {
  computePhaseOneTotal,
  computePhaseTwoUraTaxes,
  computeSecondInstallment,
  computeUraTaxBreakdown,
  type InvoiceFormTotalsInput,
} from '@/lib/invoice-form-calculations';

export type BuildInvoiceNotesInput = {
  consigneeName: string;
  consigneePhone: string;
  consigneeAddress: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: string;
  vehicleEngineCC: string;
  chassisNo: string;
  tickCfMombasa: boolean;
  tickClearance: boolean;
  tickCfKampala: boolean;
  cfMombasa: string;
  clearanceFee: string;
  cfKampala: string;
  exchangeRatePhase1: string;
  ttCharges: string;
  includePhaseTwo: boolean;
  includeTaxToUra: boolean;
  dutyFree: boolean;
  plates: string;
  insurance: string;
  agencyFees: string;
  totalsInput: InvoiceFormTotalsInput;
  uraTaxesUgx?: number;
  additionalNotes?: string;
};

function fmtUgx(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function buildSalesSystemInvoiceNotes(input: BuildInvoiceNotesInput): string {
  const lines: string[] = [];
  const phase1Total = computePhaseOneTotal(input.totalsInput);
  const uraUgx = input.uraTaxesUgx ?? computePhaseTwoUraTaxes(input.totalsInput);
  const uraBreakdown = computeUraTaxBreakdown(input.totalsInput);
  const plates = input.includePhaseTwo ? parseFloat(input.plates) || 714_300 : 0;
  const insurance = input.includePhaseTwo ? parseFloat(input.insurance) || 0 : 0;
  const agent = input.includePhaseTwo ? parseFloat(input.agencyFees) || 0 : 0;
  const registrationProcess = computeSecondInstallment(input.totalsInput);
  const rateTax = input.totalsInput.exchangeRateTax;

  lines.push('=== CUSTOMER DETAILS ===');
  lines.push(`Name: ${input.consigneeName}`);
  lines.push(`Phone: ${input.consigneePhone}`);
  lines.push(`Address: ${input.consigneeAddress}`);
  lines.push('');

  lines.push('=== VEHICLE DETAILS ===');
  lines.push(`Make: ${input.vehicleMake || 'Unknown'}`);
  lines.push(`Model: ${input.vehicleModel || 'Unknown'}`);
  lines.push(`Year: ${input.vehicleYear || '2020'}`);
  lines.push(`Engine: ${input.vehicleEngineCC || '0'} CC`);
  lines.push(`Serial Number: ${input.chassisNo || ''}`);
  lines.push('');

  lines.push('=== PHASE 1 (UPFRONT COSTS) ===');
  lines.push(
    `C&F Mombasa: ${input.tickCfMombasa && !input.tickCfKampala ? input.cfMombasa : 'Not selected'}`,
  );
  lines.push(`C&F Kampala: ${input.tickCfKampala ? input.cfKampala : 'Not selected'}`);
  lines.push(
    `Clearance Msa→Kla: ${input.tickClearance && !input.tickCfKampala ? input.clearanceFee : 'Not selected'}`,
  );

  const selected: string[] = [];
  if (input.tickCfMombasa && !input.tickCfKampala) selected.push('C&F Mombasa');
  if (input.tickClearance && !input.tickCfKampala) selected.push('Clearance');
  if (input.tickCfKampala) selected.push('C&F Kampala');
  lines.push(`Phase 1 Selected Options: ${selected.length ? selected.join(', ') : 'None'}`);
  lines.push(`Phase 1 Rate: ${input.exchangeRatePhase1}`);
  lines.push(`TT Charges: ${input.ttCharges || '40'}`);
  lines.push(`Phase 1 Total: ${phase1Total.toFixed(2)} UGX`);
  lines.push('');

  lines.push(`Phase 2 Included: ${input.includePhaseTwo ? 'Yes' : 'No'}`);
  lines.push('=== PHASE 2 (SETTLEMENT) ===');
  lines.push(`Duty Free: ${input.dutyFree ? 'Yes' : 'No'}`);
  lines.push(`Include tax to URA: ${input.includeTaxToUra ? 'Yes' : 'No'}`);
  if (input.dutyFree) {
    lines.push(`Duty fees: UGX ${fmtUgx(uraUgx)}`);
  } else if (input.includeTaxToUra) {
    const usdPart = rateTax > 0 ? uraUgx / rateTax : 0;
    lines.push(`URA Taxes: UGX ${fmtUgx(uraUgx)} (USD ${fmtUgx(usdPart)})`);
  } else {
    lines.push('URA Taxes: Not included');
  }

  if (input.includePhaseTwo) {
    lines.push(`Number Plates: UGX ${fmtUgx(plates)}`);
    lines.push(`3rd Party Insurance: UGX ${fmtUgx(insurance)}`);
    lines.push(`Agency Fees: UGX ${fmtUgx(agent)}`);
  } else {
    lines.push('Number Plates: Not selected');
    lines.push('3rd Party Insurance: Not selected');
    lines.push('Agency Fees: Not selected');
  }
  lines.push(`Registration Process: UGX ${fmtUgx(registrationProcess)}`);
  lines.push('');

  const cv = uraBreakdown.customsValueUgx;
  if (input.dutyFree) {
    lines.push('=== TAX BREAKDOWN ===');
    lines.push(`Registration Fee: ${input.totalsInput.registrationFee.toFixed(2)} UGX`);
    lines.push(`Stamp Duty: ${input.totalsInput.stampDuty.toFixed(2)} UGX`);
    lines.push(`Reg Form: ${input.totalsInput.regForm.toFixed(2)} UGX`);
    lines.push('');
  } else if (cv > 0) {
    lines.push('=== TAX BREAKDOWN ===');
    lines.push(`Customs Value (CV): ${cv.toFixed(2)} UGX`);
    lines.push(`Import Declaration (IDF): ${uraBreakdown.idf.toFixed(2)} UGX`);
    lines.push(`Import Duty: ${uraBreakdown.importDuty.toFixed(2)} UGX`);
    lines.push(`VAT (18%): ${uraBreakdown.vat.toFixed(2)} UGX`);
    lines.push(`Withholding Tax: ${uraBreakdown.withholdingTax.toFixed(2)} UGX`);
    lines.push(`Environmental Levy: ${uraBreakdown.environmentalLevy.toFixed(2)} UGX`);
    lines.push(`Infrastructure Levy: ${uraBreakdown.infrastructureLevy.toFixed(2)} UGX`);
    lines.push(`Registration Fee: ${uraBreakdown.registrationFee.toFixed(2)} UGX`);
    lines.push(`Stamp Duty: ${uraBreakdown.stampDuty.toFixed(2)} UGX`);
    lines.push(`Reg Form: ${uraBreakdown.regForm.toFixed(2)} UGX`);
    lines.push(`Sheet Used: ${uraBreakdown.environmentalLevy > 0 ? 'with surcharge' : 'without surcharge'}`);
    lines.push('');
  }

  const extra = input.additionalNotes?.trim();
  if (extra && !extra.startsWith('=== CUSTOMER DETAILS ===')) {
    lines.push('=== ADDITIONAL NOTES ===');
    lines.push(extra);
    lines.push('');
  }

  return lines.join('\n');
}
